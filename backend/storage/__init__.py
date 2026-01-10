#!/usr/bin/python
# -*- coding: utf-8 -*-
"""Storage Backend Module

This module provides an abstraction layer for storage backends,
allowing switching between local filesystem and cloud storage (R2)
via configuration.

Usage:
    from storage import StorageBackendFactory

    # Create a backend instance
    backend = StorageBackendFactory.create(comic_path, ero=0)
"""

from .base import StorageBackend
from .factory import StorageBackendFactory
from .local import LocalStorageBackend

__all__ = [
    'StorageBackend',
    'StorageBackendFactory',
    'LocalStorageBackend',
]
