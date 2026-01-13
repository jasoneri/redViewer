#!/usr/bin/python
# -*- coding: utf-8 -*-
"""AuthBackend Abstract Base Class"""

from abc import ABC, abstractmethod
from typing import Optional


class AuthBackend(ABC):
    """认证后端抽象基类
    
    职责：
    1. 密钥的读取和写入
    2. 认证状态检查
    """
    
    @abstractmethod
    def get_secret(self) -> Optional[str]:
        """获取密钥"""
    
    @abstractmethod
    def set_secret(self, secret: str) -> bool:
        """设置密钥，返回是否成功"""
    
    @abstractmethod
    def get_secret_path(self) -> Optional[str]:
        """获取密钥文件路径（仅文件模式有效）"""
    
    @abstractmethod
    def is_writable(self) -> bool:
        """是否支持写入"""
    
    def is_auth_required(self) -> bool:
        """是否需要认证"""
        return self.get_secret() is not None