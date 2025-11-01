# comic_cache.py (新文件)
import os
import asyncio
import sqlite3
from pathlib import Path

from concurrent.futures import ThreadPoolExecutor
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from utils import conf_dir, md5
from utils.butils import BookData
from .model import BookPagesHandler


class ComicCacheManager:
    def __init__(self, comic_path, table_name: str):
        self.comic_path = comic_path
        self.db_path = conf_dir.joinpath("lib_cache.db")
        self.table_name = table_name
        # self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.executor = ThreadPoolExecutor(max_workers=10)

        self.books_index = {} # {md5: BookData}
        self._create_table()

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    def _create_table(self):
        # 存储书籍元数据
        with self._get_conn() as conn:
            conn.execute(f"""
                CREATE TABLE IF NOT EXISTS "{self.table_name}" (
                    md5 TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    mtime REAL NOT NULL,
                    first_img TEXT
                )
            """)

    def load_from_db(self):
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(f'SELECT md5, name, mtime, first_img FROM "{self.table_name}"')
            for row in cursor.fetchall():
                _md5, name, mtime, first_img = row
                book = BookData(_md5, name, mtime)
                book.first_img = first_img
                self.books_index[_md5] = book
        # logger.debug(f"Loaded {len(self.books_index)} books from cache table '{self.table_name}'.")

    def is_scanned(self) -> bool:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(f'SELECT 1 FROM "{self.table_name}" LIMIT 1')
            return cursor.fetchone() is not None

    def initial_scan(self):
        # logger.debug(f"Performing initial full scan for table '{self.table_name}'...")
        with self._get_conn() as conn:
            conn.execute(f'DELETE FROM "{self.table_name}"')
        
        with os.scandir(self.comic_path) as entries:
            for entry in entries:
                if entry.is_dir():
                    # 这里改为同步调用，因为 initial_scan 整体已在线程中运行
                    self.update_book_sync(entry.name)
        # logger.debug("Initial scan complete.")

    async def update_book_async(self, book_name: str):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self.executor, self.update_book_sync, book_name)

    def update_book_sync(self, book_name):
        book_path = self.comic_path.joinpath(book_name)
        if not os.path.exists(book_path):
            # logger.debug(f"Skipping update for non-existent path: {book_name}")
            return
        stat = os.stat(book_path)
        bmd5 = md5(book_name)
        first_img = self._get_first_img_sync(book_path)

        with self._get_conn() as conn:
            conn.execute(
                f'''REPLACE INTO "{self.table_name}" (md5, name, mtime, first_img) 
                        VALUES (?, ?, ?, ?)''',
                (bmd5, book_name, stat.st_mtime, first_img)
            )
        book = BookData(bmd5, book_name, stat.st_mtime)
        book.first_img = first_img
        self.books_index[bmd5] = book
        # logger.debug(f"Updated cache for: {book_name}")

    async def remove_book_async(self, book_name: str):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self.executor, self.remove_book, book_name)

    def remove_book(self, book_name):
        bmd5 = md5(book_name)
        with self._get_conn() as conn:
            conn.execute(f'DELETE FROM "{self.table_name}" WHERE md5 = ?', (bmd5,))
        if bmd5 in self.books_index:
            del self.books_index[bmd5]
        # logger.debug(f"Removed from cache: {book_name}")

    def _get_first_img_sync(self, book_path):
        try:
            with os.scandir(book_path) as entries:
                return next(entries).name
        except (StopIteration, OSError):
            return None


