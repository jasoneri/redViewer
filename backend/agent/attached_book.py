"""Backend-owned attach-book cache for CGS MCP chat."""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass


@dataclass(frozen=True)
class AttachedBook:
    attach_book_id: str
    book_id: str
    book: str
    title: str | None
    created_at: float


class AttachedBookStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._attached_books: dict[str, AttachedBook] = {}

    def create(self, *, book_id: str, book: str, title: str | None) -> AttachedBook:
        record = AttachedBook(
            attach_book_id=f'attach-{uuid.uuid4()}',
            book_id=book_id,
            book=book,
            title=title,
            created_at=time.time(),
        )
        with self._lock:
            self._attached_books[record.attach_book_id] = record
        return record

    def get(self, attach_book_id: str | None) -> AttachedBook | None:
        if not attach_book_id:
            return None
        with self._lock:
            return self._attached_books.get(attach_book_id)

    def remove(self, attach_book_id: str | None) -> None:
        if not attach_book_id:
            return
        with self._lock:
            self._attached_books.pop(attach_book_id, None)

    def detach(self, attach_book_id: str | None) -> None:
        self.remove(attach_book_id)

    def clear(self) -> None:
        with self._lock:
            self._attached_books.clear()


attached_book_store = AttachedBookStore()
