#!/usr/bin/python
# -*- coding: utf-8 -*-
"""Root Router - 认证和配置管理 API"""

import time
import httpx
import ipaddress
from functools import wraps
from urllib.parse import urlsplit
from fastapi import APIRouter, HTTPException, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from infra import backend
from core.crypto import decrypt
from core.logging import normalize_log_level

root_router = APIRouter(prefix='/root')
api_config_router = APIRouter(prefix='/api')


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


def is_loopback_client(request: Request) -> bool:
    host = request.client.host if request.client else ""
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def require_desktop_admin_access(request: Request) -> None:
    # RVDSK001: rvDesktop uses this local-only route group as a trusted control plane.
    if is_loopback_client(request):
        return
    raise HTTPException(403, "桌面管理员通道仅允许本机访问")


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


class DesktopSecretUpdate(BaseModel):
    secret: str


class DesktopLogLevelUpdate(BaseModel):
    log_level: str


class LocksUpdate(BaseModel):
    config_path: Optional[bool] = None
    book_handle: Optional[bool] = None
    switch_doujin: Optional[bool] = None
    force_rescan: Optional[bool] = None


class WhitelistUpdate(BaseModel):
    whitelist: list[str]


class ApiConfigUpdate(BaseModel):
    backendUrl: str | None = None
    currentBackend: str | None = None
    secret: str | None = None


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


def update_lock_values(req: LocksUpdate) -> dict:
    current_locks = dict(backend.config.locks)
    current_locks.update({k: v for k, v in req.model_dump().items() if v is not None})
    backend.config.set('locks', current_locks)
    return current_locks


@root_router.post("/locks")
async def update_locks(req: LocksUpdate, x_secret: Optional[str] = Header(None)):
    if is_auth_required() and not verify_secret(x_secret or ''):
        raise HTTPException(401, "鉴权失败")
    current_locks = update_lock_values(req)
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


@root_router.get("/desktop-admin/state")
async def desktop_admin_state(
    request: Request,
):
    require_desktop_admin_access(request)
    locks = await get_locks()
    return {"has_secret": is_auth_required(), "locks": locks}


@root_router.post("/desktop-admin/secret")
async def desktop_admin_update_secret(
    request: Request,
    req: DesktopSecretUpdate,
):
    require_desktop_admin_access(request)
    backend.auth.set_secret(req.secret.strip())
    return {"success": True, "has_secret": True}


@root_router.post("/desktop-admin/locks")
async def desktop_admin_update_locks(
    request: Request,
    req: LocksUpdate,
):
    require_desktop_admin_access(request)
    current_locks = update_lock_values(req)
    return {"success": True, "locks": current_locks}


@root_router.post("/desktop-admin/log-level")
async def desktop_admin_update_log_level(
    request: Request,
    req: DesktopLogLevelUpdate,
):
    require_desktop_admin_access(request)
    level = normalize_log_level(req.log_level).lower()
    backend.config.update(log_level=level)
    return {"success": True, "log_level": level, "restart_required": True}


@root_router.get("/whitelist")
async def get_whitelist():
    return {"whitelist": backend.config.whitelist}


@root_router.post("/whitelist")
async def update_whitelist(req: WhitelistUpdate, x_secret: Optional[str] = Header(None)):
    if is_auth_required() and not verify_secret(x_secret or ''):
        raise HTTPException(401, "鉴权失败")
    backend.config.set('root_whitelist', req.whitelist)
    return {"success": True}


@api_config_router.get('/config')
async def get_api_config():
    return {
        'backendUrl': backend.config.get('frontend_backend_url'),
        'bgGif': None
    }


@api_config_router.post('/config')
async def update_api_config(req: ApiConfigUpdate):
    if not req.secret:
        return JSONResponse({'error': '需要密钥'}, status_code=401)
    if not is_auth_required():
        return JSONResponse({'error': '请先设置密钥'}, status_code=403)
    if not verify_secret(req.secret):
        return JSONResponse({'error': '密钥验证失败'}, status_code=401)

    target = (req.backendUrl or '').strip().rstrip('/')
    if not target:
        return JSONResponse({'error': '需要目标后端地址'}, status_code=400)
    try:
        parts = urlsplit(target)
    except ValueError:
        return JSONResponse({'error': '地址格式不正确'}, status_code=400)
    if parts.scheme not in ('http', 'https') or not parts.netloc:
        return JSONResponse({'error': '地址必须以 http:// 或 https:// 开头'}, status_code=400)

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f'{target}/root/')
        if r.status_code >= 400:
            return JSONResponse({'error': '无法连接目标后端'}, status_code=502)
    except httpx.HTTPError:
        return JSONResponse({'error': '无法连接目标后端'}, status_code=502)

    backend.config.set('frontend_backend_url', target)
    return {'success': True}
