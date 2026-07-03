#!/usr/bin/python
# -*- coding: utf-8 -*-
"""Mobile client API contracts."""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sse_starlette import EventSourceResponse

from api.mobile_library import (
    book_meta as resolve_book_meta,
    book_meta_map as resolve_book_meta_map,
    library_books as build_library_books,
    library_item as build_library_item,
)
from api.routes.cgs import cgs_mcp_chat_events
from agent.contract import CgsMcpChatRequest, SelectionHint
from core import lib_mgr
from infra import backend


mobile_router = APIRouter(prefix="/mobile")

ReadingMode = Literal["scroll", "page"]
ReadStatus = Literal["unread", "reading", "completed"]


class ProgressUpsertRequest(BaseModel):
    book: str = Field(min_length=1)
    ep: str | None = None
    device_id: str = Field(min_length=1)
    page_index: int = Field(default=0, ge=0)
    scroll_top: int = Field(default=0, ge=0)
    reading_mode: ReadingMode = "scroll"
    status: ReadStatus = "reading"
    updated_at: int = Field(gt=0)


async def ensure_library_loaded():
    if not lib_mgr.active_path:
        await lib_mgr.switch_library(backend.config.comic_path)


def _book_data(book: str, ep: str):
    cache = lib_mgr.active_cache
    if not cache:
        raise HTTPException(503, "library is not loaded")
    item = cache.books_index.get((book, ep or ""))
    if not item:
        raise HTTPException(404, f"book[{book}] not exist")
    return item


def _progress_backend():
    cache = lib_mgr.active_cache
    if not cache:
        raise HTTPException(503, "library is not loaded")
    storage = cache.backend
    if not storage.supports_progress_sync():
        raise HTTPException(400, "current storage backend does not support mobile progress sync")
    return storage


def _path_configured() -> bool:
    if hasattr(backend.config, "is_path_configured"):
        return backend.config.is_path_configured
    path = backend.config.comic_path
    return bool(path and str(path).strip())


def _book_meta_map() -> dict[str, dict[str, Any]]:
    cache = lib_mgr.active_cache
    if not cache:
        raise HTTPException(503, "library is not loaded")
    return resolve_book_meta_map(cache.backend)


def _book_meta(book: str, meta_map: dict[str, dict[str, Any]]) -> dict[str, Any]:
    return resolve_book_meta(book, meta_map)


def _library_item(item, meta_map: dict[str, dict[str, Any]] | None = None) -> dict:
    return build_library_item(item, meta_map)


def _library_books(items: list, sort: str, meta_map: dict[str, dict[str, Any]] | None = None) -> list[dict]:
    return build_library_books(items, sort, meta_map)


def _manifest_item(item, pages_obj: dict, meta_map: dict[str, dict[str, Any]] | None = None) -> dict:
    ep = item.ep or ""
    pages = pages_obj.get("pages") or []
    return {
        **_library_item(item, meta_map),
        "page_count": pages_obj.get("page_count", len(pages)),
        "pages": pages,
        "version": str(item.mtime),
    }


def _conflict_response(progress: dict):
    raise HTTPException(
        status_code=409,
        detail={"code": "progress_conflict", "server_progress": progress},
    )


@mobile_router.get("/status")
async def mobile_status():
    await ensure_library_loaded()
    cache = lib_mgr.active_cache
    return {
        "status": "ok",
        "library_loaded": bool(cache),
        "progress_sync": bool(cache and cache.backend.supports_progress_sync()),
        "storage_backend": backend.config.storage_backend,
        "path_configured": _path_configured(),
        "ero": lib_mgr.ero,
    }


@mobile_router.get("/library")
async def mobile_library(sort: str = Query("time_desc"), compact: bool = Query(False), sync: bool = Query(False)):
    await ensure_library_loaded()
    if sync:
        try:
            await lib_mgr.sync_active_cache()
        except RuntimeError as exc:
            raise HTTPException(503, str(exc)) from exc
    cache = lib_mgr.active_cache
    if not cache:
        raise HTTPException(503, "library is not loaded")

    if sort == "name_asc":
        items = sorted(cache.books_index.values(), key=lambda item: item.name)
    elif sort == "name_desc":
        items = sorted(cache.books_index.values(), key=lambda item: item.name, reverse=True)
    elif sort == "time_asc":
        items = sorted(cache.books_index.values(), key=lambda item: item.mtime)
    else:
        items = sorted(cache.books_index.values(), key=lambda item: item.mtime, reverse=True)

    meta_map = _book_meta_map()
    books = _library_books(items, sort, meta_map)
    response = {
        "books": books,
        "count": len(items),
        "book_count": len(books),
        "ero": lib_mgr.ero,
        "path_configured": _path_configured(),
    }
    if not compact:
        response["items"] = [_library_item(item, meta_map) for item in items]
    return response


