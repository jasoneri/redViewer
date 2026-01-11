#!/usr/bin/python
# -*- coding: utf-8 -*-
import re
from pathlib import Path
from urllib.parse import quote

from infra import backend

# 支持的图片扩展名
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}


class BookCursor:
    head = 0
    static = "/static/"

    def __init__(self, book_name, pages, sort_func=None):
        self.book_name = book_name
        self._pages = self._sort(pages, sort_func)
        self.tail = len(pages)

    @staticmethod
    def _sort(pages, func=None):
        def _by_int(p):
            _int = re.search(r'\d+', p)
            if bool(_int):
                return int(_int.group())
            return 0
        func = func or _by_int
        return sorted(pages, key=func)

    def get(self, cursor=None):
        return [f"{self.static}{quote(self.book_name)}/{pages}"
                for pages in self._pages[self.head:self.tail]]


class KemonoBookCursor(BookCursor):

    def __init__(self, u_s, book_name, pages, sort_func=None):
        self.u_s = u_s
        super(KemonoBookCursor, self).__init__(book_name, pages, sort_func)
        self.static = f"/static_kemono/{u_s}/"


def build_book_path(base_path: Path, book: str, ep: str = None) -> Path:
    """构建书籍路径的统一方法"""
    cbz_mode = backend.config.cbz_mode
    ext = ".cbz" if cbz_mode else ""
    if ep:
        return base_path / f"{book}/{ep}{ext}"
    return base_path / f"{book}/{book}{ext}" if cbz_mode else base_path / book