class ComicChangeHandler(FileSystemEventHandler):
    def __init__(self, cache_manager: ComicCacheManager, pages_handler: BookPagesHandler, main_loop):
        self.cache = cache_manager
        self.pages_handler = pages_handler
        self.loop = main_loop
        # 防抖机制：记录最近处理的事件，避免重复触发
        self._pending_updates = {}  # {book_name: asyncio.Task}
        self._debounce_delay = 2.0  # 1秒防抖延迟

    async def _debounced_update(self, book_name):
        # 这个函数保持不变，但现在只会被 on_created 和 on_deleted 调用
        await asyncio.sleep(self._debounce_delay)
        # 核心：无论是新增还是删除文件，都统一执行“刷新”操作
        # invalidate 会清空页面缓存，下次访问时会重新扫描
        await self.pages_handler.invalidate(book_name)
        # update_book_async 会更新封面、mtime等元数据
        await self.cache.update_book_async(book_name)
        # logger.debug(f"Debounced update completed for: {book_name}")
        self._pending_updates.pop(book_name, None)

    def _schedule_update(self, path):
        try:
            relative_path = os.path.relpath(path, self.cache.comic_path)
            if relative_path == '.': return
            book_name = relative_path.split(os.path.sep)[0]
        except (ValueError, IndexError):
            return
        if book_name in self._pending_updates:
            self._pending_updates[book_name].cancel()
        task = asyncio.run_coroutine_threadsafe(self._debounced_update(book_name), self.loop)
        self._pending_updates[book_name] = task

    def on_created(self, event):
        self._schedule_update(event.src_path)

    def on_deleted(self, event):
        try:
            relative_path = os.path.relpath(event.src_path, self.cache.comic_path)
            if relative_path == '.' or relative_path.startswith('..'):
                return
            parts = relative_path.split(os.path.sep)
            book_name = parts[0]
        except (ValueError, IndexError):
            # logger.warning(f"Could not determine book name from deleted path: {event.src_path}")
            return
        # logger.debug(f"Deletion event detected for path '{event.src_path}', affecting book: '{book_name}'. "
                    f"Triggering cache removal and invalidation regardless of is_directory flag.")

        asyncio.run_coroutine_threadsafe(
            self.cache.remove_book_async(book_name), self.loop)
        asyncio.run_coroutine_threadsafe(
            self.pages_handler.invalidate(book_name), self.loop)    

    def on_modified(self, event):
        """
        处理修改事件，仅响应漫画目录内的文件变化
        使用防抖机制避免频繁触发
        """
        ...

    def on_moved(self, event):
        # 相当于一次删除和一次创建
        if event.is_directory:
            old_book_name = os.path.basename(event.src_path)
            new_book_name = os.path.basename(event.dest_path)
            asyncio.run_coroutine_threadsafe(
                self.cache.remove_book_async(old_book_name), self.loop)
            asyncio.run_coroutine_threadsafe(
                self.pages_handler.invalidate(old_book_name), self.loop)
            asyncio.run_coroutine_threadsafe(
                self.cache.update_book_async(new_book_name), self.loop)


class ComicLibraryManager:
    def __init__(self):
        # 缓存池，存储每个 comic_path 对应的缓存管理器
        self.cache_instances = {}
        self.pages_handlers = {}

        self.active_path = None
        self.active_cache: ComicCacheManager = None
        self.active_pages_handler = None
        self.observer = None

    def _get_table_name(self, comic_path: Path) -> str:
        """为每个路径生成一个唯一的、安全的表名"""
        path_str = str(comic_path.resolve())
        path_hash = md5(path_str)
        return f"lib_{path_hash}"

    async def switch_library(self, new_comic_path, main_loop):
        async def sync_startup():
            db_book_names = {book.name for book in cache_manager.books_index.values()}
            fs_book_names = set()
            try:
                with os.scandir(new_comic_path) as entries:
                    for entry in entries:
                        if entry.is_dir():
                            fs_book_names.add(entry.name)
            except OSError as e:
                # logger.error(f"Failed to scan comic path {new_comic_path}: {e}")
            deleted_books = db_book_names - fs_book_names
            added_books = fs_book_names - db_book_names
            if deleted_books:
                # logger.info(f"Found {len(deleted_books)} books deleted offline. Removing from cache...")
                for book_name in deleted_books:
                    cache_manager.remove_book(book_name) 
            if added_books:
                # logger.info(f"Found {len(added_books)} books added offline. Adding to cache...")
                for book_name in added_books:
                    await asyncio.to_thread(cache_manager.update_book_sync, book_name)
            # logger.debug("Startup synchronization complete.")
            
        new_comic_path = Path(new_comic_path)
        if new_comic_path == self.active_path:
            return

        if self.observer and self.observer.is_alive():
            self.observer.stop()
            self.observer.join()
        
        self.active_path = new_comic_path
        path_key = str(new_comic_path)

        if path_key in self.cache_instances:
            self.active_cache = self.cache_instances[path_key]
            self.active_pages_handler = self.pages_handlers[path_key]
        else:
            # 核心改动：获取表名并传递给 ComicCacheManager
            table_name = self._get_table_name(new_comic_path)
            
            pages_handler = BookPagesHandler(new_comic_path)
            cache_manager = ComicCacheManager(new_comic_path, table_name)
            
            # 改为检查表是否存在，而不是文件
            if not cache_manager.is_scanned():
                await asyncio.to_thread(cache_manager.initial_scan)
            else:
                cache_manager.load_from_db()
            
            await sync_startup()
            
            self.cache_instances[path_key] = cache_manager
            self.pages_handlers[path_key] = pages_handler
            self.active_cache = cache_manager
            self.active_pages_handler = pages_handler

        event_handler = ComicChangeHandler(self.active_cache, self.active_pages_handler, main_loop)
        self.observer = Observer()
        self.observer.schedule(event_handler, str(new_comic_path), recursive=True)
        self.observer.start()
        # logger.debug(f"Now monitoring: {new_comic_path} in table '{self.active_cache.table_name}'")


lib_mgr = ComicLibraryManager()
