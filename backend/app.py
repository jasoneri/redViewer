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
    host = os.getenv("RV_HOST", "0.0.0.0")
    port = int(os.getenv("RV_PORT", "12345"))
    uvicorn.run('app:app', host=host, port=port, log_level="warning")
