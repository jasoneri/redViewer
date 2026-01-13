import asyncio
import threading
import contextlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from watchdog.observers import Observer
from .logging import get_logger
from .pages import BookPagesHandler
from .watcher import ComicChangeHandler

from utils import Var
from utils.cbz_cache import close_cbz_cache
from models import BookData
from storage import StorageBackendFactory


logger = get_logger()

class ComicCacheManager:
    def __init__(self, _path: Path, ero: int = 0):
        self.comic_path = Path(_path)
        self.ero = ero
        self.executor = ThreadPoolExecutor(max_workers=32)

        # 使用 StorageBackend 替代直接的 SQLite 和 ModeStrategy
        # 扫描能力统一通过 backend 访问，不再暴露 scan_strategy
        self.backend = StorageBackendFactory.create(self.comic_path, ero)
        self.scan_path = self.backend.scan_path

        self.books_index = {}  # {(book, ep): BookData}
        self._index_lock = threading.RLock()  # 保护 books_index 的线程安全

    def load_from_db(self):
        with self._index_lock:
            self.books_index = self.backend.load_books_from_cache()
        logger.debug(f"Loaded {len(self.books_index)} books from cache (ero={self.ero})")

    def is_scanned(self) -> bool:
        return self.backend.is_cache_available()

    def initial_scan(self):
        logger.debug(f"Performing initial scan using backend: {self.backend.__class__.__name__}")
        all_book_paths = self.backend.collect_book_paths(self.scan_path)
        if not all_book_paths:
            logger.debug("No books found.")
            return

        books_data_for_db = []
        results = self.executor.map(
            lambda path: self.backend.scan_book(path, self.scan_path),
            all_book_paths
        )

        for result in results:
            if result:
                _, parent_name, chapter_name, mtime, first_img = result
                book = parent_name
                ep = "" if chapter_name == parent_name else chapter_name
                books_data_for_db.append((book, ep, mtime, first_img, self.ero))
                with self._index_lock:
                    self.books_index[(book, ep)] = BookData(book, ep, mtime, first_img, self.ero, self.backend)

        if books_data_for_db:
            self.backend.save_books_batch(books_data_for_db)
            logger.debug(f"Batch inserted {len(books_data_for_db)} books into cache")

        logger.debug("Initial scan complete.")

    def _scan_fs_entries(self) -> set:
        """扫描文件系统条目"""
        entries = set()
        all_book_paths = self.backend.collect_book_paths(self.scan_path)
        for path in all_book_paths:
            if result := self.backend.scan_book(path, self.scan_path):
                _, parent_name, chapter_name, _, _ = result
                book = parent_name
                ep = "" if chapter_name == parent_name else chapter_name
                entries.add((book, ep))
        return entries

    async def update_book_async(self, book: str, ep: str):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self.executor, self.update_book_sync, book, ep)

    def update_book_sync(self, book: str, ep: str):
        book_path = self.backend.build_book_path(book, ep)
        scan_result = self.backend.scan_book(book_path, self.scan_path)
        if not scan_result:
            logger.debug(f"Skipping update for non-existent path: {book}/{ep}")
            return

        _, _, _, mtime, first_img = scan_result
        self.backend.save_book_to_cache(book, ep, mtime, first_img)
        with self._index_lock:
            self.books_index[(book, ep)] = BookData(book, ep, mtime, first_img, self.ero, self.backend)
        logger.debug(f"Updated cache for: {book}/{ep}")

    async def remove_book_async(self, book: str, ep: str):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self.executor, self.remove_book, book, ep)

    def remove_book(self, book: str, ep: str):
        self.backend.remove_book_from_cache(book, ep)
        with self._index_lock:
            if (book, ep) in self.books_index:
                del self.books_index[(book, ep)]
                logger.debug(f"Removed from cache: {book}/{ep}")  # must be set only after del, to reduce debug-log!

    def set_handle(self, book: str, ep: str, handle: str):
        self.backend.set_book_handle(book, ep, handle)
        with self._index_lock:
            if (book, ep) in self.books_index:
                del self.books_index[(book, ep)]
                logger.debug(f"Set handle '{handle}' for: {book}/{ep}")  # must be set only after del, to reduce debug-log!

    def reset_exist_flags(self):
        """重置 exist 字段并清空内存缓存"""
        self.backend.reset_cache()
        with self._index_lock:
            self.books_index.clear()
        logger.info(f"Reset exist flags for ero={self.ero}")


