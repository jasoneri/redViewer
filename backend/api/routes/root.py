from functools import wraps
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from utils import conf, conf_dir

root_router = APIRouter(prefix='/root')


# ===== 鉴权相关 =====
def get_secret() -> Optional[str]:
    """读取 .secret 文件内容"""
    secret_file = conf_dir.joinpath('.secret')
    if not secret_file.exists():
        return None
    return secret_file.read_text().strip()


def encrypt(raw: str) -> str:
    """加密函数框架，当前直接返回原文，后续实现加密"""
    # TODO: 实现加密逻辑
    return raw


def verify_secret(input_secret: str) -> bool:
    """验证密钥，无 .secret 文件时视为不需要鉴权"""
    stored = get_secret()
    if stored is None:
        return True  # 无 secret 文件，跳过鉴权
    return encrypt(input_secret) == encrypt(stored)


def is_auth_required() -> bool:
    """检查是否需要鉴权"""
    return get_secret() is not None


# ===== 装饰器 =====
def require_lock(lock_name: str):
    """检查操作锁的装饰器"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            locks = getattr(conf, 'locks', {})
            if locks.get(lock_name, False):
                raise HTTPException(403, "操作已锁定")
            return await func(*args, **kwargs)
        return wrapper
    return decorator


# ===== API 路由 =====
class AuthRequest(BaseModel):
    secret: str


class LocksUpdate(BaseModel):
    config_path: Optional[bool] = None
    book_handle: Optional[bool] = None
    switch_doujin: Optional[bool] = None


@root_router.get("/")
async def root_status():
    """检查服务状态"""
    return {"status": "ok", "has_secret": get_secret() is not None}


@root_router.post("/auth")
async def authenticate(req: AuthRequest):
    """鉴权接口"""
    if not is_auth_required():
        return {"success": True, "skip": True}  # 无需鉴权
    if verify_secret(req.secret):
        return {"success": True}
    raise HTTPException(401, "鉴权失败")


@root_router.get("/locks")
async def get_locks():
    """获取锁状态"""
    locks = getattr(conf, 'locks', {})
    return {
        "config_path": locks.get('config_path', False),
        "book_handle": locks.get('book_handle', False),
        "switch_doujin": locks.get('switch_doujin', False)
    }


@root_router.post("/locks")
async def update_locks(req: LocksUpdate, x_secret: Optional[str] = Header(None)):
    """更新锁状态（需鉴权，无 .secret 时跳过）"""
    if is_auth_required() and not verify_secret(x_secret or ''):
        raise HTTPException(401, "鉴权失败")
    
    current_locks = getattr(conf, 'locks', {}) or {}
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    current_locks.update(updates)
    conf.update(locks=current_locks)
    return {"success": True, "locks": current_locks}


@root_router.get("/secret-path")
async def get_secret_path():
    """返回 .secret 文件的绝对路径"""
    return {"path": str(conf_dir.absolute())}