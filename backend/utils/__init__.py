#!/usr/bin/python
# -*- coding: utf-8 -*-
"""Utils Module - 工具函数和全局变量

注意：Conf 类已移除，配置现在通过 infra.backend.config 访问。
为保持向后兼容，此模块导出 backend.config 的便捷别名。
"""

import pathlib
import hashlib
from concurrent.futures import ThreadPoolExecutor

from infra import backend

basepath = pathlib.Path(__file__).parent

# 向后兼容：导出 conf_dir
conf_dir = backend.conf_dir


class Var:
    doujinshi = "本子"


def md5(string):
    return hashlib.md5(string.encode('utf-8')).hexdigest()


def extract_parent_and_chapter(book_path: pathlib.Path, comic_path: pathlib.Path) -> tuple:
    try:
        rel_path = book_path.relative_to(comic_path)
        if len(rel_path.parts) == 2:
            parent_name, chapter_name = rel_path.parts[0], rel_path.parts[1].replace('.cbz', '')
            return (parent_name, chapter_name, f"{parent_name}_{chapter_name}")
        elif len(rel_path.parts) == 1:
            name = rel_path.parts[0].replace('.cbz', '')
            return (name, name, name)
        return (book_path.name, book_path.name, book_path.name)
    except (ValueError, IndexError):
        name = book_path.name.replace('.cbz', '')
        return (name, name, name)


executor = ThreadPoolExecutor(max_workers=12)