class ComicLibraryManager:
    def __init__(self):
        self.cache_instances = {}
        self.pages_handlers = {}
        self.active_path = None
        self.active_cache: ComicCacheManager = None
        self.active_pages_handler = None
        self.observer = None
        self.ero = False
        self._background_sync_task = None  # 后台同步任务

    @property
    def bind_path(self):
        return self.active_path if not self.ero else self.active_path.joinpath(f"_{Var.doujinshi}")

    async def switch_library(self, new_comic_path, main_loop=None, ero: bool = None):
        new_ero = ero if ero is not None else self.ero
        new_comic_path = Path(new_comic_path)
        cache_key = f"{new_comic_path}|ero={new_ero}"

        old_key = f"{self.active_path}|ero={self.ero}" if self.active_path else None
        if cache_key == old_key and self.active_cache:
            return

        if ero is not None:
            self.ero = ero

        if self.observer and self.observer.is_alive():
            self.observer.stop()
            self.observer.join()

        # 取消正在进行的后台同步任务
        if self._background_sync_task and not self._background_sync_task.done():
            self._background_sync_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._background_sync_task

        self.active_path = new_comic_path

        if cache_key in self.cache_instances:
            self.active_cache = self.cache_instances[cache_key]
            self.active_pages_handler = self.pages_handlers[cache_key]
        else:
            cache_manager = ComicCacheManager(self.active_path, self.ero)
            pages_handler = BookPagesHandler(cache_manager.scan_path, self.ero)

            if not cache_manager.is_scanned():
                await asyncio.to_thread(cache_manager.initial_scan)
            else:
                # 立即从缓存加载，不阻塞
                cache_manager.load_from_db()
                # 启动后台同步任务
                self._background_sync_task = asyncio.create_task(
                    self._background_sync(cache_manager)
                )

            self.cache_instances[cache_key] = cache_manager
            self.pages_handlers[cache_key] = pages_handler
            self.active_cache = cache_manager
            self.active_pages_handler = pages_handler

        if main_loop and self.active_cache.backend.supports_file_watching():
            scan_path = self.active_cache.scan_path
            if scan_path.exists():
                event_handler = ComicChangeHandler(self.active_cache, self.active_pages_handler, main_loop)
                self.observer = Observer()
                self.observer.schedule(event_handler, str(scan_path), recursive=True)
                self.observer.start()
                logger.debug(f"Now monitoring: {scan_path} (ero={self.ero})")
            else:
                logger.debug(f"Skip monitoring: {scan_path} does not exist (ero={self.ero})")

    async def _background_sync(self, cache_manager: ComicCacheManager):
        """后台增量同步，不阻塞用户操作"""
        try:
            logger.debug(f"Starting background sync for ero={cache_manager.ero}")
            with cache_manager._index_lock:
                db_entries = set(cache_manager.books_index.keys())
            fs_entries = await asyncio.to_thread(cache_manager._scan_fs_entries)

            deleted = db_entries - fs_entries
            added = fs_entries - db_entries

            if deleted:
                logger.info(f"Background sync: Found {len(deleted)} books deleted offline. Removing from cache...")
                for book, ep in deleted:
                    cache_manager.remove_book(book, ep)

            if added:
                logger.info(f"Background sync: Found {len(added)} books added offline. Adding to cache...")
                tasks = [
                    asyncio.to_thread(cache_manager.update_book_sync, book, ep)
                    for book, ep in added
                ]
                await asyncio.gather(*tasks)

            logger.debug("Background sync complete.")
        except asyncio.CancelledError:
            logger.debug("Background sync cancelled.")
            raise
        except Exception as e:
            logger.error(f"Background sync error: {e}")

    async def _sync_startup(self, cache_manager: ComicCacheManager):
        """同步启动扫描（保留以支持旧代码路径）"""
        with cache_manager._index_lock:
            db_entries = set(cache_manager.books_index.keys())
        fs_entries = await asyncio.to_thread(cache_manager._scan_fs_entries)

        deleted = db_entries - fs_entries
        added = fs_entries - db_entries

        if deleted:
            logger.info(f"Found {len(deleted)} books deleted offline. Removing from cache...")
            for book, ep in deleted:
                cache_manager.remove_book(book, ep)

        if added:
            logger.info(f"Found {len(added)} books added offline. Adding to cache...")
            tasks = [
                asyncio.to_thread(cache_manager.update_book_sync, book, ep)
                for book, ep in added
            ]
            await asyncio.gather(*tasks)

        logger.debug("Startup synchronization complete.")

    async def force_rescan(self, main_loop=None):
        """强制重新扫描：释放资源，重置数据库，重新扫描"""
        if not self.active_cache:
            return {"error": "No active library"}

        # 1. 停止文件监控
        if self.observer and self.observer.is_alive():
            self.observer.stop()
            self.observer.join()
            self.observer = None

        # 2. 关闭 CBZ 缓存
        close_cbz_cache()

        # 3. 清空页面缓存
        if self.active_pages_handler:
            self.active_pages_handler.clear_cache()

        # 4. 重置数据库 exist 字段并清空内存缓存
        self.active_cache.reset_exist_flags()

        # 5. 重新扫描
        await asyncio.to_thread(self.active_cache.initial_scan)

        # 6. 重启文件监控
        if main_loop and self.active_cache.backend.supports_file_watching():
            event_handler = ComicChangeHandler(self.active_cache, self.active_pages_handler, main_loop)
            self.observer = Observer()
            self.observer.schedule(event_handler, str(self.active_cache.scan_path), recursive=True)
            self.observer.start()
            logger.info(f"Restarted monitoring: {self.active_cache.scan_path}")

        book_count = len(self.active_cache.books_index)
        logger.info(f"Force rescan complete. Found {book_count} books.")
        return {"success": True, "book_count": book_count}


lib_mgr = ComicLibraryManager()
