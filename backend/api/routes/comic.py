#!/usr/bin/python
# -*- coding: utf-8 -*-
"""Comic Router - 漫画相关 API"""

import asyncio
import platform
from pathlib import Path
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from starlette.requests import Request
from starlette.responses import Response

from infra import backend
from utils import executor
from utils.file_handlers import execute_handle, cleanup_empty_dir
from utils.cbz_cache import get_cbz_cache
from api.schemas import not_found, no_content, bad_request, ErrorMessages, get_mime_type, validate_directory, ComicHandleRequest
from models import QuerySort
from core import lib_mgr, BooksAggregator
from api.routes.root import require_lock


index_router = APIRouter(prefix='/comic')


async def ensure_library_loaded():
    if not lib_mgr.active_path:
        await lib_mgr.switch_library(backend.config.comic_path)


@index_router.get("/")
async def get_books(request: Request, sort: str = Query(None)):
    await ensure_library_loaded()
    cache = lib_mgr.active_cache
    if not cache or not cache.books_index:
        return no_content(ErrorMessages.NO_BOOKS)
    books = list(cache.books_index.values())
    qs = QuerySort(sort or "time_desc")
    if qs.func == 'name':
        qs.check_name(books)
    return BooksAggregator(sorted(books, key=qs.sort_key, reverse=qs.reverse)).to_result()


class ConfContent(BaseModel):
    path: str
    kemono_path: str = None


@index_router.get("/conf")
async def get_conf():
    return {
        "path": str(backend.config.comic_path),
        "kemono_path": str(backend.config.kemono_path) if backend.config.kemono_path else ""
    }


@index_router.post("/conf")
@require_lock("config_path")
async def update_conf(conf_content: ConfContent):
    if not backend.config.is_writable():
        raise HTTPException(403, "云平台模式下不支持修改配置")
    path = Path(conf_content.path)
    if error := validate_directory(path):
        return error
    if conf_content.kemono_path:
        if error := validate_directory(Path(conf_content.kemono_path)):
            return error
    backend.config.update(path=conf_content.path, **(
        {'kemono_path': conf_content.kemono_path} if conf_content.kemono_path else {}))
    if hasattr(backend.config, 'check_cbz_mode'):
        backend.config.check_cbz_mode()
    main_loop = asyncio.get_running_loop()
    await lib_mgr.switch_library(backend.config.comic_path, main_loop, ero=lib_mgr.ero)
    if not lib_mgr.active_cache.books_index:
        return no_content("update success, but no books exists in new path")
    return "update conf and switched library successfully"


SYSTEM_DIRS = {'$Recycle.Bin', 'System Volume Information', '$RECYCLE.BIN', 'Recovery', 'ProgramData', 'Windows', 'Config.Msi'}


@index_router.get("/filesystem")
async def list_filesystem(path: str = None):
    is_win = platform.system() == "Windows"
    roots = [f"{d}:\\" for d in __import__('string').ascii_uppercase if Path(f"{d}:\\").exists()] if is_win else ["/"]
    if not path:
        return {"current": None, "parent": None, "directories": roots if is_win else [], "roots": roots}
    p = Path(path)
    if not p.exists() or not p.is_dir():
        return {"error": "路径不存在", "roots": roots}
    def is_valid(item):
        try:
            return item.is_dir() and not item.name.startswith(('.', '$')) and item.name not in SYSTEM_DIRS and list(item.iterdir()) is not None
        except PermissionError:
            return False
    try:
        dirs = sorted(item.name for item in p.iterdir() if is_valid(item))
    except PermissionError:
        return {"error": "无权限访问", "roots": roots}
    return {"current": str(p), "parent": str(p.parent) if p.parent != p else None, "directories": dirs, "roots": roots}


@index_router.post("/force_rescan")
@require_lock("force_rescan")
async def force_rescan():
    await ensure_library_loaded()
    result = await lib_mgr.force_rescan(asyncio.get_running_loop())
    return bad_request(result) if "error" in result else result


@index_router.get("/switch_ero")
async def get_ero_status():
    return lib_mgr.ero


@index_router.post("/switch_ero")
@require_lock("switch_doujin")
async def switch_ero(enable: bool = True):
    await lib_mgr.switch_library(backend.config.comic_path, asyncio.get_running_loop(), ero=enable)
    return {"ero": enable, "scan_path": str(lib_mgr.active_cache.scan_path)}


@index_router.get("/{book_name}")
async def get_book(request: Request, book_name: str, ep: str = None, hard_refresh: bool = False):
    pages_obj = await lib_mgr.active_pages_handler.get_pages(book_name, ep, hard_refresh)
    if not pages_obj or not pages_obj.get("pages"):
        return not_found(ErrorMessages.book_not_exist(book_name))
    return pages_obj.get("pages")


def _handle_and_cleanup(book_path: Path, handle_type: str, dest: Path, series_dir: Path):
    execute_handle(handle_type, book_path, dest)
    cleanup_empty_dir(series_dir)


@index_router.post("/handle")
@require_lock("book_handle")
async def handle(request: Request, book: ComicHandleRequest):
    cache = lib_mgr.active_cache
    book_name, ep_name = book.book, book.ep or ""
    book_path = cache.backend.build_handle_path(cache.scan_path, book_name, ep_name)
    if not book_path.exists():
        return not_found(ErrorMessages.book_not_exist(book_name))
    cache.backend.invalidate_book_cache(book_path)
    series_dir = book_path.parent if ep_name else None
    dest = cache.backend.build_save_path(book_name, book_path.name if ep_name else "")
    lp = asyncio.get_event_loop()
    lp.run_in_executor(executor, _handle_and_cleanup, book_path, book.handle, dest, series_dir)
    cache.set_handle(book_name, ep_name, book.handle)
    return {"book": book_name, "ep": book.ep, "handled": f"{book.handle}d"}


@index_router.get("/cbz_image/{book_name}/{image_path:path}")
async def get_cbz_image(book_name: str, image_path: str):
    scan_path = lib_mgr.active_cache.scan_path
    if book_name.lower().endswith('.cbz'):
        cbz_path = scan_path / book_name[:-4] / book_name
    else:
        cbz_path = scan_path / book_name / image_path.split('/')[0]
    if not cbz_path.is_file() or cbz_path.suffix.lower() != '.cbz':
        return not_found("CBZ file not found")
    image_data = await asyncio.get_event_loop().run_in_executor(executor, get_cbz_cache().extract_image, cbz_path, image_path)
    if image_data is None:
        return not_found("Image not found in CBZ")
    return Response(content=image_data, media_type=get_mime_type(Path(image_path).suffix.lower()))
