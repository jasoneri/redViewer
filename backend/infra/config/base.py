#!/usr/bin/python
# -*- coding: utf-8 -*-
"""ConfigBackend Abstract Base Class"""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from pathlib import Path


class ConfigBackend(ABC):
    """配置后端抽象基类
    
    职责：
    1. 配置的读取和写入
    2. 提供便捷属性访问常用配置
    3. 支持本地文件和环境变量两种模式
    """
    
    @abstractmethod
    def get(self, key: str, default: Any = None) -> Any:
        """获取配置值"""
        pass
    
    @abstractmethod
    def set(self, key: str, value: Any) -> bool:
        """设置配置值，返回是否成功"""
        pass
    
    @abstractmethod
    def update(self, **kwargs) -> bool:
        """批量更新配置"""
        pass
    
    @abstractmethod
    def is_writable(self) -> bool:
        """是否支持持久化写入"""
        pass
    
    @abstractmethod
    def reload(self):
        """重新加载配置"""
        pass
    
    @abstractmethod
    def get_content(self) -> str:
        """获取原始配置内容（用于显示）"""
        pass
    
    # ========== 便捷属性 ==========
    
    @property
    def comic_path(self) -> Path:
        path = self.get('path')
        return Path(path) if path else Path('/tmp/comic')
    
    @property
    def kemono_path(self) -> Optional[Path]:
        path = self.get('kemono_path')
        return Path(path) if path else None
    
    @property
    def storage_backend(self) -> str:
        return self.get('storage_backend', 'local')
    
    @property
    def locks(self) -> Dict[str, bool]:
        return self.get('locks', {
            'config_path': False,
            'book_handle': False,
            'switch_doujin': False,
            'force_rescan': False
        })
    
    @property
    def whitelist(self) -> list:
        return self.get('root_whitelist', [])
    
    @property
    def cbz_mode(self) -> bool:
        return self.get('cbz_mode', False)
    
    @property
    def scroll_conf(self) -> dict:
        return self.get('scrollConf', {})
    
    @property
    def ero(self) -> int:
        return self.get('ero', 0)
    
    # ========== 路径相关 ==========
    
    @property
    def to_sv_path(self) -> Path:
        return self.comic_path / '_save'
    
    def ensure_paths(self, is_cloud: bool = False):
        """确保必要的路径存在（云平台模式下跳过）"""
        if is_cloud:
            return
        self.comic_path.mkdir(parents=True, exist_ok=True)
        self.to_sv_path.mkdir(parents=True, exist_ok=True)
        if self.kemono_path:
            self.kemono_path.mkdir(parents=True, exist_ok=True)