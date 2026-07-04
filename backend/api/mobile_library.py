#!/usr/bin/python
# -*- coding: utf-8 -*-
"""Shared mobile-library projection helpers."""

from __future__ import annotations

from typing import Any

from utils import md5
from utils.book_meta import normalize_meta_book_name


def episode_sort_key(ep: str) -> tuple[int, str]:
    digits = "".join(ch for ch in ep if ch.isdigit())
    return (int(digits) if digits else 0, ep)


def item_id(book: str, ep: str) -> str:
    return md5(f"{book}/{ep or ''}")


def book_meta_map(storage_backend: Any) -> dict[str, dict[str, Any]]:
    loader = getattr(storage_backend, "load_book_metainfo_map", None)
    return loader() if callable(loader) else {}


def book_meta(book: str, meta_map: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return meta_map.get(book) or meta_map.get(normalize_meta_book_name(book)) or {
        "artist": None,
        "source": None,
        "preview_url": None,
        "public_date": None,
        "tags": [],
        "pages": None,
        "btype": None,
    }


def library_item(item: Any, meta_map: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    api = item.to_api()
    ep = api.get("ep") or ""
    return {
        "id": item_id(api["book"], ep),
        "book": api["book"],
        "ep": ep,
        "title": f"{api['book']} / {ep}" if ep else api["book"],
        "first_img": api.get("first_img"),
        "mtime": item.mtime,
        "ero": item.ero,
        "meta": book_meta(api["book"], meta_map or {}),
    }


def library_books(items: list[Any], sort: str, meta_map: dict[str, dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    singles: list[dict[str, Any]] = []
    grouped: dict[str, list[dict[str, Any]]] = {}

    for item in items:
        api = library_item(item, meta_map)
        if api["ep"]:
            grouped.setdefault(api["book"], []).append(api)
        else:
            singles.append({
                **api,
                "kind": "single",
                "episode_count": 0,
                "episodes": [],
            })

    books = singles.copy()
    for book_name, episodes in grouped.items():
        episodes.sort(key=lambda row: episode_sort_key(row["ep"]))
        first_img = next((row["first_img"] for row in episodes if row["first_img"]), None)
        books.append({
            "id": item_id(book_name, ""),
            "kind": "series",
            "book": book_name,
            "ep": "",
            "title": book_name,
            "first_img": first_img,
            "mtime": max(row["mtime"] for row in episodes),
            "ero": episodes[0]["ero"],
            "episode_count": len(episodes),
            "episodes": episodes,
            "meta": book_meta(book_name, meta_map or {}),
        })

    if sort == "name_asc":
        return sorted(books, key=lambda row: row["book"])
    if sort == "name_desc":
        return sorted(books, key=lambda row: row["book"], reverse=True)
    if sort == "time_asc":
        return sorted(books, key=lambda row: row["mtime"])
    return sorted(books, key=lambda row: row["mtime"], reverse=True)


def local_library_projection(book_row: dict[str, Any]) -> dict[str, Any]:
    episodes = book_row.get("episodes") or []
    return {
        "kind": str(book_row.get("kind") or "single"),
        "book": str(book_row.get("book") or ""),
        "title": book_row.get("title"),
        "episode_count": int(book_row.get("episode_count") or 0),
        "episodes": [
            {
                "book": str(episode.get("book") or ""),
                "ep": str(episode.get("ep") or ""),
                "title": episode.get("title"),
            }
            for episode in episodes
        ],
    }
