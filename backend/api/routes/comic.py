#!/usr/bin/python
# -*- coding: utf-8 -*-
import hashlib
import os
import shutil
import random
import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, Query
from pydantic import BaseModel
from starlette.requests import Request
from starlette.responses import JSONResponse
from send2trash import send2trash

from utils import conf, BookCursor, BookSort, quote

index_router = APIRouter(prefix='/comic')
step = 25   # step与前端保持一致
executor = ThreadPoolExecutor(max_workers=12)


class Cache:
    ...


global cache
cache = Cache()


class BookData:
    def __init__(self, idx, name: str, mtime: float):
        self.idx = idx
        self.name = name
        self.mtime = mtime
        self.first_img = None
        self._first_img_loaded = False
    
    def to_api(self):
        return {
            "book_name": self.name,
            "first_img": f"/static/{quote(self.name)}/{self.first_img}" if self.first_img else None
        }


class BooksHandler:
    def __init__(self, comic_path):
        self.comic_path = comic_path
        self.books_index = {}
        self.idx_cache = []
        self.query_sort: QuerySort = None
        self._path_mtime = 0
        self._cache_initialized = False
    
    def _is_cache_valid(self):
        if not self._cache_initialized:
            return False
        return os.path.getmtime(self.comic_path) == self._path_mtime
    
    async def get_books_index(self):
        if not self._is_cache_valid():
            await self.scan_books_index()
            self._path_mtime = os.path.getmtime(self.comic_path)
            self._cache_initialized = True
    
    async def scan_books_index(self):
        def _scan():
            self.books_index.clear()
            with os.scandir(self.comic_path) as entries:
                idx = 0
                for entry in entries:
                    if entry.is_dir():
                        self.books_index[idx] = BookData(idx, entry.name, entry.stat().st_mtime)
                        idx += 1
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, _scan)

    async def sort_books_index(self):
        def _sort():
            sorted_books = sorted(self.books_index.values(), 
                                  key=self.query_sort.sort_key, reverse=self.query_sort.reverse)
            return [book.idx for book in sorted_books]
        sample_books = random.choices(list(self.books_index.values()), k=min(5, len(self.books_index)))
        self.query_sort.check_name(sample_books)
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, _sort)

    async def load_all_first_images(self):
        """并发获取所有书籍的第一张图片"""
        async def load_single_first_img(book):
            def _get_first_img():
                try:
                    with os.scandir(self.comic_path.joinpath(book.name)) as entries:
                        return next(entries).name
                except (StopIteration, OSError):
                    return None
            loop = asyncio.get_event_loop()
            book.first_img = await loop.run_in_executor(executor, _get_first_img)
            book._first_img_loaded = True
        tasks = [load_single_first_img(book) for book in self.books_index.values()]
        await asyncio.gather(*tasks)


class QuerySort:
    # 类级别的排序函数映射
    sort_funcs = {
        'time': lambda x: x.mtime,
        'name': lambda x: x.name
    }
    
    # 类级别的排序方向映射
    sort_directions = {
        'asc': False,
        'desc': True
    }
    
    def __init__(self, sort_str):
        self.sort = sort_str
        func, _sort = sort_str.split("_")
        self.func = func
        self._sort = _sort
    
    @property
    def sort_key(self):
        return self.sort_funcs[self.func]
    
    @property
    def reverse(self):
        return self.sort_directions[self._sort]
    
    @classmethod
    def check_name(cls, books_data):
        if all(bool(BookSort.section_regex.search(book.name)) for book in books_data):
            cls.sort_funcs['name'] = lambda x: BookSort.get_sort_key(x.name)


bh = BooksHandler(conf.comic_path)


@index_router.get("/")
async def get_books(request: Request, sort: str = Query(None)):
    sort = sort or "time_desc"  # 默认时间倒序
    
    bh.query_sort = QuerySort(sort)
    
    # 步骤1: 异步获取全书目录索引
    await bh.get_books_index()
    if not bh.books_index:
        return JSONResponse("no books exists", status_code=404)
    
    # 并发：排序和获取第一张图片同时进行
    sort_task = bh.sort_books_index()
    load_task = bh.load_all_first_images()
    
    bh.idx_cache, _ = await asyncio.gather(sort_task, load_task)
    
    # 如果名称格式检查改变了排序方式，重新排序
    if not hasattr(bh, 'sort_type_cache') or bh.sort_type_cache != sort:
        bh.idx_cache = await bh.sort_books_index()
        bh.sort_type_cache = sort

    result = [bh.books_index[idx].to_api() for idx in bh.idx_cache]
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
        return "update conf successfully"


@index_router.get("/{book_name}")
async def get_book(request: Request, book_name: str):
    book_md5 = hashlib.md5(book_name.encode('utf-8')).hexdigest()
    book_path = conf.comic_path.joinpath(book_name)
    if not os.path.exists(book_path):
        if hasattr(cache, book_md5):
            return getattr(cache, book_md5).get()
        return JSONResponse(status_code=404, content=f"book[{book_name}] not exist]")
    if not hasattr(cache, 'order'):
        cache.order = []
    if hasattr(cache, book_md5):
        cache.order.remove(book_md5)
        cache.order.append(book_md5)
    else:
        cache_attrs = [a for a in vars(cache) if not a.startswith('_')]
        if len(cache_attrs) > 30:
            remove_keys = cache.order[:len(cache_attrs)//2]
            for key in remove_keys:
                delattr(cache, key)
                cache.order.remove(key)
        setattr(cache, book_md5, BookCursor(book_name, os.listdir(conf.comic_path.joinpath(book_name))))
        cache.order.append(book_md5)
    book = getattr(cache, book_md5)
    return book.get()


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
    if book.handle == "del":
        shutil.rmtree(book_path)
        return {"path": book.name, "handled": f"{book.handle}eted"}
    elif book.handle == "remove":
        asyncio.get_event_loop().run_in_executor(executor, send2trash, book_path)
        return JSONResponse({"path": book.name, "handled": f"{book.handle}d"})
    else:
        _ = shutil.move(book_path, conf.handle_path.joinpath(book.handle, book.name))
        return {"path": _, "handled": f"{book.handle}d"}
