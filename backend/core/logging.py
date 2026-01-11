import os
import sys
import logging
from pathlib import Path
from loguru import logger as lg


_initialized = False


def _get_file_log_level() -> str:
    if level := os.getenv('RV_LOG_LEVEL'):
        return level.upper()
    return 'WARNING'


class InterceptHandler(logging.Handler):
    def emit(self, record):
        try:
            level = lg.level(record.levelname).name
        except ValueError:
            level = record.levelno
        frame, depth = sys._getframe(6), 6
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1
        lg.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def setup_logging(log_path: Path):
    global _initialized
    if _initialized:
        return
    
    file_level = _get_file_log_level()
    log_path.mkdir(parents=True, exist_ok=True)
    lg.remove()
    lg.add(sys.stderr, level="DEBUG")
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"):
        logging.getLogger(name).handlers = [InterceptHandler()]
        logging.getLogger(name).propagate = False
    
    lg.add(
        log_path / "fastapi.log",
        filter=lambda r: r["name"].startswith("uvicorn") or r["name"].startswith("fastapi"),
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}",
        level=file_level, retention="3 days", encoding="utf-8"
    )
    
    lg.add(
        log_path / "backend.log",
        filter=lambda r: "backend" in r["extra"],
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | [{name}]: {message}",
        level=file_level, retention="3 days", encoding="utf-8"
    )
    
    _initialized = True


def get_logger():
    return lg.bind(backend=True)