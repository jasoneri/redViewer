#!/usr/bin/python
# -*- coding: utf-8 -*-
"""EnvConfigBackend - 环境变量配置后端"""

import os
import json
from typing import Any

from .base import ConfigBackend


class EnvConfigBackend(ConfigBackend):
    """环境变量配置后端 - 只读环境变量 + 内存缓存
    
    用于云平台部署模式，配置从环境变量读取，运行时修改存储在内存中。
    """
    
    ENV_MAPPING = {
        'path': 'RV_COMIC_PATH',
        'kemono_path': 'RV_KEMONO_PATH',
        'storage_backend': 'RV_STORAGE_BACKEND',
        'locks': 'RV_LOCKS',
        'root_whitelist': 'RV_WHITELIST',
        'scrollConf': 'RV_SCROLL_CONF',
    }
    
    JSON_KEYS = {'locks', 'root_whitelist', 'scrollConf'}
    
    DEFAULTS = {
        'path': '/tmp/comic',
        'storage_backend': 'local',
        'locks': {'config_path': False, 'book_handle': False, 'switch_doujin': False, 'force_rescan': False},
        'root_whitelist': [],
        'scrollConf': {},
        'cbz_mode': False,
        'ero': 0,
    }
    
    def __init__(self):
        self._memory: dict = {}
    
    def reload(self):
        self._memory.clear()
    
    def get(self, key: str, default: Any = None) -> Any:
        if key in self._memory:
            return self._memory[key]
        if env_key := self.ENV_MAPPING.get(key):
            if value := os.getenv(env_key):
                return self._parse(key, value)
        return default if default is not None else self.DEFAULTS.get(key)
    
    def _parse(self, key: str, value: str) -> Any:
        if key in self.JSON_KEYS:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return {} if key in ('locks', 'scrollConf') else []
        return value
    
    def set(self, key: str, value: Any) -> bool:
        self._memory[key] = value
        return True
    
    def update(self, **kwargs) -> bool:
        self._memory.update(kwargs)
        return True
    
    def is_writable(self) -> bool:
        return False
    
    def get_content(self) -> str:
        config = {k: self.get(k) for k in self.ENV_MAPPING}
        return json.dumps(config, indent=2, ensure_ascii=False)