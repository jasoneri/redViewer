#!/usr/bin/python
# -*- coding: utf-8 -*-
"""API 响应、请求模型和常量"""
from pathlib import Path
from typing import Optional, Literal
from pydantic import BaseModel
from starlette.responses import JSONResponse, Response

# MIME 类型映射
MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
}


def get_mime_type(extension: str, default: str = 'application/octet-stream') -> str:
    """根据扩展名获取 MIME 类型"""
    return MIME_TYPES.get(extension.lower(), default)


# 响应工具
def not_found(message: str = "Resource not found") -> JSONResponse:
    return JSONResponse(content=message, status_code=404)


def no_content() -> Response:
    return Response(status_code=204)


def bad_request(message: str = "Bad request") -> JSONResponse:
    return JSONResponse(content=message, status_code=400)


def validate_directory(path: Path) -> Optional[JSONResponse]:
    """验证路径是否存在且为目录，失败返回 JSONResponse"""
    if not path.exists() or not path.is_dir():
        return JSONResponse(f"路径不存在: {path}", status_code=400)
    return None


class ErrorMessages:
    NO_BOOKS = "no books exists"
    NO_ARTISTS = "no artists exists"
    
    @staticmethod
    def book_not_exist(name: str) -> str:
        return f"book[{name}] not exist"
    
    @staticmethod
    def path_not_exist(path: str) -> str:
        return f"路径不存在: {path}"


# 请求模型
HandleType = Literal["del", "remove", "move", "save"]


class ComicHandleRequest(BaseModel):
    """Comic handle 请求"""
    book: str
    ep: Optional[str] = None
    handle: HandleType


class KemonoHandleRequest(BaseModel):
    """Kemono handle 请求"""
    u_s: str
    name: str
    handle: HandleType