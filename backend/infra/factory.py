#!/usr/bin/python
# -*- coding: utf-8 -*-
"""BackendFactory - 顶层后端工厂"""

import os
from pathlib import Path

from platformdirs import user_config_path

from .config.base import ConfigBackend
from .config.file import FileConfigBackend
from .config.env import EnvConfigBackend
from .auth.base import AuthBackend
from .auth.file import FileAuthBackend
from .auth.env import EnvAuthBackend


class BackendFactory:
    """顶层后端工厂 - 单例模式
    
    根据 RV_DEPLOY_MODE 环境变量自动选择本地/云平台模式：
    - local (默认): 使用文件存储配置和密钥
    - cloud: 使用环境变量存储配置和密钥
    """
    
    _instance = None
    
    def __init__(self):
        self.deploy_mode = os.getenv('RV_DEPLOY_MODE', 'local')
        self.conf_dir = user_config_path("redViewer", ensure_exists=False).parent
        self.conf_dir.mkdir(parents=True, exist_ok=True)
        self._config: ConfigBackend = None
        self._auth: AuthBackend = None
        self._basepath = Path(__file__).parent.parent  # backend/ 目录
    
    @classmethod
    def get_instance(cls) -> 'BackendFactory':
        if cls._instance is None:
            cls._instance = cls()
            cls._instance._init_backends()
        return cls._instance
    
    @classmethod
    def reset_instance(cls):
        """重置单例（用于测试）"""
        cls._instance = None
    
    def _init_backends(self):
        if self.is_cloud_mode():
            self._config = EnvConfigBackend()
            self._auth = EnvAuthBackend()
        else:
            sample_file = self._basepath / 'utils' / 'conf_sample.yml'
            self._config = FileConfigBackend(self.conf_dir / 'conf.yml', sample_file)
            self._auth = FileAuthBackend(self.conf_dir / '.secret')
            self._config.ensure_paths(is_cloud=False)
    
    @property
    def config(self) -> ConfigBackend:
        return self._config
    
    @property
    def auth(self) -> AuthBackend:
        return self._auth
    
    def is_cloud_mode(self) -> bool:
        return self.deploy_mode == 'cloud'
    
    def get_storage_backend(self, comic_path: Path = None, ero: int = 0):
        """获取存储后端（延迟导入避免循环依赖）"""
        from storage import StorageBackendFactory
        path = comic_path or self.config.comic_path
        return StorageBackendFactory.create(path, ero)