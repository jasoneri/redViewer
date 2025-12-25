#!/usr/bin/python
# -*- coding: utf-8 -*-
import pathlib
import hashlib
import shutil
import typing as t
import zipfile
from dataclasses import dataclass, asdict, field
from concurrent.futures import ThreadPoolExecutor

import yaml
from platformdirs import user_config_path

basepath = pathlib.Path(__file__).parent
yaml.warnings({'YAMLLoadWarning': False})
conf_dir = user_config_path("redViewer", ensure_exists=False).parent
conf_dir.mkdir(parents=True, exist_ok=True)


def toAppConfigLocation(ori_file: pathlib.Path):
    file = ori_file.name
    location_file = conf_dir.joinpath(file)
    if ori_file.exists() and not location_file.exists():
        shutil.move(str(ori_file), str(location_file))
    return location_file


def yaml_update(_f, yaml_string):
    with open(_f, 'r+', encoding='utf-8') as fp:
        fp.seek(0)
        fp.truncate()
        fp.write(yaml_string)


@dataclass
class Conf:
    comic_path = None
    handle_path = None
    file = toAppConfigLocation(basepath.parent.joinpath('conf.yml'))
    path: t.Union[str, pathlib.Path] = None
    kemono_path: t.Union[str, pathlib.Path] = None
    scrollConf: dict = field(default_factory=dict)

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
        self._get_path(yml_config)

    def _get_path(self, yml_config):
        def makedirs():
            comic_path.mkdir(exist_ok=True)
            handle_path.mkdir(exist_ok=True)
            handle_path.joinpath('save').mkdir(exist_ok=True)
            handle_path.joinpath('remove').mkdir(exist_ok=True)
        # 移除 web 目录，直接使用配置的路径
        comic_path = pathlib.Path(yml_config['path'])
        handle_path = comic_path.parent.joinpath(f"{comic_path.stem}_handle")
        makedirs()
        self.comic_path = comic_path
        self.handle_path = handle_path

    def __new__(cls, *args, **kwargs):
        if not hasattr(Conf, "_instance"):
            setattr(Conf, "_instance", object.__new__(cls))
        return getattr(Conf, "_instance")

    def get_content(self):
        return self.file.read_text()

    def update(self, cfg):
        if isinstance(cfg, str):
            cfg_string = cfg
        else:
            _cfg = asdict(self)
            _cfg.update(cfg)
            for k, v in _cfg.items():
                if isinstance(v, pathlib.Path):
                    _cfg[k] = str(v)
            cfg_string = yaml.dump(_cfg, allow_unicode=True, sort_keys=False)
        yaml_update(self.file, cfg_string)
        self.init()


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


def extract_image_from_cbz(cbz_path: pathlib.Path, image_name: str) -> bytes | None:
    """从 .cbz 文件中提取指定的图片"""
    try:
        with zipfile.ZipFile(cbz_path, 'r') as zf:
            return zf.read(image_name)
    except (zipfile.BadZipFile, KeyError, Exception):
        return None


def scan_book_dir(book_path: pathlib.Path, return_all=False, comic_path: pathlib.Path = None) -> tuple | None:
    """
    扫描书籍目录或 .cbz 文件
    支持三种情况：
    1. 普通目录（如 [河童屋 (野良神)]コハルノデキゴコロ）
    2. .cbz 文件（如 [ぷ玉] サツキ (ブルーアーカイブ).cbz）
    3. 子目录（如 異世界叔叔/第73话）
    
    参数:
        book_path: 书籍路径
        return_all: 是否返回所有页面（True）或只返回第一页（False）
        comic_path: 漫画根目录路径，用于提取父级信息
    
    返回:
        如果 comic_path 为 None（向后兼容）:
            (display_name, mtime, first_img/pages)
        如果 comic_path 不为 None:
            (display_name, parent_name, chapter_name, mtime, first_img/pages)
    """
    try:
        mtime = book_path.stat().st_mtime
        
        # 处理 .cbz 文件
        if book_path.is_file() and book_path.suffix.lower() == '.cbz':
            try:
                # 使用 CBZCache 获取 ZipFile（性能优化）
                from utils.cbz_cache import get_cbz_cache
                cbz_cache = get_cbz_cache()
                zf = cbz_cache.get_zipfile(book_path)
                
                if not zf:
                    return None
                
                # 获取所有图片文件，排除目录和隐藏文件
                image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
                entries = [name for name in zf.namelist()
                          if not name.endswith('/')
                          and pathlib.Path(name).suffix.lower() in image_extensions
                          and not pathlib.Path(name).name.startswith('.')]
                entries.sort()  # 按文件名排序
                if not entries:
                    return None
                
                pages = entries if return_all else entries[0]
                
                # 如果提供了 comic_path，返回包含父级信息的元组
                if comic_path:
                    parent_name, chapter_name, display_name = extract_parent_and_chapter(book_path, comic_path)
                    return (display_name, parent_name, chapter_name, mtime, pages)
                else:
                    # 向后兼容：不提供 comic_path 时返回旧格式
                    return (book_path.name, mtime, pages)
            except (zipfile.BadZipFile, Exception):
                return None
        
        # 处理普通目录
        elif book_path.is_dir():
            entries_iter = book_path.iterdir()
            if return_all:
                pages = list(map(lambda x: x.name, entries_iter))
            else:
                pages = next(map(lambda x: x.name, filter(lambda x: x.is_file(), entries_iter)))
            
            # 如果提供了 comic_path，返回包含父级信息的元组
            if comic_path:
                parent_name, chapter_name, display_name = extract_parent_and_chapter(book_path, comic_path)
                return (display_name, parent_name, chapter_name, mtime, pages)
            else:
                # 向后兼容：不提供 comic_path 时返回旧格式
                return (book_path.name, mtime, pages)
        
        return None
    except (OSError, IndexError, StopIteration):
        return None
