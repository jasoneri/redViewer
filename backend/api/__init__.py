#!/usr/bin/python
# -*- coding: utf-8 -*-
"""API Module - FastAPI 应用初始化"""

import asyncio
import fnmatch
from urllib.parse import urlparse
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from infra import backend
from core import lib_mgr
from storage import StorageBackendFactory
from api.routes.comic import index_router
from api.routes.root import root_router
from utils.cbz_cache import close_cbz_cache

staticFiles = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    main_loop = asyncio.get_running_loop()
    await lib_mgr.switch_library(backend.config.comic_path, main_loop)
    yield
    if lib_mgr.observer and lib_mgr.observer.is_alive():
        lib_mgr.observer.stop()
        lib_mgr.observer.join()
    close_cbz_cache()


def create_app() -> FastAPI:
    app = FastAPI(
        title="rV", description="https://github.com/jasoneri/redViewer", version="1.5.2",
        docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None, lifespan=lifespan
    )
    register_cors(app)
    register_static_file(app)
    register_router(app)
    register_hook(app)
    return app


def register_static_file(app: FastAPI) -> None:
    global staticFiles
    storage = StorageBackendFactory.create(backend.config.comic_path)
    if storage.supports_static_mount():
        staticFiles = StaticFiles(directory=str(backend.config.comic_path))
        app.mount("/static", staticFiles, name="static")
    kemono_path = backend.config.kemono_path
    if kemono_path and kemono_path.exists():
        app.mount("/static_kemono", StaticFiles(directory=str(kemono_path)), name="static_kemono")


def register_router(app: FastAPI) -> None:
    app.include_router(index_router, prefix="", tags=['comic'])
    kemono_path = backend.config.kemono_path
    if kemono_path and kemono_path.exists():
        from api.routes.kemono import index_router as kemono_index_router
        app.include_router(kemono_index_router, prefix="", tags=['kemono'])
    app.include_router(root_router, prefix="", tags=['root'])


def register_cors(app: FastAPI) -> None:
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def check_whitelist(value: str, whitelist: list) -> bool:
    normalized = value.strip().lower()
    if value in ("localhost", "127.0.0.1"):
        return True
    return any(fnmatch.fnmatch(normalized, (p or "").strip().lower()) for p in whitelist)


def register_hook(app: FastAPI) -> None:
    @app.middleware("http")
    async def logger_request(request: Request, call_next) -> Response:
        whitelist = backend.config.whitelist
        if whitelist:
            origin_header = request.headers.get("origin", "") or ""
            parsed = urlparse(origin_header) if origin_header else None
            origin_host = parsed.hostname if parsed and parsed.hostname else ""
            cf_ip = request.headers.get("cf-connecting-ip", "")
            xff = request.headers.get("x-forwarded-for", "")
            client_ip = cf_ip or xff.split(",")[0].strip() or (request.client.host if request.client else "")
            if not (check_whitelist(origin_host, whitelist) or check_whitelist(client_ip, whitelist)):
                return Response(status_code=403, content="Access denied")
        response = await call_next(request)
        if staticFiles and request.url.path.startswith("/comic/conf") and request.method == "POST" and response.status_code in (200, 204):
            staticFiles.directory = str(backend.config.comic_path)
            staticFiles.all_directories = staticFiles.get_directories(staticFiles.directory, None)
        return response
