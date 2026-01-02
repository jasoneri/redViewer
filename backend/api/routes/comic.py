#!/usr/bin/python
# -*- coding: utf-8 -*-
import shutil
import asyncio
import platform
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, Query
from pydantic import BaseModel
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from send2trash import send2trash

from utils import conf, executor
from utils.cbz_cache import get_cbz_cache
from models import QuerySort
from core import lib_mgr, BooksAggregator


index_router = APIRouter(prefix='/comic')


async def ensure_library_loaded():
    if not lib_mgr.active_path:
        await lib_mgr.switch_library(conf.comic_path)


@index_router.get("/")
async def get_books(request: Request, sort: str = Query(None)):
    await ensure_library_loaded()
    cache = lib_mgr.active_cache
    if not cache or not cache.books_index:
        return JSONResponse("no books exists", status_code=404)

    books = list(cache.books_index.values())
    sort = sort or "time_desc"
    qs = QuerySort(sort)
    if qs.func == 'name':
        qs.check_name(books)
    
    sorted_books = sorted(books, key=qs.sort_key, reverse=qs.reverse)
    return BooksAggregator(sorted_books).to_result()


class ConfContent(BaseModel):
    path: str
    kemono_path: str = None


@index_router.get("/conf")
async def get_conf():
    """返回结构化配置 JSON"""
    return {
        "path": str(conf.comic_path),
        "kemono_path": str(conf.kemono_path) if conf.kemono_path else ""
    }


@index_router.post("/conf")
async def update_conf(conf_content: ConfContent):
    """接收 JSON 对象更新配置"""
    # 校验 path 必须存在
    path = Path(conf_content.path)
    if not path.exists() or not path.is_dir():
        return JSONResponse(f"路径不存在: {conf_content.path}", status_code=400)
    
    # 校验 kemono_path（如果提供）
    if conf_content.kemono_path:
        kemono_path = Path(conf_content.kemono_path)
        if not kemono_path.exists() or not kemono_path.is_dir():
            return JSONResponse(f"路径不存在: {conf_content.kemono_path}", status_code=400)
    
    # 使用 **kw 方式更新
    conf.update(path=conf_content.path,
                **({'kemono_path': conf_content.kemono_path} if conf_content.kemono_path else {}))
    conf.check_cbz()
    main_loop = asyncio.get_running_loop()
    await lib_mgr.switch_library(conf.comic_path, main_loop)
    if not lib_mgr.active_cache.books_index:
        return JSONResponse("update success, but no books exists in new path", status_code=404)
    return "update conf and switched library successfully"


# 系统级目录黑名单
SYSTEM_DIRS = {'$Recycle.Bin', 'System Volume Information', '$RECYCLE.BIN',
               'Recovery', 'ProgramData', 'Windows', 'Config.Msi'}


@index_router.get("/filesystem")
async def list_filesystem(path: str = None):
    """列出目录内容，支持多平台"""
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


@index_router.get("/switch_ero")
@index_router.post("/switch_ero")
async def switch_ero(request: Request, enable: bool = True):
    if request.method == "GET":
        return lib_mgr.ero
    main_loop = asyncio.get_running_loop()
    await lib_mgr.switch_library(conf.comic_path, main_loop, ero=enable)
    return {"ero": enable, "scan_path": str(lib_mgr.active_cache.scan_path)}


@index_router.get("/{book_name}")
async def get_book(request: Request, book_name: str, ep: str = None, hard_refresh: bool = False):
    pages_obj = await lib_mgr.active_pages_handler.get_pages(book_name, ep, hard_refresh)
    if not pages_obj or not pages_obj.get("pages"):
        return JSONResponse(status_code=404, content=f"book[{book_name}] not exist")
    return pages_obj.get("pages")


class Book(BaseModel):
    book: str
    ep: Optional[str] = None
    handle: str


@index_router.post("/handle")
async def handle(request: Request, book: Book):
    cache = lib_mgr.active_cache
    book_name, ep_name = book.book, book.ep or ""
    
    book_path = cache.scan_strategy.build_handle_path(cache.scan_path, book_name, ep_name)
    
    if not book_path.exists():
        return JSONResponse(status_code=404, content=f"book[{book_name}] not exist")
    
    cache.scan_strategy.invalidate_cache(book_path)
    
    lp = asyncio.get_event_loop()
    if book.handle == "del":
        await lp.run_in_executor(executor, book_path.unlink if book_path.is_file() else lambda: shutil.rmtree(book_path))
    elif book.handle == "remove":
        lp.run_in_executor(executor, send2trash, book_path)
    else:
        dest = conf.to_sv_path / book_name / book_path.name if ep_name else conf.to_sv_path / book_path.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        await lp.run_in_executor(executor, shutil.move, book_path, dest)
    
    cache.set_handle(book_name, ep_name, book.handle)
    return {"book": book_name, "ep": book.ep, "handled": f"{book.handle}d"}


@index_router.get("/cbz_image/{book_name}/{image_path:path}")
async def get_cbz_image(book_name: str, image_path: str):
    """从 .cbz 文件中提取图片（使用缓存优化）"""
    scan_path = lib_mgr.active_cache.scan_path
    
    # 无章节模式：book_name本身是.cbz文件名，实际在同名目录下
    if book_name.lower().endswith('.cbz'):
        dir_name = book_name[:-4]  # 去掉 .cbz 后缀
        cbz_path = scan_path / dir_name / book_name
    else:
        cbz_path = scan_path / book_name / image_path.split('/')[0]
    
    if not cbz_path.is_file() or cbz_path.suffix.lower() != '.cbz':
        return JSONResponse(status_code=404, content="CBZ file not found")
    
    cbz_cache = get_cbz_cache()
    loop = asyncio.get_event_loop()
    image_data = await loop.run_in_executor(executor, cbz_cache.extract_image, cbz_path, image_path)
    
    if image_data is None:
        return JSONResponse(status_code=404, content="Image not found in CBZ")
    
    ext = Path(image_path).suffix.lower()
    mime_types = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'
    }
    media_type = mime_types.get(ext, 'application/octet-stream')
    
    return Response(content=image_data, media_type=media_type)
