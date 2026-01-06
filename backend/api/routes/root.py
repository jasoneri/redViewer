import time
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


def decrypt(encrypted: str) -> str:
    """解密函数框架，当前直接返回原文，后续实现解密"""
    # TODO: 实现解密逻辑
    return encrypted


def verify_secret(input_secret: str) -> bool:
    """验证密钥，无 .secret 文件时视为不需要鉴权
    
    前端发送格式: encrypt(secret:timestamp)
    后端解密后验证 secret 匹配且 timestamp 在 5 分钟内
    """
    stored = get_secret()
    if stored is None:
        return True
    
    try:
        decrypted = decrypt(input_secret)
        secret, timestamp = decrypted.rsplit(':', 1)
        if secret != stored:
            return False
        ts = int(timestamp)
        if abs(time.time() * 1000 - ts) > 5 * 60 * 1000:
            return False
        return True
    except:
        return False


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


class InitSecretRequest(BaseModel):
    secret: str


class LocksUpdate(BaseModel):
    config_path: Optional[bool] = None
    book_handle: Optional[bool] = None
    switch_doujin: Optional[bool] = None
    force_rescan: Optional[bool] = None


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
        "switch_doujin": locks.get('switch_doujin', False),
        "force_rescan": locks.get('force_rescan', False)
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


@root_router.get("/secret-file")
async def get_secret_path():
    if is_auth_required():
        raise HTTPException(403, ".secret 已存在")
    return {"path": str(conf_dir.joinpath('.secret').absolute())}


@root_router.post("/init-secret")
async def init_secret(req: InitSecretRequest):
    """初始化 .secret 文件（仅当不存在时）"""
    secret_file = conf_dir.joinpath('.secret')
    if secret_file.exists():
        raise HTTPException(403, ".secret 已存在，禁止覆盖")
    if not req.secret.strip():
        raise HTTPException(400, "密钥不能为空")
    secret_file.write_text(req.secret.strip())
    return {"success": True}