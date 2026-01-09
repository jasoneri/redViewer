# 一命(令)部署

## ♦️ 部署/运行—多合一脚本

找一个非中文目录（例如 `D:/rv`）右键打开终端，然后执行如下命令

### windows

```shell
irm https://gitee.com/json_eri/redViewer/raw/master/deploy/online_scripts/windows.ps1 | iex
```

### macOS

```shell
curl -fsSL https://gitee.com/json_eri/redViewer/raw/master/deploy/online_scripts/macos.sh | zsh
```

### linux

```shell
curl -fsSL https://gitee.com/json_eri/redViewer/raw/master/deploy/online_scripts/linux.sh | zsh
```

::: tip 部署代码过后会残留脚本
win 后续使用本地的 `./rV.bat`，macOS / linux 后续使用本地的 `zsh rV.sh`  
后续使用避免再用远程脚本导致重复套娃安装（防呆路径错乱）  
:::

如果仅是局域网使用，ok部署文档你已阅读完毕，使用局域网访问 `192.168.xxx.xx`（尾号非1），就能体验跟试用一样的效果了。

## 还有？当然 > [进阶部署](/deploy/adv)  
