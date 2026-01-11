#!/usr/bin/python
# -*- coding: utf-8 -*-
"""EnvAuthBackend - 环境变量认证后端"""

import os
from typing import Optional

from .base import AuthBackend


class EnvAuthBackend(AuthBackend):
    """环境变量认证后端 - 只读 RV_SECRET 环境变量
    
    用于云平台部署模式，密钥从环境变量读取，不支持写入。
    """
    
    ENV_KEY = 'RV_SECRET'
    
    def get_secret(self) -> Optional[str]:
        if secret := os.getenv(self.ENV_KEY):
            return secret.strip()
        return None
    
    def set_secret(self, secret: str) -> bool:
        return False
    
    def get_secret_path(self) -> Optional[str]:
        return None
    
    def is_writable(self) -> bool:
        return False