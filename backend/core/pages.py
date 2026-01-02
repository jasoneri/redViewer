import time
import asyncio
from pathlib import Path
from collections import OrderedDict
from dataclasses import dataclass
from typing import Optional, List
from urllib.parse import quote

from utils import executor, md5, conf, Var
from utils.mode_strategy import ModeStrategyFactory


@dataclass
class CacheEntry:
    md5: str
    pages: Optional[List[str]]
    mtime: Optional[float]
    last_access: float
    lock: asyncio.Lock


class BookPagesHandler:
    def __init__(self, comic_path, ero: int = 0, max_entries: int = 200, loop: Optional[asyncio.AbstractEventLoop] = None):
        self.comic_path = Path(comic_path)
        self.ero = ero
        self.scan_strategy = ModeStrategyFactory.create(self.comic_path)
        self.max_entries = max_entries
        self.loop = loop or asyncio.get_event_loop()
        self._cache: "OrderedDict[str, CacheEntry]" = OrderedDict()

    def _book_path(self, book: str, ep: str = None) -> Path:
        ext = ".cbz" if conf.cbz_mode else ""
        if ep:
            return self.comic_path / f"{book}/{ep}{ext}"
        return self.comic_path / f"{book}/{book}{ext}" if conf.cbz_mode else self.comic_path / book

    def _format_pages_for_api(self, book: str, ep: str, pages: list) -> dict:
        fs_path = f"{book}/{ep}" if ep else book
        safe_path = quote(fs_path)
        prefix = f"/static/_{Var.doujinshi}" if self.ero else "/static"
        if conf.cbz_mode:
            formatted = [f"/comic/cbz_image/{safe_path}.cbz/{quote(page)}" for page in pages]
        else:
            formatted = [f"{prefix}/{safe_path}/{page}" for page in pages]
        return {"pages": formatted, "page_count": len(formatted)}

    def _get_mtime(self, book_path: Path) -> Optional[float]:
        try:
            return book_path.stat().st_mtime if book_path.exists() else None
        except Exception:
            return None

    def _try_cache_hit(self, book_md5: str, current_mtime: float) -> Optional[list]:
        """尝试缓存命中，成功返回 pages，否则返回 None"""
        entry = self._cache.get(book_md5)
        if entry and entry.pages is not None and entry.mtime == current_mtime:
            entry.last_access = time.time()
            try:
                self._cache.move_to_end(book_md5)
            except Exception:
                pass
            return entry.pages
        return None

    def _ensure_entry(self, book_md5: str) -> CacheEntry:
        """确保 entry 存在，不存在则创建占位"""
        entry = self._cache.get(book_md5)
        if entry is None:
            entry = CacheEntry(md5=book_md5, pages=None, mtime=None, last_access=time.time(), lock=asyncio.Lock())
            self._cache[book_md5] = entry
            if len(self._cache) > self.max_entries:
                self._evict_one()
        return entry

    async def _scan_path(self, book_path: Path) -> Optional[tuple]:
        def _worker():
            try:
                result = self.scan_strategy.scan_book(book_path, self.comic_path, return_all=True)
                if result:
                    _, _, _, mtime, pages = result
                    return (book_path.name, mtime, pages)
            except Exception:
                pass
            return None
        return await self.loop.run_in_executor(executor, _worker)

    async def _load_with_lock(self, entry: CacheEntry, book_md5: str, book: str, ep: str, 
                               book_path: Path, current_mtime: float, hard_refresh: bool):
        """在锁保护下加载数据"""
        async with entry.lock:
            # double-check
            if not hard_refresh and entry.pages is not None and entry.mtime == current_mtime:
                entry.last_access = time.time()
                self._cache.move_to_end(book_md5)
                return self._format_pages_for_api(book, ep, entry.pages)
            
            scan_result = await self._scan_path(book_path)
            if not scan_result:
                if book_md5 in self._cache:
                    try:
                        del self._cache[book_md5]
                    except KeyError:
                        pass
                return None
            
            _, mtime, pages_list = scan_result
            entry.pages = pages_list
            entry.mtime = mtime
            entry.last_access = time.time()
            try:
                self._cache.move_to_end(book_md5)
            except Exception:
                pass
            
            while len(self._cache) > self.max_entries:
                self._evict_one()
            
            return self._format_pages_for_api(book, ep, pages_list)

    async def get_pages(self, book: str, ep: str = None, hard_refresh: bool = False):
        cache_key = f"{book}/{ep}" if ep else book
        book_md5 = md5(cache_key)
        book_path = self._book_path(book, ep)
        current_mtime = self._get_mtime(book_path)
        
        # 快速路径：缓存命中
        if not hard_refresh:
            cached = self._try_cache_hit(book_md5, current_mtime)
            if cached:
                return self._format_pages_for_api(book, ep, cached)
        
        # 慢路径：需要加载
        entry = self._ensure_entry(book_md5)
        return await self._load_with_lock(entry, book_md5, book, ep, book_path, current_mtime, hard_refresh)

    def _evict_one(self):
        try:
            self._cache.popitem(last=False)
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