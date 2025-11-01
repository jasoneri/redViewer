#!/usr/bin/python
# -*- coding: utf-8 -*-
import os
import shutil
import asyncio
from fastapi import APIRouter, Query
from pydantic import BaseModel
from starlette.requests import Request
from starlette.responses import JSONResponse
from send2trash import send2trash

from utils import conf, executor
from utils.butils import QuerySort
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
    # TODO[1](2025-11-01): 前端做一个刷新按钮，更新掉前端的 pages
    pages = pages_obj.get("pages")
    if pages is None:
        return JSONResponse(status_code=404, content=f"book[{book_name}] not exist")
    return pages


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
    # 显示调用，并与 watchdog 监听操作幂等 
    await lib_mgr.active_cache.remove_book_async(book.name)
    await lib_mgr.active_pages_handler.invalidate(book.name)
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
