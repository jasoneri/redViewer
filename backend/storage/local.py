#!/usr/bin/python
# -*- coding: utf-8 -*-
"""Local Storage Backend Implementation

This module implements the StorageBackend interface for local filesystem storage,
preserving all existing functionality including SQLite cache (rV.db) and
Directory/CBZ mode strategies.
"""

import sqlite3
from pathlib import Path
from typing import List, Optional, Dict, Tuple
from urllib.parse import quote

from utils import Var, conf
from utils.mode_strategy import ModeStrategyFactory
from models import BookData
from watchdog.observers import Observer
from .base import StorageBackend


class LocalStorageBackend(StorageBackend):
    """本地文件系统存储后端

    特点：
    - 使用本地文件系统扫描
    - SQLite rV.db 缓存
    - /static/ 路由静态文件
    - watchdog 文件监控
    """

    def __init__(self, comic_path: Path, ero: int = 0):
        super().__init__(comic_path, ero)

        self.scan_path = self.comic_path / f"_{Var.doujinshi}" if ero else self.comic_path
        self.db_path = self.comic_path / "rV.db"
        self.mode_strategy = ModeStrategyFactory.create(self.scan_path)
        self._conf = conf
        self._var = Var
        self._create_table()

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    def _create_table(self):
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS `episodes` (
                    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
                    `book` TEXT NOT NULL,
                    `ep` TEXT NOT NULL DEFAULT '',
                    `exist` INTEGER NOT NULL DEFAULT 1,
                    `rv_handle` TEXT,
                    `ero` INTEGER NOT NULL DEFAULT 0,
                    `mtime` REAL,
                    `first_img` TEXT,
                    UNIQUE(book, ep)
                )
            """)

    # ========== 文件系统操作 ==========

    def collect_book_paths(self, scan_path: Path) -> List[Path]:
        return self.mode_strategy.collect_book_paths(scan_path)

    def scan_book(self, book_path: Path, scan_path: Path, return_all: bool = False) -> Optional[Tuple]:
        return self.mode_strategy.scan_book(book_path, scan_path, return_all)

    def get_book_mtime(self, book_path: Path) -> Optional[float]:
        try:
            return book_path.stat().st_mtime if book_path.exists() else None
        except Exception:
            return None

    def book_exists(self, book_path: Path) -> bool:
        return book_path.exists()

    # ========== 缓存/数据库操作 ==========

    def is_cache_available(self) -> bool:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT 1 FROM episodes WHERE ero = ? LIMIT 1', (self.ero,))
            return cursor.fetchone() is not None

    def load_books_from_cache(self) -> Dict[Tuple[str, str], 'BookData']:
        books_index = {}
        incomplete_entries = []

        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                'SELECT book, ep, mtime, first_img, ero FROM episodes WHERE exist = 1 and ero = ?',
                (self.ero,)
            )
            for row in cursor.fetchall():
                book, ep, mtime, first_img, ero = row
                if mtime is None or first_img is None:
                    incomplete_entries.append((book, ep))
                else:
                    books_index[(book, ep)] = BookData(book, ep, mtime, first_img, ero, self)

        # 修复不完整条目
        if incomplete_entries:
            updates = []
            for book, ep in incomplete_entries:
                book_path = self.build_book_path(book, ep)
                if result := self.scan_book(book_path, self.scan_path):
                    _, _, _, mtime, first_img = result
                    updates.append((mtime, first_img, book, ep))
                    books_index[(book, ep)] = BookData(book, ep, mtime, first_img, self.ero, self)
            if updates:
                with self._get_conn() as conn:
                    conn.executemany(
                        'UPDATE episodes SET mtime = ?, first_img = ? WHERE book = ? AND ep = ?',
                        updates
                    )

        return books_index

    def save_book_to_cache(self, book: str, ep: str, mtime: float, first_img: str):
        with self._get_conn() as conn:
            conn.execute(
                '''INSERT OR REPLACE INTO episodes (book, ep, exist, mtime, first_img, ero)
                   VALUES (?, ?, 1, ?, ?, ?)''',
                (book, ep, mtime, first_img, self.ero)
            )

    def save_books_batch(self, books_data: List[Tuple]):
        if books_data:
            with self._get_conn() as conn:
                conn.executemany(
                    '''INSERT OR REPLACE INTO episodes (book, ep, exist, mtime, first_img, ero)
                       VALUES (?, ?, 1, ?, ?, ?)''',
                    books_data
                )

    def remove_book_from_cache(self, book: str, ep: str):
        with self._get_conn() as conn:
            conn.execute('UPDATE episodes SET exist = 0 WHERE book = ? AND ep = ?', (book, ep))

    def set_book_handle(self, book: str, ep: str, handle: str):
        with self._get_conn() as conn:
            conn.execute(
                'UPDATE episodes SET rv_handle = ?, exist = 0 WHERE book = ? AND ep = ?',
                (handle, book, ep)
            )

    def reset_cache(self):
        with self._get_conn() as conn:
            conn.execute('UPDATE episodes SET exist = 0 WHERE ero = ?', (self.ero,))

    # ========== URL 生成 ==========

    def get_image_url(self, book: str, ep: str, image_name: str) -> str:
        fs_path = f"{book}/{ep}" if ep else book
        prefix = self.get_static_prefix()

        if self._conf.cbz_mode:
            return f"/comic/cbz_image/{quote(fs_path)}.cbz/{quote(image_name)}"
        else:
            return f"{prefix}/{quote(fs_path)}/{image_name}"

    def get_static_prefix(self) -> str:
        return f"/static/_{self._var.doujinshi}" if self.ero else "/static"

    def format_pages_for_api(self, book: str, ep: str, pages: List[str]) -> dict:
        fs_path = f"{book}/{ep}" if ep else book
        safe_path = quote(fs_path)
        prefix = self.get_static_prefix()

        if self._conf.cbz_mode:
            formatted = [f"/comic/cbz_image/{safe_path}.cbz/{quote(page)}" for page in pages]
        else:
            formatted = [f"{prefix}/{safe_path}/{page}" for page in pages]

        return {"pages": formatted, "page_count": len(formatted)}

    # ========== 文件监控 ==========

    def supports_file_watching(self) -> bool:
        return True

    def create_file_watcher(self, callback):
        observer = Observer()
        return observer

    # ========== Handle 操作路径 ==========

    def build_handle_path(self, scan_path: Path, book: str, ep: str) -> Path:
        return self.mode_strategy.build_handle_path(scan_path, book, ep)

    def build_book_path(self, book: str, ep: str = None) -> Path:
        """构建书籍路径的统一方法"""
        ext = ".cbz" if self._conf.cbz_mode else ""
        if ep:
            return self.scan_path / f"{book}/{ep}{ext}"
        return self.scan_path / f"{book}/{book}{ext}" if self._conf.cbz_mode else self.scan_path / book

    def invalidate_book_cache(self, book_path: Path):
        self.mode_strategy.invalidate_cache(book_path)

    # ========== 静态文件服务 ==========

    def supports_static_mount(self) -> bool:
        return True
