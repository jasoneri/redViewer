#!/usr/bin/python
# -*- coding: utf-8 -*-
"""
CBZ 文件缓存模块

提供 ZipFile 对象的 LRU 缓存，避免重复打开 .cbz 文件，显著提升性能。
"""
import threading
import zipfile
from collections import OrderedDict
from pathlib import Path
from typing import Optional
from loguru import logger


class CBZCache:
    """
    ZipFile 对象的 LRU 缓存
    
    特性:
    - LRU (Least Recently Used) 淘汰策略
    - 线程安全
    - 自动关闭被淘汰的 ZipFile
    - 支持手动清理
    
    使用示例:
        cache = CBZCache(max_size=50)
        
        # 提取图片
        image_data = cache.extract_image(cbz_path, "page01.jpg")
        
        # 清理缓存
        cache.close_all()
    """
    
    def __init__(self, max_size: int = 50):
        """
        初始化缓存
        
        Args:
            max_size: 最大缓存的 ZipFile 数量，默认 50
                     预计内存占用: 50 * 5MB = 250MB (估算)
        """
        self.max_size = max_size
        self._cache = OrderedDict()  # {path_str: ZipFile}
        self._lock = threading.RLock()
        self._stats = {'hits': 0, 'misses': 0, 'evictions': 0}
        logger.debug(f"CBZCache initialized with max_size={max_size}")
    
    def get_zipfile(self, cbz_path: Path) -> Optional[zipfile.ZipFile]:
        """
        获取缓存的 ZipFile 对象
        
        Args:
            cbz_path: .cbz 文件路径
            
        Returns:
            ZipFile 对象，如果文件无法打开则返回 None
        """
        path_str = str(cbz_path.resolve())
        
        with self._lock:
            # 检查缓存
            if path_str in self._cache:
                # 缓存命中，移到最后（最近使用）
                self._cache.move_to_end(path_str)
                self._stats['hits'] += 1
                logger.trace(f"Cache HIT: {cbz_path.name}")
                return self._cache[path_str]
            
            # 缓存未命中
            self._stats['misses'] += 1
            logger.trace(f"Cache MISS: {cbz_path.name}")
            
            # 检查文件是否存在
            if not cbz_path.exists():
                logger.warning(f"CBZ file not found: {cbz_path}")
                return None
            
            # 打开新的 ZipFile
            try:
                zf = zipfile.ZipFile(cbz_path, 'r')
                
                # 如果缓存已满，移除最久未使用的项
                if len(self._cache) >= self.max_size:
                    self._evict_oldest()
                
                # 添加到缓存
                self._cache[path_str] = zf
                logger.trace(f"Cached new ZipFile: {cbz_path.name}")
                return zf
                
            except (zipfile.BadZipFile, OSError, Exception) as e:
                logger.error(f"Failed to open CBZ file {cbz_path}: {e}")
                return None
    
    def extract_image(self, cbz_path: Path, image_name: str) -> Optional[bytes]:
        """
        从缓存的 ZipFile 中提取图片
        
        Args:
            cbz_path: .cbz 文件路径
            image_name: ZIP 内的图片文件名
            
        Returns:
            图片字节数据，失败则返回 None
        """
        zf = self.get_zipfile(cbz_path)
        if not zf:
            return None
        
        try:
            return zf.read(image_name.split('/')[-1])
        except (KeyError, RuntimeError, Exception) as e:
            logger.error(f"Failed to extract {image_name} from {cbz_path.name}: {e}")
            # 如果读取失败，可能是文件损坏，从缓存中移除
            self._remove_from_cache(cbz_path)
            return None
    
    def _evict_oldest(self):
        """移除最久未使用的 ZipFile"""
        with self._lock:
            if not self._cache:
                return
            
            # OrderedDict 的第一项是最久未使用的
            path_str, zf = self._cache.popitem(last=False)
            try:
                zf.close()
                self._stats['evictions'] += 1
                logger.trace(f"Evicted from cache: {Path(path_str).name}")
            except Exception as e:
                logger.error(f"Error closing evicted ZipFile: {e}")
    
    def _remove_from_cache(self, cbz_path: Path):
        """从缓存中移除指定的 ZipFile"""
        path_str = str(cbz_path.resolve())
        
        with self._lock:
            if path_str in self._cache:
                zf = self._cache.pop(path_str)
                try:
                    zf.close()
                    logger.debug(f"Removed from cache: {cbz_path.name}")
                except Exception as e:
                    logger.error(f"Error closing removed ZipFile: {e}")
    
    def invalidate(self, cbz_path: Path):
        """
        使指定文件的缓存失效
        
        用于文件被修改时清除缓存
        
        Args:
            cbz_path: .cbz 文件路径
        """
        self._remove_from_cache(cbz_path)
    
    def close_all(self):
        """关闭所有缓存的 ZipFile"""
        with self._lock:
            for path_str, zf in self._cache.items():
                try:
                    zf.close()
                except Exception as e:
                    logger.error(f"Error closing ZipFile {path_str}: {e}")
            
            self._cache.clear()
            logger.info(f"Closed all cached ZipFiles. Stats: {self._stats}")
    
    def get_stats(self) -> dict:
        """
        获取缓存统计信息
        
        Returns:
            包含 hits, misses, evictions, size, hit_rate 的字典
        """
        with self._lock:
            total = self._stats['hits'] + self._stats['misses']
            hit_rate = (self._stats['hits'] / total * 100) if total > 0 else 0
            
            return {
                'hits': self._stats['hits'],
                'misses': self._stats['misses'],
                'evictions': self._stats['evictions'],
                'size': len(self._cache),
                'max_size': self.max_size,
                'hit_rate': f"{hit_rate:.2f}%"
            }
    
    def __del__(self):
        """析构函数：确保所有 ZipFile 被关闭"""
        try:
            self.close_all()
        except:
            pass


# 全局缓存实例
_global_cbz_cache: Optional[CBZCache] = None


def get_cbz_cache() -> CBZCache:
    """获取全局 CBZ 缓存实例"""
    global _global_cbz_cache
    if _global_cbz_cache is None:
        _global_cbz_cache = CBZCache(max_size=50)
    return _global_cbz_cache


def close_cbz_cache():
    """关闭全局 CBZ 缓存"""
    global _global_cbz_cache
    if _global_cbz_cache:
        _global_cbz_cache.close_all()
        _global_cbz_cache = None