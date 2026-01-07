#!/usr/bin/python
# -*- coding: utf-8 -*-
"""文件操作策略模块"""
import shutil
from pathlib import Path
from send2trash import send2trash


def handle_delete(source: Path):
    """永久删除文件或目录"""
    if source.is_file():
        source.unlink()
    else:
        shutil.rmtree(source)


def handle_trash(source: Path):
    """移到回收站"""
    send2trash(source)


def handle_move(source: Path, dest: Path):
    """移动文件或目录"""
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(source, dest)


def execute_handle(handle_type: str, source: Path, dest: Path = None):
    """执行文件操作"""
    if handle_type == "del":
        handle_delete(source)
    elif handle_type == "remove":
        handle_trash(source)
    else:  # move/save
        handle_move(source, dest)


def cleanup_empty_dir(dir_path: Path):
    """清理空目录"""
    if dir_path and dir_path.exists() and not list(dir_path.iterdir()):
        dir_path.rmdir()