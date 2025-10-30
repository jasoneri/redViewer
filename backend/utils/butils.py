#!/usr/bin/python
# -*- coding: utf-8 -*-
import re
from urllib.parse import quote


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
        # 当内容非常非常多时，考虑后端根据游标返回批次内容时使用, 有游标时需要处理tail与step的比较, head递进step再比较tail（step与前端保持一致）
        return [f"{self.static}{quote(self.book_name)}/{pages}"
                for pages in self._pages[self.head:self.tail]]


class BookSort:
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


class KemonoBookCursor(BookCursor):

    def __init__(self, u_s, book_name, pages, sort_func=None):
        self.u_s = u_s
        super(KemonoBookCursor, self).__init__(book_name, pages, sort_func)
        self.static = f"/static_kemono/{u_s}/"
