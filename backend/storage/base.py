#!/usr/bin/python
# -*- coding: utf-8 -*-
"""Storage Backend Abstract Base Class

This module defines the abstract interface for storage backends,
allowing switching between local filesystem and cloud storage (e.g., R2)
via configuration.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Tuple, TYPE_CHECKING
from pathlib import Path

if TYPE_CHECKING:
    from models import BookData


class StorageBackend(ABC):
    """存储后端抽象基类

    职责：
    1. 文件系统操作（扫描、列出）
    2. 缓存/数据库操作
    3. URL 生成
    4. 文件监控（可选）
    """

    def __init__(self, comic_path: Path, ero: int = 0):
        self.comic_path = Path(comic_path)
        self.ero = ero
        self.scan_path: Path = None  # 子类需要设置

    # ========== 文件系统操作 ==========

    @abstractmethod
    def collect_book_paths(self, scan_path: Path) -> List[Path]:
        """收集所有书籍路径

        返回：书籍路径列表（本地模式为 Path，R2 模式可能为虚拟路径）
        """
        pass

    @abstractmethod
    def scan_book(self, book_path: Path, scan_path: Path, return_all: bool = False) -> Optional[Tuple]:
        """扫描单本书籍

        返回：(display_name, parent_name, chapter_name, mtime, first_img_or_pages)
        """
        pass

    @abstractmethod
    def get_book_mtime(self, book_path: Path) -> Optional[float]:
        """获取书籍修改时间"""
        pass

    @abstractmethod
    def book_exists(self, book_path: Path) -> bool:
        """检查书籍是否存在"""
        pass

    # ========== 缓存/数据库操作 ==========

    @abstractmethod
    def is_cache_available(self) -> bool:
        """检查缓存是否已初始化（是否需要全量扫描）"""
        pass

    @abstractmethod
    def load_books_from_cache(self) -> Dict[Tuple[str, str], 'BookData']:
        """从缓存加载所有书籍

        返回：{(book, ep): BookData} 字典
        """
        pass

    @abstractmethod
    def save_book_to_cache(self, book: str, ep: str, mtime: float, first_img: str):
        """保存单本书籍到缓存"""
        pass

    @abstractmethod
    def save_books_batch(self, books_data: List[Tuple]):
        """批量保存书籍到缓存

        参数：[(book, ep, mtime, first_img, ero), ...]
        """
        pass

    @abstractmethod
    def remove_book_from_cache(self, book: str, ep: str):
        """从缓存移除书籍"""
        pass

    @abstractmethod
    def set_book_handle(self, book: str, ep: str, handle: str):
        """设置书籍的 handle 标记"""
        pass

    @abstractmethod
    def reset_cache(self):
        """重置缓存（用于强制重新扫描）"""
        pass

    # ========== 目录 mtime 缓存操作（增量同步优化）==========

    def get_cached_dir_mtime(self, dir_name: str) -> Optional[float]:
        """获取缓存的目录 mtime"""
        return None

    def update_dir_mtime_cache(self, dir_name: str, mtime: float):
        """更新目录 mtime 缓存"""
        pass

    def update_dir_mtime_cache_batch(self, entries: List[Tuple[str, float]]):
        """批量更新目录 mtime 缓存"""
        pass

    def load_all_dir_mtimes(self) -> Dict[str, float]:
        """加载所有目录 mtime 缓存"""
        return {}

    def load_entries_for_dir(self, dir_name: str) -> set:
        """从数据库加载指定目录下的所有条目"""
        return set()

    # ========== URL 生成 ==========

    @abstractmethod
    def get_image_url(self, book: str, ep: str, image_name: str) -> str:
        """生成单张图片的访问 URL"""
        pass

    @abstractmethod
    def get_static_prefix(self) -> str:
        """获取静态资源前缀

        本地模式：/static 或 /static/_本子
        R2 模式：https://cdn.example.com 或 https://cdn.example.com/_本子
        """
        pass

    @abstractmethod
    def format_pages_for_api(self, book: str, ep: str, pages: List[str]) -> dict:
        """格式化页面列表供 API 返回

        返回：{"pages": [...], "page_count": n}
        """
        pass

    # ========== 文件监控（可选）==========

    def supports_file_watching(self) -> bool:
        """是否支持文件变更监控"""
        return False

    def create_file_watcher(self, callback):
        """创建文件监控器

        返回：watcher 对象（需要有 start/stop 方法）
        """
        return None

    # ========== Handle 操作路径 ==========

    @abstractmethod
    def build_handle_path(self, scan_path: Path, book: str, ep: str) -> Path:
        """构建 handle 操作的目标路径"""
        pass

    def invalidate_book_cache(self, book_path: Path):
        """删除前释放缓存（如 CBZ 模式的 ZipFile）"""
        pass

    # ========== 静态文件服务 ==========

    def supports_static_mount(self) -> bool:
        """是否需要挂载本地静态文件服务"""
        return True
