import time
import asyncio
from pathlib import Path
from collections import OrderedDict
from dataclasses import dataclass
from typing import Optional, List
from urllib.parse import quote
from utils import executor, md5, scan_book_dir


@dataclass
class CacheEntry:
    md5: str
    pages: Optional[List[str]]    # 已排序的页面文件名列表，None 表示尚未加载
    mtime: Optional[float]        # 目录的 mtime，用于变动检测
    last_access: float            # 最近访问时间（用于 LRU）
    lock: asyncio.Lock


class BookPagesHandler:
    def __init__(self, comic_path, max_entries: int = 200, loop: Optional[asyncio.AbstractEventLoop] = None):
        self.comic_path = Path(comic_path)
        self.max_entries = max_entries
        self.loop = loop or asyncio.get_event_loop()
        self._cache: "OrderedDict[str, CacheEntry]" = OrderedDict()

    def _format_pages_for_api(self, book_name: str, pages: list) -> dict:
        safe_book_name = quote(book_name)
        formatted_pages = [f"/static/{safe_book_name}/{page}" for page in pages]
        return {"pages": formatted_pages, "page_count": len(formatted_pages)}

    def _book_dir(self, book_name: str) -> Path:
        return self.comic_path / book_name

    async def _scan_dir(self, book_dir) -> Optional[tuple]:
        def _worker():
            if not book_dir.is_dir():
                return None
            try:
                return scan_book_dir(book_dir, return_all=True)
            except Exception:
                return None
        return await self.loop.run_in_executor(executor, _worker)

    async def get_pages(self, book_name: str, hard_refresh: bool = False):
        book_md5 = md5(book_name)
        entry = self._cache.get(book_md5)
        book_dir = self._book_dir(book_name)
        try:
            current_mtime = book_dir.stat().st_mtime if book_dir.is_dir() else None
        except Exception:
            current_mtime = None
        if (not hard_refresh and
            entry is not None and entry.pages is not None and
            entry.mtime == current_mtime):
            entry.last_access = time.time()
            try:
                self._cache.move_to_end(book_md5)
            except Exception:
                pass
            return self._format_pages_for_api(book_name, entry.pages)
        # 若没有 entry，需要创建一个占位 entry（含 lock）
        if entry is None:
            entry = CacheEntry(
                md5=book_md5, pages=None, mtime=None, last_access=time.time(), lock=asyncio.Lock()
            )
            self._cache[book_md5] = entry
            if len(self._cache) > self.max_entries:
                self._evict_one()
        # 使用 per-md5 lock 避免多协程并发扫描同一目录
        async with entry.lock:
            # double-check，防止在等待锁期间其他协程已加载
            if not hard_refresh and entry.pages is not None and entry.mtime == current_mtime:
                entry.last_access = time.time()
                self._cache.move_to_end(book_md5)
                return self._format_pages_for_api(book_name, entry.pages)
            # 在线程池中扫描目录（IO 密集）
            scan_result = await self._scan_dir(book_dir)
            if not scan_result:
                # 目录不存在或扫描失败：从缓存中删除该占位 entry 并返回 None（与旧行为一致）
                # 注意：invalidate 由外部 FS watcher 调用；此处仅在无法读取目录时清缓存占位
                if book_md5 in self._cache:
                    try:
                        del self._cache[book_md5]
                    except KeyError:
                        pass
                return None
            _, mtime, pages_list = scan_result
            # 更新 entry 并标记为最近使用
            entry.pages = pages_list
            entry.mtime = mtime
            entry.last_access = time.time()
            try:
                self._cache.move_to_end(book_md5)
            except Exception:
                pass
            # 驱逐超额项（如果需要）
            while len(self._cache) > self.max_entries:
                self._evict_one()
            return self._format_pages_for_api(book_name, pages_list)
    
    def _evict_one(self):
        try:
            _, __ = self._cache.popitem(last=False)
        except Exception:
            pass

    async def invalidate(self, book_name: str):
        book_md5 = md5(book_name)
        entry = self._cache.get(book_md5)
        if not entry:
            return
        async with entry.lock:
            if book_md5 in self._cache:
                try:
                    del self._cache[book_md5]
                except KeyError:
                    pass
