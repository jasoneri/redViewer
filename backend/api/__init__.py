import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles

from api.routes.comic import index_router, conf
from api.routes.cache import lib_mgr
from api.routes.kemono import index_router as kemono_index_router

global_whitelist = ['']
staticFiles = StaticFiles(directory=str(conf.comic_path))


@asynccontextmanager
async def lifespan(app: FastAPI):
    main_loop = asyncio.get_running_loop()
    await lib_mgr.switch_library(conf.comic_path, main_loop)
    yield
    if lib_mgr.observer and lib_mgr.observer.is_alive():
        lib_mgr.observer.stop()
        lib_mgr.observer.join()


def create_app() -> FastAPI:
    """
    生成FatAPI对象
    :return:
    """
    app = FastAPI(
        title="rV",
        description="https://github.com/jasoneri/redViewer",
        version="1.3.0",
        docs_url="/api/docs",  # 自定义文档地址
        openapi_url="/api/openapi.json",
        redoc_url=None,   # 禁用redoc文档
        lifespan=lifespan
    )
    # 其余的一些全局配置可以写在这里 多了可以考虑拆分到其他文件夹

    # 跨域设置
    register_cors(app)

    register_static_file(app)
    # 注册路由
    register_router(app)

    # 请求拦截
    register_hook(app)

    return app


def register_static_file(app: FastAPI) -> None:
    """
    静态文件交互开发模式使用
    生产使用 nginx 静态资源服务
    这里是开发是方便本地
    """
    app.mount("/static", staticFiles, name="static")
    app.mount("/static_kemono", StaticFiles(directory=str(conf.kemono_path)), name="static_kemono")


def register_router(app: FastAPI) -> None:
    """
    注册路由
    :param app:
    :return:
    """
    # 项目API
    app.include_router(index_router, prefix="", tags=['comic'])
    app.include_router(kemono_index_router, prefix="", tags=['kemono'])


def register_cors(app: FastAPI) -> None:
    """
    支持跨域
    :param app:
    :return:
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def register_hook(app: FastAPI) -> None:
    """
    请求响应拦截 hook
    https://fastapi.tiangolo.com/tutorial/middleware/
    :param app:
    :return:
    """
    @app.middleware("http")
    async def logger_request(request: Request, call_next) -> Response:
        response = await call_next(request)
        if request.url.path.startswith("/comic/conf") and request.method == "POST" and response.status_code == 200:
            staticFiles.directory = str(conf.comic_path)
            staticFiles.all_directories = staticFiles.get_directories(staticFiles.directory, None)
        return response
