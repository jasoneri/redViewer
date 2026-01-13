#!/usr/bin/python
# -*- coding: utf-8 -*-
import contextlib
import os
import re
import zipfile
from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Optional, Tuple

from . import extract_parent_and_chapter
from .butils import IMAGE_EXTENSIONS
from infra import backend

expect_dir_regex = re.compile(r"^_")
accpect_dir = lambda _: not bool(expect_dir_regex.search(_))


class ModeStrategy(ABC):
    @abstractmethod
    def collect_book_paths(self, comic_path: Path) -> List[Path]:
        """收集所有书籍路径"""
    
    @abstractmethod
    def scan_book(self, book_path: Path, comic_path: Path, return_all: bool = False) -> Optional[Tuple]:
        """扫描单个书籍，返回 (display_name, parent_name, chapter_name, mtime, first_img/pages)"""
    
    @abstractmethod
    def build_handle_path(self, scan_path: Path, book_name: str, ep_name: str) -> Path:
        """构建 handle 操作的目标路径"""

    @abstractmethod
    def build_save_path(self, sv_base: Path, book_name: str, ep_name: str) -> Path:
        """构建 save 操作的目标路径"""
    
    def invalidate_cache(self, book_path: Path):
        """删除前释放缓存（默认无操作）"""
    
    @property
    @abstractmethod
    def name(self) -> str:
        """返回策略名称（用于日志）"""


class DirectoryModeStrategy(ModeStrategy):
    @property
    def name(self) -> str:
        return "Normal (Directory)"
    
    def build_handle_path(self, scan_path: Path, book_name: str, ep_name: str) -> Path:
        return scan_path / book_name / ep_name if ep_name else scan_path / book_name

    def build_save_path(self, sv_base: Path, book_name: str, ep_name: str) -> Path:
        return sv_base / book_name / ep_name if ep_name else sv_base / book_name
    
    def collect_book_paths(self, comic_path: Path) -> List[Path]:
        all_paths = []
        with contextlib.suppress(OSError):
            with os.scandir(comic_path) as entries:
                for entry in entries:
                    if entry.is_dir() and accpect_dir(entry.name):
                        subdirs = []
                        with contextlib.suppress(OSError):
                            with os.scandir(entry.path) as sub_entries:
                                subdirs = [Path(e.path) for e in sub_entries if e.is_dir()]
                        if subdirs:
                            all_paths.extend(subdirs)
                        else:
                            all_paths.append(Path(entry.path))
        return all_paths
    
    def scan_book(self, book_path: Path, comic_path: Path, return_all: bool = False) -> Optional[Tuple]:
        if not book_path.is_dir():
            return None
        try:
            mtime = book_path.stat().st_mtime
            image_files = []
            with os.scandir(book_path) as entries:
                for entry in entries:
                    if entry.is_file() and not entry.name.startswith('.'):
                        suffix = Path(entry.name).suffix.lower()
                        if suffix in IMAGE_EXTENSIONS:
                            image_files.append(entry.name)
            image_files.sort()
            if not image_files:
                return None
            pages = image_files if return_all else image_files[0]
            parent_name, chapter_name, display_name = extract_parent_and_chapter(book_path, comic_path)
            return (display_name, parent_name, chapter_name, mtime, pages)
        except (OSError, IndexError):
            return None


class CBZModeStrategy(ModeStrategy):
    @property
    def name(self) -> str:
        return "CBZ (.cbz files)"
    
    def build_handle_path(self, scan_path: Path, book_name: str, ep_name: str) -> Path:
        return scan_path / book_name / f"{ep_name}.cbz" if ep_name else scan_path / book_name

    def build_save_path(self, sv_base: Path, book_name: str, ep_name: str) -> Path:
        return sv_base / book_name / f"{ep_name}.cbz" if ep_name else sv_base / book_name
    
    def invalidate_cache(self, book_path: Path):
        from utils.cbz_cache import get_cbz_cache
        cbz_cache = get_cbz_cache()
        if book_path.suffix.lower() == '.cbz':
            cbz_cache.invalidate(book_path)
        elif book_path.is_dir():
            for cbz in book_path.glob('*.cbz'):
                cbz_cache.invalidate(cbz)
    
    def collect_book_paths(self, comic_path: Path) -> List[Path]:
        all_paths = []
        with contextlib.suppress(OSError):
            with os.scandir(comic_path) as entries:
                for entry in entries:
                    if entry.is_file() and entry.name.lower().endswith('.cbz'):
                        all_paths.append(Path(entry.path))
                    elif entry.is_dir() and accpect_dir(entry.name):
                        with contextlib.suppress(OSError):
                            with os.scandir(entry.path) as sub_entries:
                                for sub_entry in sub_entries:
                                    if sub_entry.is_file() and sub_entry.name.lower().endswith('.cbz'):
                                        all_paths.append(Path(sub_entry.path))
        return all_paths
    
    def scan_book(self, book_path: Path, comic_path: Path, return_all: bool = False) -> Optional[Tuple]:
        if not (book_path.is_file() and book_path.suffix.lower() == '.cbz'):
            return None
        try:
            from utils.cbz_cache import get_cbz_cache
            mtime = book_path.stat().st_mtime
            zf = get_cbz_cache().get_zipfile(book_path)
            if not zf:
                return None
            entries = [name for name in zf.namelist()
                      if not name.endswith('/') and Path(name).suffix.lower() in IMAGE_EXTENSIONS
                      and not Path(name).name.startswith('.')]
            entries.sort()
            if not entries:
                return None
            pages = entries if return_all else entries[0]
            parent_name, chapter_name, display_name = extract_parent_and_chapter(book_path, comic_path)
            return (display_name, parent_name, chapter_name, mtime, pages)
        except (zipfile.BadZipFile, OSError):
            return None


class ModeStrategyFactory:
    @staticmethod
    def create(comic_path: Path) -> ModeStrategy:
        if backend.config.cbz_mode:
            return CBZModeStrategy()
        return DirectoryModeStrategy()