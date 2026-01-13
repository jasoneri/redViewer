import asyncio
import contextlib
from pathlib import Path

from watchdog.events import FileSystemEventHandler

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}


class ComicChangeHandler(FileSystemEventHandler):
    def __init__(self, cache_manager, pages_handler, main_loop):
        self.cache = cache_manager
        self.pages_handler = pages_handler
        self.loop = main_loop
        self._pending_updates = {}
        self._debounce_delay = 2.0

    def _extract_book_ep(self, event_path: Path) -> tuple:
        """从事件路径提取 (book, ep)"""
        with contextlib.suppress(ValueError):
            relative_path = event_path.relative_to(self.cache.scan_path)
            if parts := relative_path.parts:
                if len(parts) == 1:
                    return parts[0].replace('.cbz', ''), ""
                book, second = parts[0], parts[1]
                if Path(second).suffix.lower() in IMAGE_EXTENSIONS:
                    return book, ""
                return book, second.replace('.cbz', '')
        return None, None

    async def _debounced_update(self, book: str, ep: str):
        await asyncio.sleep(self._debounce_delay)
        fs_path = f"{book}/{ep}" if ep else book
        await self.pages_handler.invalidate(fs_path)
        await self.cache.update_book_async(book, ep)
        self._pending_updates.pop((book, ep), None)

    def on_created(self, event):
        book, ep = self._extract_book_ep(Path(event.src_path))
        if not book:
            return
        key = (book, ep)
        if key in self._pending_updates:
            self._pending_updates[key].cancel()
        task = asyncio.run_coroutine_threadsafe(self._debounced_update(book, ep), self.loop)
        self._pending_updates[key] = task

    def on_deleted(self, event):
        book, ep = self._extract_book_ep(Path(event.src_path))
        if not book:
            return
        fs_path = f"{book}/{ep}" if ep else book
        asyncio.run_coroutine_threadsafe(self.cache.remove_book_async(book, ep), self.loop)
        asyncio.run_coroutine_threadsafe(self.pages_handler.invalidate(fs_path), self.loop)

    def on_moved(self, event):
        pass