#!/usr/bin/python
# -*- coding: utf-8 -*-
import os
import shutil
import asyncio
from pathlib import Path
from fastapi import APIRouter, Query
from pydantic import BaseModel
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from send2trash import send2trash

from utils import conf, executor
from utils.butils import QuerySort
from utils.cbz_cache import get_cbz_cache
from .cache import lib_mgr


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
    
    # 执行排序
    sorted_books = sorted(books, key=qs.sort_key, reverse=qs.reverse)
    result = [book.to_api() for book in sorted_books]
    return result


class ConfContent(BaseModel):
    text: str


@index_router.get("/conf")
@index_router.post("/conf")
async def duel_conf(request: Request, conf_content: ConfContent = None):
    if request.method == "GET":
        return conf.get_content()
    else:
        conf.update(conf_content.text)
        main_loop = asyncio.get_running_loop()
        await lib_mgr.switch_library(conf.comic_path, main_loop)
        if not lib_mgr.active_cache.books_index:
             # 这里可以返回 200 OK 但提示为空，或者保持 404
             return JSONResponse("update success, but no books exists in new path", status_code=404)
        return "update conf and switched library successfully"


@index_router.get("/{book_name}")
async def get_book(request: Request, book_name: str, hard_refresh: bool = False):
    pages_obj = await lib_mgr.active_pages_handler.get_pages(book_name, hard_refresh)
    # TODO[3](2025-11-01): 可能在下载某本多页途中触发pages进active_pages_handler的缓存，解决想法是前端做一个刷新按钮，请求带 hard_refresh 更新掉前端的 pages
    if not pages_obj or not pages_obj.get("pages"):
        return JSONResponse(status_code=404, content=f"book[{book_name}] not exist")
    return pages_obj.get("pages")


class Book(BaseModel):
    name: str
    handle: str  # save/remove/del


@index_router.post("/handle")
async def handle(request: Request, book: Book):
    book_path = conf.comic_path.joinpath(book.name)
    if not os.path.exists(book_path):
        return JSONResponse(status_code=404, content=f"book[{book.name}] not exist]")
    with open(conf.handle_path.joinpath("record.txt"), "a+", encoding="utf-8") as f:
        f.writelines(f"<{book.handle}>{book.name}\n")
    lp = asyncio.get_event_loop()
    if book.handle == "del":
        await lp.run_in_executor(executor, shutil.rmtree, book_path)
        return {"path": book.name, "handled": f"{book.handle}eted"}
    elif book.handle == "remove":
        lp.run_in_executor(executor, send2trash, book_path)
        return JSONResponse({"path": book.name, "handled": f"{book.handle}d"})
    else:
        _ = await lp.run_in_executor(executor, shutil.move, book_path, conf.handle_path.joinpath(book.handle, book.name))
        return {"path": _, "handled": f"{book.handle}d"}


@index_router.get("/cbz_image/{book_name}/{image_path:path}")
async def get_cbz_image(book_name: str, image_path: str):
    """从 .cbz 文件中提取图片（使用缓存优化）"""
    cbz_path = conf.comic_path.joinpath(book_name)
    
    # 检查文件是否存在且是 .cbz 文件
    if not cbz_path.exists() or not cbz_path.is_file() or cbz_path.suffix.lower() != '.cbz':
        return JSONResponse(status_code=404, content="CBZ file not found")
    
    # 使用 CBZCache 提取图片（性能优化）
    cbz_cache = get_cbz_cache()
    loop = asyncio.get_event_loop()
    image_data = await loop.run_in_executor(executor, cbz_cache.extract_image, cbz_path, image_path)
    
    if image_data is None:
        return JSONResponse(status_code=404, content="Image not found in CBZ")
    
    # 根据文件扩展名确定 MIME 类型
    ext = Path(image_path).suffix.lower()
    mime_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
    }
    media_type = mime_types.get(ext, 'application/octet-stream')
    
    return Response(content=image_data, media_type=media_type)
