#!/usr/bin/python
# -*- coding: utf-8 -*-
"""FileConfigBackend - 本地文件配置后端"""

import json
from pathlib import Path
from typing import Any

import yaml

from .base import ConfigBackend


class FileConfigBackend(ConfigBackend):
    """文件配置后端 - 读写 conf.yml
    
    用于本地部署模式，配置持久化到 YAML 文件。
    """
    
    def __init__(self, conf_file: Path, sample_file: Path = None):
        self.conf_file = conf_file
        self.sample_file = sample_file
        self._cache: dict = {}
        self._ensure_file()
        self.reload()
    
    def _ensure_file(self):
        """确保配置文件存在"""
        if self.conf_file.exists():
            return
        self.conf_file.parent.mkdir(parents=True, exist_ok=True)
        if self.sample_file and self.sample_file.exists():
            self.conf_file.write_text(self.sample_file.read_text(encoding='utf-8'), encoding='utf-8')
        else:
            self.conf_file.write_text('path: ""\n', encoding='utf-8')
    
    def reload(self):
        """重新加载配置文件"""
        with open(self.conf_file, 'r', encoding='utf-8') as f:
            self._cache = yaml.safe_load(f) or {}
    
    def get(self, key: str, default: Any = None) -> Any:
        return self._cache.get(key, default)
    
    def set(self, key: str, value: Any) -> bool:
        self._cache[key] = value
        self._save()
        return True
    
    def update(self, **kwargs) -> bool:
        self._cache.update(kwargs)
        self._save()
        return True
    
    def _save(self):
        """保存配置到文件"""
        save_data = {}
        for k, v in self._cache.items():
            save_data[k] = str(v) if isinstance(v, Path) else v
        with open(self.conf_file, 'w', encoding='utf-8') as f:
            yaml.dump(save_data, f, allow_unicode=True, sort_keys=False)
    
    def is_writable(self) -> bool:
        return True
    
    def get_content(self) -> str:
        return self.conf_file.read_text(encoding='utf-8')
    
    # ========== CBZ 模式检测 ==========
    
    def check_cbz_mode(self):
        """检测并更新 cbz_mode 配置"""
        cgs_rule_file = self.comic_path / ".cgsRule.json"
        if cgs_rule_file.exists():
            try:
                rule_data = json.loads(cgs_rule_file.read_text(encoding='utf-8'))
                cbz_mode = rule_data.get('downloaded_handle') == '.cbz'
            except (json.JSONDecodeError, IOError):
                cbz_mode = False
        else:
            cbz_mode = False
        self._cache['cbz_mode'] = cbz_mode