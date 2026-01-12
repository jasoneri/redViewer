#!/usr/bin/python
# -*- coding: utf-8 -*-
"""R2 Storage Backend Implementation

阶段一：静态索引模式
- 从 R2 公开 URL 读取预生成的 _index.json 索引文件
- 只读操作，不支持动态扫描和写入

阶段二（未来）：动态扫描模式
- 使用 S3 兼容 API 列出对象
"""

import os
import httpx
from pathlib import Path
from typing import List, Optional, Dict, Tuple
from urllib.parse import quote

from utils import Var
from models import BookData
from .base import StorageBackend


class R2StorageBackend(StorageBackend):
    """Cloudflare R2 存储后端

    当前实现：静态索引模式
    - 从 {public_url}/_index.json 或 {public_url}/_{doujinshi}/_index.json 读取索引
    - URL 直接指向 R2 公开域名
    - 不支持实时文件监控和写入操作
    """

    def __init__(self, comic_path: Path, ero: int = 0):
        super().__init__(comic_path, ero)

        self.public_url = os.getenv('RV_R2_PUBLIC_URL', '').rstrip('/')
        self._index_cache: Optional[dict] = None
        
        # 与 LocalStorageBackend 兼容的属性
        self.scan_path = self.comic_path / f"_{Var.doujinshi}" if ero else self.comic_path
        self.mode_strategy = None  # R2 模式不使用本地扫描策略

    # ========== 索引加载 ==========

    def _get_index_url(self) -> str:
        """获取索引文件 URL"""
        if self.ero:
            return f"{self.public_url}/_{Var.doujinshi}/_index.json"
        return f"{self.public_url}/_index.json"

    def _load_index(self) -> dict:
        """从 R2 加载索引文件"""
        if self._index_cache is not None:
            return self._index_cache
        
        url = self._get_index_url()
        try:
            resp = httpx.get(url, timeout=30)
            resp.raise_for_status()
            self._index_cache = resp.json()
        except Exception as e:
            # 索引加载失败，返回空索引
            self._index_cache = {"books": []}
        return self._index_cache

    # ========== 文件系统操作（静态索引模式：只读） ==========

    def collect_book_paths(self, scan_path: Path) -> List[Path]:
        """从索引返回虚拟路径列表"""
        index = self._load_index()
        paths = []
        for item in index.get("books", []):
            book, ep = item.get("book", ""), item.get("ep", "")
            if ep:
                paths.append(Path(f"{book}/{ep}"))
            else:
                paths.append(Path(book))
        return paths

    def scan_book(self, book_path: Path, scan_path: Path, return_all: bool = False) -> Optional[Tuple]:
        """从索引获取书籍信息"""
        index = self._load_index()
        path_str = str(book_path)
        for item in index.get("books", []):
            book, ep = item.get("book", ""), item.get("ep", "")
            item_path = f"{book}/{ep}" if ep else book
            if item_path == path_str or path_str.endswith(item_path):
                display_name = f"{book}_{ep}" if ep else book
                mtime = item.get("mtime", 0)
                first_img = item.get("first_img", "")
                if return_all:
                    pages = item.get("pages", [first_img] if first_img else [])
                    return (display_name, book, ep, mtime, pages)
                return (display_name, book, ep, mtime, first_img)
        return None

    def get_book_mtime(self, book_path: Path) -> Optional[float]:
        """从索引获取 mtime"""
        result = self.scan_book(book_path, self.comic_path)
        return result[3] if result else None

    def book_exists(self, book_path: Path) -> bool:
        """检查书籍是否在索引中"""
        return self.scan_book(book_path, self.comic_path) is not None

    # ========== 缓存操作（静态索引模式：索引即缓存） ==========

    def is_cache_available(self) -> bool:
        """静态索引模式下，索引即缓存"""
        index = self._load_index()
        return len(index.get("books", [])) > 0

    def load_books_from_cache(self) -> Dict[Tuple[str, str], 'BookData']:
        """从索引加载所有书籍"""
        
        index = self._load_index()
        books_index = {}
        for item in index.get("books", []):
            book = item.get("book", "")
            ep = item.get("ep", "")
            mtime = item.get("mtime", 0)
            first_img = item.get("first_img", "")
            books_index[(book, ep)] = BookData(book, ep, mtime, first_img, self.ero, self)
        return books_index

    def save_book_to_cache(self, book: str, ep: str, mtime: float, first_img: str):
        """静态索引模式不支持写入"""

    def save_books_batch(self, books_data: List[Tuple]):
        """静态索引模式不支持写入"""

    def remove_book_from_cache(self, book: str, ep: str):
        """静态索引模式不支持删除"""

    def set_book_handle(self, book: str, ep: str, handle: str):
        """静态索引模式不支持 handle 操作"""

    def reset_cache(self):
        """重置索引缓存，下次访问时重新加载"""
        self._index_cache = None

    # ========== URL 生成 ==========

    def get_image_url(self, book: str, ep: str, image_name: str) -> str:
        fs_path = f"{book}/{ep}/{image_name}" if ep else f"{book}/{image_name}"
        prefix = f"{self.public_url}/_{Var.doujinshi}" if self.ero else self.public_url
        return f"{prefix}/{quote(fs_path)}"

    def get_static_prefix(self) -> str:
        return f"{self.public_url}/_{Var.doujinshi}" if self.ero else self.public_url

    def format_pages_for_api(self, book: str, ep: str, pages: List[str]) -> dict:
        formatted = [self.get_image_url(book, ep, page) for page in pages]
        return {"pages": formatted, "page_count": len(formatted)}

    # ========== 文件监控 ==========

    def supports_file_watching(self) -> bool:
        return False  # R2 不支持实时监控

    # ========== Handle 操作路径 ==========

    def build_handle_path(self, scan_path: Path, book: str, ep: str) -> Path:
        raise NotImplementedError("R2 backend does not support local handle operations")

    def build_save_path(self, book: str, ep: str) -> Path:
        raise NotImplementedError("R2 backend does not support local save operations")

    def build_book_path(self, book: str, ep: str = None) -> Path:
        """构建虚拟书籍路径（用于兼容 ComicCacheManager）"""
        return Path(f"{book}/{ep}") if ep else Path(book)

    # ========== 静态文件服务 ==========

    def supports_static_mount(self) -> bool:
        return False  # 不需要本地 StaticFiles，前端直接访问 CDN URL
