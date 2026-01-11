#!/usr/bin/python
# -*- coding: utf-8 -*-
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from storage.base import StorageBackend


class BookData:
    def __init__(self, book: str, ep: str, mtime: float, first_img: str = None, ero=0, backend: 'StorageBackend' = None):
        self.book = book
        self.ep = ep
        self.mtime = mtime
        self.first_img = first_img
        self.ero = ero
        self.backend = backend

    @property
    def name(self) -> str:
        """display_name: 用于排序和显示"""
        return f"{self.book}_{self.ep}" if self.ep else self.book

    @property
    def fs_path(self) -> str:
        """相对于 scan_path 的文件系统路径"""
        return f"{self.book}/{self.ep}" if self.ep else self.book

    def to_api(self):
        first_img = self.backend.get_image_url(self.book, self.ep, self.first_img) if self.first_img and self.backend else None
        return {"book": self.book, "ep": self.ep, "first_img": first_img}


class BookSort:
    """书籍章节排序辅助类"""
    section_regex = re.compile(r'_第?(\d+\.?\d*)([话卷])')
    volume_regex = re.compile(r'_第?(\d+\.?\d*)卷')

    @classmethod
    def by_section(cls, book_with_section):
        _s = cls.section_regex.search(book_with_section)
        book_name = book_with_section.split('_')[0]
        if not _s:
            return book_name, 2, 0
        num = float(_s.group(1))
        type_ = _s.group(2)
        priority = 0 if type_ == '卷' else 1
        if type_ == '卷' and '番外' in book_with_section:
            return book_name, priority, num + 0.5
        return book_name, priority, num

    @classmethod
    def get_sort_key(cls, book):
        name, priority, num = cls.by_section(book)
        return (name, priority, num)


class QuerySort:
    """Comic 查询排序类"""
    sort_funcs = {
        'time': lambda x: x.mtime,
        'name': lambda x: x.name
    }
    
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