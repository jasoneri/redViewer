#!/usr/bin/python
# -*- coding: utf-8 -*-
"""Root Router - 认证和配置管理 API"""

import time
from functools import wraps
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from infra import backend
from core.crypto import decrypt

root_router = APIRouter(prefix='/root')


# ===== 鉴权相关 =====
def get_secret() -> Optional[str]:
    return backend.auth.get_secret()


def verify_secret(input_secret: str) -> bool:
    stored = get_secret()
    if not stored:
        return True
    try:
        decrypted = decrypt(input_secret, stored)
        secret, timestamp = decrypted.rsplit(":", 1)
        timestamp_ms, current_ms = int(timestamp), int(time.time() * 1000)
        return secret == stored and abs(current_ms - timestamp_ms) <= 5 * 60 * 1000
    except (ValueError, TypeError):
        return False


def is_auth_required() -> bool:
    return backend.auth.is_auth_required()


# ===== 装饰器 =====
def require_lock(lock_name: str):
    """检查操作锁的装饰器"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if backend.config.locks.get(lock_name, False):
                raise HTTPException(403, "操作已锁定")
            return await func(*args, **kwargs)
        return wrapper
    return decorator


# ===== API 路由 =====
class AuthRequest(BaseModel):
    secret: str


class InitSecretRequest(BaseModel):
    secret: str


class LocksUpdate(BaseModel):
    config_path: Optional[bool] = None
    book_handle: Optional[bool] = None
    switch_doujin: Optional[bool] = None
    force_rescan: Optional[bool] = None


class WhitelistUpdate(BaseModel):
    whitelist: list[str]


@root_router.get("/")
async def root_status():
    return {"status": "ok", "has_secret": is_auth_required()}


@root_router.post("/auth")
async def authenticate(req: AuthRequest):
    if not is_auth_required():
        return {"success": True, "skip": True}
    if verify_secret(req.secret):
        return {"success": True}
    raise HTTPException(401, "鉴权失败")


@root_router.get("/locks")
async def get_locks():
    locks = backend.config.locks
    return {k: locks.get(k, False) for k in ('config_path', 'book_handle', 'switch_doujin', 'force_rescan')}


@root_router.post("/locks")
async def update_locks(req: LocksUpdate, x_secret: Optional[str] = Header(None)):
    if is_auth_required() and not verify_secret(x_secret or ''):
        raise HTTPException(401, "鉴权失败")
    current_locks = dict(backend.config.locks)
    current_locks.update({k: v for k, v in req.model_dump().items() if v is not None})
    backend.config.set('locks', current_locks)
    return {"success": True, "locks": current_locks}


@root_router.get("/secret-file")
async def get_secret_path():
    if not backend.auth.is_writable():
        raise HTTPException(403, "当前使用环境变量 RV_SECRET 模式，无需文件")
    if is_auth_required():
        raise HTTPException(403, ".secret 已存在")
    return {"path": backend.auth.get_secret_path()}


@root_router.post("/init-secret")
async def init_secret(req: InitSecretRequest):
    if not backend.auth.is_writable():
        raise HTTPException(403, "当前使用环境变量 RV_SECRET 模式，无法通过 API 设置")
    if is_auth_required():
        raise HTTPException(403, ".secret 已存在，禁止覆盖")
    if not req.secret.strip():
        raise HTTPException(400, "密钥不能为空")
    backend.auth.set_secret(req.secret.strip())
    return {"success": True}


@root_router.get("/whitelist")
async def get_whitelist():
    return {"whitelist": backend.config.whitelist}


@root_router.post("/whitelist")
async def update_whitelist(req: WhitelistUpdate, x_secret: Optional[str] = Header(None)):
    if is_auth_required() and not verify_secret(x_secret or ''):
        raise HTTPException(401, "鉴权失败")
    backend.config.set('root_whitelist', req.whitelist)
    return {"success": True}