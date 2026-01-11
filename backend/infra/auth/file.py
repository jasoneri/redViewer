#!/usr/bin/python
# -*- coding: utf-8 -*-
"""FileAuthBackend - 本地文件认证后端"""

from pathlib import Path
from typing import Optional

from .base import AuthBackend


class FileAuthBackend(AuthBackend):
    """文件认证后端 - 读写 .secret 文件
    
    用于本地部署模式，密钥持久化到文件。
    """
    
    def __init__(self, secret_file: Path):
        self.secret_file = secret_file
    
    def get_secret(self) -> Optional[str]:
        if self.secret_file.exists():
            content = self.secret_file.read_text(encoding='utf-8').strip()
            return content if content else None
        return None
    
    def set_secret(self, secret: str) -> bool:
        self.secret_file.parent.mkdir(parents=True, exist_ok=True)
        self.secret_file.write_text(secret.strip(), encoding='utf-8')
        return True
    
    def get_secret_path(self) -> Optional[str]:
        return str(self.secret_file.absolute())
    
    def is_writable(self) -> bool:
        return True