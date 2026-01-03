<div align="center">

   <a href="https://github.com/jasoneri/ComicGUISpider" target="_blank">
    <img src="frontend/public/logo.png" alt="logo">
  </a>
  <h1 id="logo">redViewer(rV)</h1>
  <img src="https://img.shields.io/badge/Platform-Win%20|%20macOS%20|%20linux-blue?color=red" alt="tag">
  <img src="https://img.shields.io/badge/-3.12%2B-red.svg?logo=python" alt="tag">
  <img src="https://img.shields.io/badge/-vite.js-red.svg?logo=vue.js" alt="tag">
  <br>
  <img src="https://img.shields.io/badge/-👉-red.svg" alt="tag">
  <img src="https://img.shields.io/github/stars/jasoneri/redViewer?style=social&logo=github" alt="tag">
  <img src="https://img.shields.io/badge/-👈%20CGS过来的支持一下吧%20-red.svg" alt="tag">

  <p align="center">
  <a href="https://github.com/jasoneri/redViewer#️1-部署更新运行多合一脚本">📦多功能脚本</a> | 
  <a href="https://github.com/jasoneri/redViewer/wiki/FAQ">📖FAQ</a> | 
  <a href="https://github.com/jasoneri/redViewer/wiki/Feat">🎲功能说明</a>
  </p>
</div>

## 📑介绍

轻简风漫画阅读器，个人手机局域网自用  
~~先有 CGS 后有 rV, 但 rV 写着写着, CGS 就倒反天罡为 rV 服务了~~

### ▼ 📚列表/网格预览 ▼

![books_list.jpg](docs/assets/books_list.png)

> [!Tip]  
> - 快速筛选的匹配模式请参考 [🎲功能说明](https://github.com/jasoneri/redViewer/wiki/Feat)，用 CGS 下的就不用参考了😎  

### ▼ 📑章节页预览 ▼

跟网格展示相同，手机端需要注意顶部按钮组的含义如下（手机宽度问题只保留图标）

![books_list.jpg](docs/assets/ep_list_head.png)

### ▼ 📗阅读预览 ▼

![book.jpg](docs/assets/book.png)

> [!Tip]  
> - 建议保留导航按钮或滚动条可视，除非对纯图片阅读有极高要求，否则大页数途中会缺少可动操作  

## 🚀快速开始

### 0. 准备

[🔗目录结构参考](https://github.com/jasoneri/redViewer/wiki/ScanFloder), 使用 CGS 下载可跳过阅读  

### ♦️1. 部署/更新/运行—多合一脚本

找一个非中文目录（例如 `D:/rv`）右键打开终端，然后执行如下命令

#### windows

```shell
irm https://gitee.com/json_eri/redViewer/raw/master/deploy/online_scripts/windows.ps1 | iex
```

#### macOS

```shell
curl -fsSL https://gitee.com/json_eri/redViewer/raw/master/deploy/online_scripts/macos.sh | zsh
```

#### linux

```shell
curl -fsSL https://gitee.com/json_eri/redViewer/raw/master/deploy/online_scripts/linux.sh | zsh
```

部署代码过后会残留脚本，win 后续使用本地的 `./rV.bat`，macOS / linux 后续使用本地的 `zsh rV.sh`  
后续使用避免再用远程脚本导致重复套娃安装（防呆路径错乱）  

> [!Warning]  
> win 报错相关：①激活 win 系统；  
> ②`控制面板 > 时钟与区域 > 区域 > 更改系统区域设置 > 勾选beta版 unicode UTF-8 > 重启`  

🚩 [关于脚本有任何问题直接 issue 反馈](https://github.com/jasoneri/redViewer/issues/new)

### 2.使用

启动后终端会显示局域网ip与端口 `Network:`行，手机进浏览器照样填地址即可  
例如 `192.168.xxx.xx`, 尾号非1  
建议 PC 设置固定局域网 ip，阅读端做网址收藏

> [🎥使用指南参考](https://www.veed.io/view/zh-CN/688ae765-2bfb-4deb-9495-32b24a273373?panel=comments)，从 `01:52` 开始含有 redViewer 的使用部分

## 📢更新

### [![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/jasoneri/redViewer?color=blue&label=Ver&sort=semver)](https://github.com/jasoneri/redViewer/releases/latest)

✅ 支持系列带子级章节，系列与单章节  
✅ 支持读 `.cbz`  
✨ CGS 下载后用 rV 设配置目录后完全无感使用，包括以上两点  
✨ 增加左右翻页阅读模式，同样采用 15~85% 阅读进度阈值，隐藏按钮组并设置全屏化  
✨ 主题色改为 red !!  
✅ 配置/过滤等操作优化  

### ROAD MAP

🔳以`rV.db`开展元数据 筛选/展示 等  
🔳方向：前端部分通过Capacitor往app发展，重点为离线缓存/在线激活后同步离线操作  
🔳githb-pages做成体验（修改前后的部分细则），寻找免费后端服务  

> [🕑更新历史](https://github.com/jasoneri/redViewer/wiki/Changelog)

## 💬交流

详见 [❓FAQ](https://github.com/jasoneri/redViewer/wiki/FAQ) 置顶

## 🔇开源许可

详见 [Apache License 2.0](https://github.com/jasoneri/redViewer/blob/master/LICENSE)

---

![redViewer](https://count.getloli.com/get/@comic_viewer?theme=rule34)
