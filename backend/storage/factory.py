#!/usr/bin/python
# -*- coding: utf-8 -*-
"""Storage Backend Factory

Factory class for creating storage backend instances based on configuration.
"""

from pathlib import Path
from typing import Optional

from infra import backend
from .base import StorageBackend


class StorageBackendFactory:
    """存储后端工厂"""

    _instances: dict = {}  # 缓存实例，避免重复创建

    @classmethod
    def create(
        cls,
        comic_path: Path,
        ero: int = 0,
        backend_type: Optional[str] = None
    ) -> StorageBackend:
        """创建存储后端实例

        Args:
            comic_path: 漫画根目录
            ero: 是否为同人志内容 (0/1)
            backend_type: 后端类型，None 时从配置读取

        Returns:
            StorageBackend 实例
        """

        if backend_type is None:
            backend_type = backend.config.storage_backend

        cache_key = f"{comic_path}|ero={ero}|type={backend_type}"

        if cache_key in cls._instances:
            return cls._instances[cache_key]

        if backend_type == 'local':
            from .local import LocalStorageBackend
            instance = LocalStorageBackend(comic_path, ero)
        elif backend_type == 'r2':
            from .r2 import R2StorageBackend
            instance = R2StorageBackend(comic_path, ero)
        else:
            raise ValueError(f"Unknown storage backend type: {backend_type}")

        cls._instances[cache_key] = instance
        return instance

    @classmethod
    def clear_cache(cls):
        """清除实例缓存"""
        cls._instances.clear()

    @classmethod
    def get_instance(cls, comic_path: Path, ero: int = 0) -> Optional[StorageBackend]:
        """获取已缓存的实例（如果存在）"""
        backend_type = backend.config.storage_backend
        cache_key = f"{comic_path}|ero={ero}|type={backend_type}"
        return cls._instances.get(cache_key)


