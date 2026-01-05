import os
import pathlib
import uvicorn
import sys
sys.path.append(str(pathlib.Path(__file__).parent.absolute()))

from core.logging import setup_logging

# 初始化日志配置
log_path = pathlib.Path(__file__).parent.parent / "log"
setup_logging(log_path)

from api import create_app

app = create_app()


if __name__ == '__main__':
    DEBUG_MODE = os.getenv('DEBUG', 'false').lower() == 'true'
    uvicorn_kw = {
        'app': 'app:app', 'host': "0.0.0.0", 'port': 12345, 'reload': True,
        'reload_dirs': str(pathlib.Path(__file__).parent)
    }
    if DEBUG_MODE:
        uvicorn_kw.update(log_level="debug",
            reload_includes=['conf.yml', '*.py'])
    else:
        uvicorn_kw.update(log_level="warning",
            reload_includes='conf.yml', reload_excludes='*.py')
    uvicorn.run(**uvicorn_kw)
