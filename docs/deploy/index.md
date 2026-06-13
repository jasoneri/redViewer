# 🚀快速开始
 
## 📦1. [安装包](https://github.com/jasoneri/redViewer/releases)

**desktop 安装**: 过程中 Mirror 页选 China，能加速 python下载 与 依赖安装  
**运行**: 打开应用后在主界面 点击正中`rv`按钮 或 通过托盘右键菜单进入

**使用**:

+ ✨rv-app, 当前仅 android arm64 ( 仍需要 rv-desktop 等作为后端运行 )
+ (局域网/手机) 手机浏览器输入rv窗口的 ip端口，例如 `192.168.xxx.xx:8080`

## ⌘ 2. 命令行 部署/运行—多合一脚本

::: tip 备用部署方法/服务器等
:::

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

::: info 非brew的uv安装尚未加速(win)
**耗时的python安装已通过 [NJU](https://mirror.nju.edu.cn/) 加速**
:::
::: tip 部署代码过后会残留脚本
win 后续使用本地的 `./rV.bat`，macOS / linux 后续使用本地的 `zsh rV.sh`  
后续使用避免再用远程脚本导致重复套娃安装（防呆路径错乱）  
:::

::: details 附-单独部署/运行`后端`命令
```
irm https://gitee.com/json_eri/redViewer/raw/master/deploy/online_scripts/windows.ps1 -OutFile rV.ps1; .\rV.ps1 --backend-only
curl -fsSL https://gitee.com/json_eri/redViewer/raw/master/deploy/online_scripts/macos.sh | zsh -s -- --backend-only
curl -fsSL https://gitee.com/json_eri/redViewer/raw/master/deploy/online_scripts/linux.sh | zsh -s -- --backend-only
```
:::

如果仅是局域网使用，ok部署文档你已阅读完毕，  
使用局域网访问 `192.168.xxx.xx:8080`（ip尾号非1），就能体验跟试用一样的效果了。

---

### 还有？当然 > [进阶部署](/deploy/adv)  