@mobile_router.get("/manifest")
async def mobile_manifest(book: str = Query(min_length=1), ep: str | None = None, hard_refresh: bool = False):
    await ensure_library_loaded()
    item = _book_data(book, ep or "")
    pages_obj = await lib_mgr.active_pages_handler.get_pages(book, ep, hard_refresh)
    if not pages_obj or not pages_obj.get("pages"):
        raise HTTPException(404, f"book[{book}] not exist")
    return _manifest_item(item, pages_obj, _book_meta_map())


@mobile_router.get("/progress")
async def get_mobile_progress(book: str = Query(min_length=1), ep: str | None = None, device_id: str | None = None):
    await ensure_library_loaded()
    _book_data(book, ep or "")
    storage = _progress_backend()
    latest = storage.get_latest_progress(book, ep or "")
    device_progress = storage.get_progress(book, ep or "", device_id) if device_id else None
    return {
        "progress": device_progress or latest,
        "device_progress": device_progress,
        "latest_progress": latest,
    }


@mobile_router.post("/progress")
async def upsert_mobile_progress(req: ProgressUpsertRequest):
    await ensure_library_loaded()
    ep = req.ep or ""
    _book_data(req.book, ep)
    storage = _progress_backend()
    payload = req.model_dump()
    payload["ep"] = ep

    current_device = storage.get_progress(req.book, ep, req.device_id)
    if current_device and current_device["updated_at"] > req.updated_at:
        _conflict_response(current_device)

    latest = storage.get_latest_progress(req.book, ep)
    if latest and latest["device_id"] != req.device_id and latest["updated_at"] > req.updated_at:
        _conflict_response(latest)

    saved = storage.upsert_progress(payload)
    return {
        "saved": saved,
        "latest_progress": storage.get_latest_progress(req.book, ep),
        "conflict": False,
    }


class MobileCgsRequest(BaseModel):
    """Mobile CGS chat request (Phase F).

    RVUX001: attachedBook is explicit pinned state.
    ``book_name`` is a legacy UI hint and must not create attached-book
    context. Only explicit attach ids represent the pinned state.
    """

    prompt: str
    llm: dict[str, str]  # {base_url, api_key, model} - required, provided by mobile client
    preview_mode: bool = False
    book_name: str | None = None
    attach_book_id: str | None = None
    attach_book_ids: list[str] | None = None
    attached_book_list: list[dict[str, Any]] | None = None
    session_id: str | None = None
    cgs_session_id: str | None = None
    candidates: list[dict[str, Any]] | None = None
    selection: dict[str, Any] | None = None
    preference_context: dict[str, Any] | None = None


def _mobile_attach_book_ids(req: MobileCgsRequest) -> list[str]:
    ids: list[str] = []
    if req.attach_book_ids:
        ids.extend(req.attach_book_ids)
    elif req.attach_book_id:
        ids.append(req.attach_book_id)
    for book in req.attached_book_list or []:
        attach_book_id = str(book.get('attach_book_id') or '').strip()
        if attach_book_id:
            ids.append(attach_book_id)
    seen: set[str] = set()
    result: list[str] = []
    for attach_book_id in ids:
        clean_id = str(attach_book_id or '').strip()
        if not clean_id or clean_id in seen:
            continue
        seen.add(clean_id)
        result.append(clean_id)
    return result


@mobile_router.post("/cgs/chat")
async def mobile_cgs_chat(req: MobileCgsRequest):
    """Phase F: mobile CGS chat SSE endpoint.

    attachedBook is an explicit state machine; do not infer it from
    ``book_name`` or the current mobile page.
    """
    from agent.contract import CgsMcpLlmRequest

    attach_book_ids = _mobile_attach_book_ids(req)
    internal_req = CgsMcpChatRequest(
        prompt=req.prompt,
        preview_mode=req.preview_mode,
        session_id=req.cgs_session_id or req.session_id,
        attach_book_id=req.attach_book_id or (attach_book_ids[0] if len(attach_book_ids) == 1 else None),
        attach_book_ids=attach_book_ids or None,
        candidates=req.candidates,
        selection=SelectionHint(**req.selection) if req.selection else None,
        preference_context=req.preference_context,
        llm=CgsMcpLlmRequest(**req.llm),
    )

    async def event_generator():
        async for event_name, payload in cgs_mcp_chat_events(internal_req):
            yield {"event": event_name, "data": payload}

    return EventSourceResponse(event_generator())
