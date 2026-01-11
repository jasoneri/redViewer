#!/usr/bin/python
# -*- coding: utf-8 -*-
"""Infrastructure Layer - Backend Factory

统一管理配置、认证、存储等后端组件。
根据 RV_DEPLOY_MODE 环境变量自动选择本地/云平台模式。
"""

from .factory import BackendFactory

backend = BackendFactory.get_instance()

__all__ = ['BackendFactory', 'backend']