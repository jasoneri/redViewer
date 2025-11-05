# comic_cache.py (新文件)
import asyncio
import sqlite3
from pathlib import Path

from concurrent.futures import ThreadPoolExecutor
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from loguru import logger

from utils import conf_dir, md5, scan_book_dir
from utils.butils import BookData
from .model import BookPagesHandler


class ComicCacheManager:
    def __init__(self, comic_path, table_name: str):
        self.comic_path = Path(comic_path)
        self.db_path = conf_dir.joinpath("lib_cache.db")
        self.table_name = table_name
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
        logger.debug(f"Loaded {len(self.books_index)} books from cache table '{self.table_name}'.")

    def is_scanned(self) -> bool:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(f'SELECT 1 FROM "{self.table_name}" LIMIT 1')
            return cursor.fetchone() is not None

    def initial_scan(self):
        logger.debug(f"Performing initial full scan for table '{self.table_name}'...")
        # 1. 获取所有书籍目录的路径
        try:
            all_book_paths = [entry for entry in self.comic_path.iterdir() if entry.is_dir()]
        except OSError as e:
            return
        # 2. 使用线程池并行扫描所有目录
        books_data_for_db = []
        results = self.executor.map(scan_book_dir, all_book_paths)
        for result in results:
            if result:
                book_name, mtime, first_img = result
                bmd5 = md5(book_name)
                books_data_for_db.append((bmd5, book_name, mtime, first_img))
                book = BookData(bmd5, book_name, mtime)
                book.first_img = first_img
                self.books_index[bmd5] = book
        # 3. 使用 executemany 进行批量数据库写入，效率极高
        if books_data_for_db:
            with self._get_conn() as conn:
                conn.execute(f'DELETE FROM "{self.table_name}"')
                with conn:
                    conn.executemany(
                        f'''INSERT INTO "{self.table_name}" (md5, name, mtime, first_img) 
                            VALUES (?, ?, ?, ?)''',
                        books_data_for_db
                    )
            logger.debug(f"Batch inserted {len(books_data_for_db)} books into cache.")
        logger.debug("Initial scan complete.")

    async def update_book_async(self, book_name: str):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self.executor, self.update_book_sync, book_name)

    def update_book_sync(self, book_name):
        book_path = self.comic_path.joinpath(book_name)
        
        scan_result = scan_book_dir(book_path)
        if not scan_result:
            logger.debug(f"Skipping update for non-existent or empty path: {book_name}")
            return
        _, mtime, first_img = scan_result
        bmd5 = md5(book_name)
        with self._get_conn() as conn:
            conn.execute(
                f'''REPLACE INTO "{self.table_name}" (md5, name, mtime, first_img) 
                        VALUES (?, ?, ?, ?)''',
                (bmd5, book_name, mtime, first_img)
            )
        book = BookData(bmd5, book_name, mtime)
        book.first_img = first_img
        self.books_index[bmd5] = book
        logger.debug(f"Updated cache for: {book_name}")

    async def remove_book_async(self, book_name: str):
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self.executor, self.remove_book, book_name)

    def remove_book(self, book_name):
        bmd5 = md5(book_name)
        with self._get_conn() as conn:
            conn.execute(f'DELETE FROM "{self.table_name}" WHERE md5 = ?', (bmd5,))
        if bmd5 in self.books_index:
            del self.books_index[bmd5]
        logger.debug(f"Removed from cache: {book_name}")


class ComicChangeHandler(FileSystemEventHandler):
    def __init__(self, cache_manager: ComicCacheManager, pages_handler: BookPagesHandler, main_loop):
        self.cache = cache_manager
        self.pages_handler = pages_handler
        self.loop = main_loop
        self._pending_updates = {}  # {book_name: asyncio.Task}
        self._debounce_delay = 2.0

    async def _debounced_update(self, book_name):
        await asyncio.sleep(self._debounce_delay)
        # invalidate 会清空页面缓存，下次访问时会重新扫描
        await self.pages_handler.invalidate(book_name)
        await self.cache.update_book_async(book_name)
        self._pending_updates.pop(book_name, None)

    def on_created(self, event):
        try:
            relative_path = Path(event.src_path).relative_to(self.cache.comic_path)
            if not relative_path.parts: 
                return
            book_name = relative_path.parts[0]
        except ValueError:
            return
        if book_name in self._pending_updates:
            self._pending_updates[book_name].cancel()
        task = asyncio.run_coroutine_threadsafe(self._debounced_update(book_name), self.loop)
        self._pending_updates[book_name] = task

    def on_deleted(self, event):
        try:
            relative_path = Path(event.src_path).relative_to(self.cache.comic_path)
            if not relative_path.parts: # 对应 relative_path == '.'
                return
            book_name = relative_path.parts[0]
        except (ValueError, IndexError):
            return
        if len(relative_path.parts) == 1:   
            # remark 不能对已删除的文件路径进行诸如 is_file/is_dir 等操作，因为 event.src_path 是已经被执行(删除/转移)前的路径，现已为空
            asyncio.run_coroutine_threadsafe(
                self.cache.remove_book_async(book_name), self.loop)
            asyncio.run_coroutine_threadsafe(
                self.pages_handler.invalidate(book_name), self.loop)    

    def on_moved(self, event):
        # 受监控的是 web , 路由函数处理的 web_handle 与 web 同级，对 watchdog 而言相当于删除，所以 on_moved 并没有起作用
        ...


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
                for entry in new_comic_path.iterdir():
                    if entry.is_dir():
                        fs_book_names.add(entry.name)
            except OSError as e:
                logger.error(f"Failed to scan comic path {new_comic_path}: {e}")
            deleted_books = db_book_names - fs_book_names
            added_books = fs_book_names - db_book_names
            if deleted_books:
                logger.info(f"Found {len(deleted_books)} books deleted offline. Removing from cache...")
                for book_name in deleted_books:
                    cache_manager.remove_book(book_name) 
            if added_books:
                logger.info(f"Found {len(added_books)} books added offline. Adding to cache...")
                for book_name in added_books:
                    await asyncio.to_thread(cache_manager.update_book_sync, book_name)
            logger.debug("Startup synchronization complete.")
            
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
        logger.debug(f"Now monitoring: {new_comic_path} in table '{self.active_cache.table_name}'")


lib_mgr = ComicLibraryManager()
