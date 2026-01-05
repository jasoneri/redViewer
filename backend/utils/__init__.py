#!/usr/bin/python
# -*- coding: utf-8 -*-
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

    def __init__(self):
        self.init()

    def init(self):
        if not self.file.exists():
            with open(basepath.joinpath('conf_sample.yml'), 'r', encoding='utf-8') as fps:
                with open(self.file, 'w', encoding='utf-8') as fpw:
                    fpw.write(fps.read())
        with open(self.file, 'r', encoding='utf-8') as f:
            cfg = f.read()
        yml_config = yaml.load(cfg, Loader=yaml.FullLoader)
        for k, v in yml_config.items():
            if 'path' in k:
                v = pathlib.Path(v)
                v.mkdir(parents=True, exist_ok=True)
            self.__setattr__(k, v or getattr(self, k, None))
        # 确保 locks 有默认值
        if not hasattr(self, 'locks') or self.locks is None:
            self.locks = {'config_path': False, 'book_handle': False, 'switch_doujin': False}
        self._get_path(yml_config)
        self.check_cbz()

    def _get_path(self, yml_config):
        comic_path = pathlib.Path(yml_config['path'])
        self.comic_path = comic_path
        self.to_sv_path = comic_path.joinpath('_save')
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
