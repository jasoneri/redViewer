import pathlib
import uvicorn
import sys
sys.path.append(str(pathlib.Path(__file__).parent.absolute()))
from api import create_app

app = create_app()


if __name__ == '__main__':
    uvicorn.run(app='app:app', host="0.0.0.0", port=12345, log_level="warning",
                reload=True, reload_dirs=str(pathlib.Path(__file__).parent),
                reload_includes='conf.yml', reload_excludes='*.py')
