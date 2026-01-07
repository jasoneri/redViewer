import asyncio
import sqlite3
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from watchdog.observers import Observer
from .logging import get_logger

logger = get_logger()

from utils import conf, Var
from utils.butils import build_book_path
from models import BookData
from utils.mode_strategy import ModeStrategyFactory
from utils.cbz_cache import close_cbz_cache
from .pages import BookPagesHandler
from .watcher import ComicChangeHandler


class ComicCacheManager:
    def __init__(self, _path: Path, ero: int = 0):
        self.comic_path = Path(_path)
        self.ero = ero
        self.db_path = self.comic_path / "rV.db"
        self.scan_path = self.comic_path / f"_{Var.doujinshi}" if ero else self.comic_path
        self.executor = ThreadPoolExecutor(max_workers=10)
        self.scan_strategy = ModeStrategyFactory.create(self.scan_path)
        self.books_index = {}  # {(book, ep): BookData}
        self._create_table()

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    def _create_table(self):
        with self._get_conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS `episodes` (
                    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
                    `book` TEXT NOT NULL,
                    `ep` TEXT NOT NULL DEFAULT '',
                    `exist` INTEGER NOT NULL DEFAULT 1,
                    `rv_handle` TEXT,
                    `ero` INTEGER NOT NULL DEFAULT 0,
                    `mtime` REAL,
                    `first_img` TEXT,
                    UNIQUE(book, ep)
                )
            """)

    def _build_book_path(self, book: str, ep: str) -> Path:
        return build_book_path(self.scan_path, book, ep)

    def load_from_db(self):
        incomplete_entries = []
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT book, ep, mtime, first_img, ero FROM episodes WHERE exist = 1 and ero = ?', (self.ero,))
            for row in cursor.fetchall():
                book, ep, mtime, first_img, ero = row
                if mtime is None or first_img is None:
                    incomplete_entries.append((book, ep))
                else:
                    book_data = BookData(book, ep, mtime, first_img, ero)
                    self.books_index[(book, ep)] = book_data
        logger.debug(f"Loaded {len(self.books_index)} books from rV.db (ero={self.ero})")
        if incomplete_entries:
            self._fetch_missing_data(incomplete_entries)

    def _fetch_missing_data(self, entries: list):
        logger.debug(f"Fetching missing data for {len(entries)} entries...")
        updates = []
        for book, ep in entries:
            book_path = self._build_book_path(book, ep)
            result = self.scan_strategy.scan_book(book_path, self.scan_path)
            if result:
                _, _, _, mtime, first_img = result
                updates.append((mtime, first_img, book, ep))
                self.books_index[(book, ep)] = BookData(book, ep, mtime, first_img, self.ero)
        if updates:
            with self._get_conn() as conn:
                conn.executemany('UPDATE episodes SET mtime = ?, first_img = ? WHERE book = ? AND ep = ?', updates)
            logger.debug(f"Updated {len(updates)} entries with missing data")

    def is_scanned(self) -> bool:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT 1 FROM episodes WHERE ero = ? LIMIT 1', (self.ero,))
            return cursor.fetchone() is not None

    def initial_scan(self):
        logger.debug(f"Performing initial scan using strategy: {self.scan_strategy.name}")
        all_book_paths = self.scan_strategy.collect_book_paths(self.scan_path)
        if not all_book_paths:
            logger.debug("No books found.")
            return
        
        books_data_for_db = []
        results = self.executor.map(
            lambda path: self.scan_strategy.scan_book(path, self.scan_path),
            all_book_paths
        )
        
        for result in results:
            if result:
                _, parent_name, chapter_name, mtime, first_img = result
                book = parent_name
                ep = "" if chapter_name == parent_name else chapter_name
                books_data_for_db.append((book, ep, mtime, first_img, self.ero))
                self.books_index[(book, ep)] = BookData(book, ep, mtime, first_img, self.ero)
        
        if books_data_for_db:
            with self._get_conn() as conn:
                conn.executemany(
                    '''INSERT OR REPLACE INTO episodes (book, ep, exist, mtime, first_img, ero)
                       VALUES (?, ?, 1, ?, ?, ?)''',
                    books_data_for_db
                )
            logger.debug(f"Batch inserted {len(books_data_for_db)} books into rV.db")
        logger.debug("Initial scan complete.")

    def _scan_fs_entries(self) -> set:
        entries = set()
        all_book_paths = self.scan_strategy.collect_book_paths(self.scan_path)
        for path in all_book_paths:
            result = self.scan_strategy.scan_book(path, self.scan_path)
            if result:
                _, parent_name, chapter_name, _, _ = result
                book = parent_name
                ep = "" if chapter_name == parent_name else chapter_name
                entries.add((book, ep))
        return entries

    async def update_book_async(self, book: str, ep: str):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self.executor, self.update_book_sync, book, ep)

    def update_book_sync(self, book: str, ep: str):
        book_path = self._build_book_path(book, ep)
        scan_result = self.scan_strategy.scan_book(book_path, self.scan_path)
        if not scan_result:
            logger.debug(f"Skipping update for non-existent path: {book}/{ep}")
            return
        
        _, _, _, mtime, first_img = scan_result
        with self._get_conn() as conn:
            conn.execute(
                '''INSERT OR REPLACE INTO episodes (book, ep, exist, mtime, first_img, ero)
                   VALUES (?, ?, 1, ?, ?, ?)''',
                (book, ep, mtime, first_img, self.ero)
            )
        self.books_index[(book, ep)] = BookData(book, ep, mtime, first_img, self.ero)
        logger.debug(f"Updated cache for: {book}/{ep}")

    async def remove_book_async(self, book: str, ep: str):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self.executor, self.remove_book, book, ep)

    def remove_book(self, book: str, ep: str):
        with self._get_conn() as conn:
            conn.execute('UPDATE episodes SET exist = 0 WHERE book = ? AND ep = ?', (book, ep))
        if (book, ep) in self.books_index:
            del self.books_index[(book, ep)]
            logger.debug(f"Removed from cache: {book}/{ep}")

    def set_handle(self, book: str, ep: str, handle: str):
        with self._get_conn() as conn:
            conn.execute(
                'UPDATE episodes SET rv_handle = ?, exist = 0 WHERE book = ? AND ep = ?',
                (handle, book, ep)
            )
        if (book, ep) in self.books_index:
            del self.books_index[(book, ep)]
        logger.debug(f"Set handle '{handle}' for: {book}/{ep}")

    def reset_exist_flags(self):
        """重置 exist 字段并清空内存缓存"""
        with self._get_conn() as conn:
            conn.execute('UPDATE episodes SET exist = 0 WHERE ero = ?', (self.ero,))
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
                cache_manager.load_from_db()
                await self._sync_startup(cache_manager)
            
            self.cache_instances[cache_key] = cache_manager
            self.pages_handlers[cache_key] = pages_handler
            self.active_cache = cache_manager
            self.active_pages_handler = pages_handler

        if main_loop:
            event_handler = ComicChangeHandler(self.active_cache, self.active_pages_handler, main_loop)
            self.observer = Observer()
            self.observer.schedule(event_handler, str(self.active_cache.scan_path), recursive=True)
            self.observer.start()
            logger.debug(f"Now monitoring: {self.active_cache.scan_path} (ero={self.ero})")

    async def _sync_startup(self, cache_manager: ComicCacheManager):
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
            for book, ep in added:
                await asyncio.to_thread(cache_manager.update_book_sync, book, ep)
        
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
        if main_loop:
            event_handler = ComicChangeHandler(self.active_cache, self.active_pages_handler, main_loop)
            self.observer = Observer()
            self.observer.schedule(event_handler, str(self.active_cache.scan_path), recursive=True)
            self.observer.start()
            logger.info(f"Restarted monitoring: {self.active_cache.scan_path}")
        
        book_count = len(self.active_cache.books_index)
        logger.info(f"Force rescan complete. Found {book_count} books.")
        return {"success": True, "book_count": book_count}


lib_mgr = ComicLibraryManager()