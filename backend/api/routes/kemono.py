#!/usr/bin/python
# -*- coding: utf-8 -*-
import hashlib
import os
import shutil
import json

from fastapi import APIRouter, Query
from starlette.requests import Request

from utils import conf
from utils.butils import KemonoBookCursor
from api.schemas import not_found, ErrorMessages, KemonoHandleRequest

index_router = APIRouter(prefix='/kemono')
step = 25   # step与前端保持一致


class Cache:
    ...


global cache
cache = Cache()


@index_router.get("/")
async def get_artists(request: Request):
    artists = list(map(lambda _: _.name,
                   filter(lambda x: x.is_dir() and not x.name.startswith("__"), conf.kemono_path.iterdir())))
    if not artists:
        return not_found(ErrorMessages.NO_ARTISTS)
    return artists


@index_router.get("/book/")
async def _book(request: Request,
                u_s: str = Query(..., title="user_service"),
                book: str = Query(None),
                sort: str = Query(None)):
    if not book:
        return await get_books(u_s, sort)
    return await get_book(u_s, book)


class KemonoQuerySort:
    """Kemono 专用排序类（处理字符串列表）"""
    name = staticmethod(lambda x: x)
    asc = False
    desc = True

    def __init__(self, u_s):
        self.time = staticmethod(lambda x: os.path.getmtime(conf.kemono_path.joinpath(f"{u_s}/{x}")))


async def get_books(u_s, sort):
    sort = sort or "name_desc"
    func, _sort = sort.split("_")
    books = list(conf.kemono_path.joinpath(u_s).iterdir())
    if not books:
        return not_found(ErrorMessages.NO_ARTISTS)
    books = [book.name for book in books]
    query_sort = KemonoQuerySort(u_s)
    return sorted(books, key=getattr(query_sort, func), reverse=getattr(query_sort, _sort))


async def get_book(u_s, book):
    book_md5 = hashlib.md5(f"{u_s}/{book}".encode('utf-8')).hexdigest()
    if not hasattr(cache, book_md5):
        record_f = conf.kemono_path.joinpath(f'__sorted_record/{u_s}/{book}.json')
        if record_f.exists():
            with open(record_f, 'r', encoding='utf-8') as f:
                record = json.load(f)
            sort_func = (lambda _: record.index(_))
        else:
            sort_func = None
        setattr(cache, book_md5,
                KemonoBookCursor(u_s, book, os.listdir(
                    conf.kemono_path.joinpath(f"{u_s}/{book}")), sort_func=sort_func))
    book = getattr(cache, book_md5)
    return book.get()


black_list_file = conf.kemono_path.joinpath("blacklist.json")


async def black_list_handle(book):
    with open(black_list_file, 'r+', encoding='utf-8') as fp:
        black_list = json.load(fp)
        if f"{book.u_s}/{book.name}" not in black_list:
            black_list.append(f"{book.u_s}/{book.name}")
        fp.seek(0)
        fp.truncate()
        json.dump(black_list, fp, ensure_ascii=False)


@index_router.post("/handle")
async def handle(request: Request, book: KemonoHandleRequest):
    await black_list_handle(book)
    book_path = conf.kemono_path.joinpath(f"{book.u_s}/{book.name}")
    with open(conf.kemono_path.joinpath("record.txt"), "a+", encoding="utf-8") as f:
        f.writelines(f"<{book.handle}>{book.u_s}/{book.name}\n")
    if book.handle == "del":
        shutil.rmtree(book_path)
        return {"path": f"{book.u_s}{book.name}", "handled": f"{book.handle}eted"}
    if not os.path.exists(book_path):
        return not_found(ErrorMessages.book_not_exist(book.name))
    fin_handle_p = conf.kemono_path.joinpath("__handle", book.handle, book.u_s)
    fin_handle_p.mkdir(exist_ok=True, parents=True)
    _ = shutil.move(book_path, fin_handle_p.joinpath(book.name))
    return {"path": _, "handled": f"{book.handle}d"}
