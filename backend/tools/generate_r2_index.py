#!/usr/bin/python
# -*- coding: utf-8 -*-
"""R2 索引生成工具

这个工具用于扫描本地漫画目录，生成 _index.json 索引文件。
生成后需要上传到 R2 存储桶，后端会从 R2 读取这个索引来获取书籍列表。

https://www.yuque.com/baimusheng/programer/iay3gk6wahq34bvu?singleDoc
"""

import re
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

# 图片扩展名
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'}


def natural_sort_key(s):
    """自然排序键"""
    return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', str(s))]


def scan_directory(base_path: Path) -> list:
    """扫描目录，生成书籍索引"""
    books = []
    
    for item in sorted(base_path.iterdir(), key=lambda x: natural_sort_key(x.name)):
        if item.name.startswith('.') or item.name.startswith('_'):
            continue
        
        if item.is_dir():
            # 检查是否有子目录（多章节结构）
            if subdirs := [d for d in item.iterdir() if d.is_dir() and not d.name.startswith('.')]:
                # 多章节结构：book/ep/images
                for subdir in sorted(subdirs, key=lambda x: natural_sort_key(x.name)):
                    if book_info := scan_book(subdir, book_name=item.name, ep_name=subdir.name):
                        books.append(book_info)
            elif book_info := scan_book(item, book_name=item.name, ep_name=""):
                # 单章节结构：book/images
                books.append(book_info)
    return books


def scan_book(path: Path, book_name: str, ep_name: str) -> dict:
    """扫描单本书籍"""
    images = sorted(
        [f.name for f in path.iterdir() if f.suffix.lower() in IMAGE_EXTENSIONS],
        key=natural_sort_key
    )
    
    if not images:
        return None
    
    mtime = path.stat().st_mtime
    
    return {
        "book": book_name,
        "ep": ep_name,
        "first_img": images[0],
        "page_count": len(images),
        "mtime": mtime,
        "pages": images
    }


def main():
    parser = argparse.ArgumentParser(description='生成 R2 静态索引文件')
    parser.add_argument('path', help='要扫描的目录路径')
    parser.add_argument('--ero', action='store_true', help='是否为同人志目录')
    parser.add_argument('--output', '-o', default='_index.json', help='输出文件名')
    parser.add_argument('--no-pages', action='store_true', help='不包含完整页面列表（减小文件体积）')
    
    args = parser.parse_args()
    
    base_path = Path(args.path)
    if not base_path.exists():
        print(f"错误：目录不存在 {base_path}")
        return 1
    
    print(f"扫描目录: {base_path}")
    books = scan_directory(base_path)
    
    if args.no_pages:
        for book in books:
            book.pop('pages', None)
    
    index = {
        "books": books,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ero": args.ero
    }
    
    output_path = base_path / args.output
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    print(f"已生成索引: {output_path}")
    print(f"书籍数量: {len(books)}")
    
    return 0


if __name__ == '__main__':
    exit(main())