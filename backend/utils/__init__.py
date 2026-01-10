#!/usr/bin/python
# -*- coding: utf-8 -*-
import os
import json
import pathlib
import hashlib
import typing as t
from dataclasses import dataclass, asdict, field
from concurrent.futures import ThreadPoolExecutor

import yaml
from platformdirs import user_config_path

basepath = pathlib.Path(__file__).parent
yaml.warnings({'YAMLLoadWarning': False})
conf_dir = user_config_path("redViewer", ensure_exists=False).parent
conf_dir.mkdir(parents=True, exist_ok=True)


def yaml_update(_f, yaml_string):
    with open(_f, 'r+', encoding='utf-8') as fp:
        fp.seek(0)
        fp.truncate()
        fp.write(yaml_string)


class Var:
    doujinshi = "本子"


@dataclass
class Conf:
    comic_path = None
    to_sv_path = None
    cbz_mode = False
    ero = 0
    file = conf_dir.joinpath('conf.yml')
    path: t.Union[str, pathlib.Path] = None
    kemono_path: t.Union[str, pathlib.Path] = None
    scrollConf: dict = field(default_factory=dict)
    locks: dict = field(default_factory=lambda: {'config_path': False, 'book_handle': False, 'switch_doujin': False})
    storage_backend: str = 'local'  # 'local' | 'r2'

    def __init__(self):
        self.init()

    def init(self):
        # 1. 加载 YAML 配置（或 R2 模式默认值）
        yml_config = self._load_yaml()
        # 2. 应用环境变量覆盖
        yml_config = self._apply_env_overrides(yml_config)
        # 3. 应用配置到实例
        is_r2_mode = yml_config.get('storage_backend') == 'r2'
        for k, v in yml_config.items():
            if 'path' in k and v and not isinstance(v, pathlib.Path):
                v = pathlib.Path(v)
                if not is_r2_mode:  # R2 模式下跳过本地路径创建
                    v.mkdir(parents=True, exist_ok=True)
            self.__setattr__(k, v or getattr(self, k, None))
        # 确保 locks 有默认值
        if not hasattr(self, 'locks') or self.locks is None:
            self.locks = {'config_path': False, 'book_handle': False, 'switch_doujin': False}
        # 特殊处理 root_whitelist: 空列表=去除白名单，需要被正确赋值
        if 'root_whitelist' in yml_config:
            self.root_whitelist = yml_config['root_whitelist']
        self._get_path(yml_config, is_r2_mode)
        if not is_r2_mode:
            self.check_cbz()

    def _load_yaml(self) -> dict:
        """加载 YAML 配置文件"""
        # R2 模式且没有 YAML 文件时，使用内存默认值
        if not self.file.exists():
            if os.getenv('RV_STORAGE_BACKEND') == 'r2':
                return self._get_r2_defaults()
            # 否则复制 sample
            with open(basepath.joinpath('conf_sample.yml'), 'r', encoding='utf-8') as fps:
                with open(self.file, 'w', encoding='utf-8') as fpw:
                    fpw.write(fps.read())
        
        with open(self.file, 'r', encoding='utf-8') as f:
            return yaml.load(f.read(), Loader=yaml.FullLoader) or {}

    def _apply_env_overrides(self, config: dict) -> dict:
        """应用环境变量覆盖（保持字符串类型，由 init() 统一处理类型转换）"""
        env_mapping = {'RV_STORAGE_BACKEND': 'storage_backend', 
                       'RV_COMIC_PATH': 'path', 'RV_KEMONO_PATH': 'kemono_path'}
        for env_key, config_key in env_mapping.items():
            if value := os.getenv(env_key):
                config[config_key] = value
        return config

    def _get_r2_defaults(self) -> dict:
        """R2 模式的内存默认配置（不依赖文件）"""
        return {
            'path': '/tmp/comic',
            'storage_backend': 'r2',
        }

    def _get_path(self, yml_config, is_r2_mode: bool = False):
        comic_path = pathlib.Path(yml_config.get('path', '/tmp/comic'))
        self.comic_path = comic_path
        self.to_sv_path = comic_path.joinpath('_save')
        # R2 模式下跳过本地路径创建
        if not is_r2_mode:
            comic_path.mkdir(exist_ok=True)
            self.to_sv_path.mkdir(exist_ok=True)

    def __new__(cls, *args, **kwargs):
        if not hasattr(Conf, "_instance"):
            setattr(Conf, "_instance", object.__new__(cls))
        return getattr(Conf, "_instance")

    def get_content(self):
        return self.file.read_text()

    def update(self, cfg=None, **kw):
        if isinstance(cfg, str):
            cfg_string = cfg
        else:
            # 合并 cfg 和 kw
            updates = {}
            if cfg:
                updates.update(cfg)
            updates.update(kw)
            
            # 只更新传入的字段
            with open(self.file, 'r', encoding='utf-8') as f:
                current_cfg = yaml.load(f.read(), Loader=yaml.FullLoader) or {}
            current_cfg.update(updates)
            for k, v in current_cfg.items():
                if isinstance(v, pathlib.Path):
                    current_cfg[k] = str(v)
            cfg_string = yaml.dump(current_cfg, allow_unicode=True, sort_keys=False)
        yaml_update(self.file, cfg_string)
        self.init()

    def check_cbz(self):
        cgsRule_f = self.comic_path.joinpath(".cgsRule.json")
        if cgsRule_f.exists():
            self.cbz_mode = json.loads(cgsRule_f.read_text(encoding='utf-8')).get('downloaded_handle') == '.cbz'
        else:
            self.cbz_mode = False


def md5(string):
    return hashlib.md5(string.encode('utf-8')).hexdigest()


def extract_parent_and_chapter(book_path: pathlib.Path, comic_path: pathlib.Path) -> tuple:
    try:
        rel_path = book_path.relative_to(comic_path)
        
        # 处理子目录结构：父目录/章节
        if len(rel_path.parts) == 2:
            parent_name = rel_path.parts[0]
            chapter_name = rel_path.parts[1].replace('.cbz', '')
            display_name = f"{parent_name}_{chapter_name}"
            return (parent_name, chapter_name, display_name)
        
        # 处理单体文件或目录
        elif len(rel_path.parts) == 1:
            name = rel_path.parts[0].replace('.cbz', '')
            return (name, name, name)
        
        # 不应该到达这里，但以防万一
        return (book_path.name, book_path.name, book_path.name)
    except (ValueError, IndexError):
        # 如果路径处理失败，返回文件名作为默认值
        name = book_path.name.replace('.cbz', '')
        return (name, name, name)


conf = Conf()
executor = ThreadPoolExecutor(max_workers=12)
