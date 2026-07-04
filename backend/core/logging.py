import sys
import logging
from pathlib import Path
from loguru import logger as lg


_initialized = False
CONF_LOG_LEVEL = ''
LOG_LEVEL = 'INFO'
LOG_PATH: Path | None = None


def normalize_log_level(level: str | None) -> str:
    candidate = str(level or '').strip().upper()
    if candidate in ('TRACE', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'):
        return candidate
    return 'INFO'


def is_valid_log_level(level: str | None) -> bool:
    return normalize_log_level(level) == str(level or '').strip().upper()


def read_local_conf_log_level() -> str:
    try:
        import yaml
        from platformdirs import user_config_path

        conf_file = user_config_path('redViewer', ensure_exists=False).parent / 'conf.yml'
        if not conf_file.exists():
            return ''
        payload = yaml.safe_load(conf_file.read_text(encoding='utf-8')) or {}
    except Exception:
        return ''
    if not isinstance(payload, dict):
        return ''
    return str(payload.get('log_level') or '').strip()


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


def setup_logging(log_path: Path, conf_log_level: str | None = None):
    global _initialized, CONF_LOG_LEVEL, LOG_LEVEL, LOG_PATH
    LOG_PATH = log_path
    if _initialized:
        return

    CONF_LOG_LEVEL = str(conf_log_level or '').strip()
    LOG_LEVEL = normalize_log_level(CONF_LOG_LEVEL)
    log_path.mkdir(parents=True, exist_ok=True)
    lg.remove()
    lg.add(sys.stderr, level=LOG_LEVEL)
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"):
        logging.getLogger(name).handlers = [InterceptHandler()]
        logging.getLogger(name).propagate = False

    lg.add(
        log_path / "fastapi.log",
        filter=lambda r: r["name"].startswith("uvicorn") or r["name"].startswith("fastapi"),
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {message}",
        level=LOG_LEVEL, retention="3 days", encoding="utf-8"
    )

    lg.add(
        log_path / "backend.log",
        filter=lambda r: "backend" in r["extra"],
        format="{time:YYYY-MM-DD HH:mm:ss} | {level} | [{name}]: {message}",
        level=LOG_LEVEL, retention="3 days", encoding="utf-8"
    )
    
    _initialized = True


def get_logger():
    return lg.bind(backend=True)


def cleanup_log_files() -> dict[str, list[str] | dict[str, str]]:
    log_path = LOG_PATH or Path(__file__).resolve().parents[2] / "log"
    if not log_path.exists():
        return {"cleared": [], "deleted": [], "failed": {}}

    active_names = {"fastapi.log", "backend.log"}
    cleared: list[str] = []
    deleted: list[str] = []
    failed: dict[str, str] = {}

    for path in log_path.iterdir():
        if not path.is_file():
            continue
        is_backend_log = path.name in active_names or path.name.startswith(("fastapi.", "backend."))
        if not is_backend_log:
            continue
        try:
            if path.name in active_names:
                path.write_text("", encoding="utf-8")
                cleared.append(path.name)
            else:
                path.unlink()
                deleted.append(path.name)
        except OSError as exc:
            failed[path.name] = str(exc)

    return {"cleared": cleared, "deleted": deleted, "failed": failed}
