# 常见问题

::: tip 下方问答没能解决你的问题的话
请提交 [issue](https://github.com/jasoneri/redViewer/issues) 或进 [QQ群](https://qm.qq.com/q/T2SONVQmiW) 提问（进群的话为了区别，记得说明问的是 rV）
:::

## 1. 部署相关

### win 部署的一些修正可能

- 激活 win 系统
- 控制面板 > 时钟与区域 > 区域 > 更改系统区域设置 > 勾选beta版 unicode UTF-8 > 重启

### `nodjs` 相关 / 无法执行 `npm`

::: warning 在装 `rV` 之前电脑上就安装了 `nodejs` 的话
去应用里卸载 `nodejs`，使用 `rV` 多合一脚本，脚本已设最优策略安装和刷新环境变量
:::

### `npm i` 一直转圈 / `安装前端依赖`

在 `frontend` 目录开终端，然后参照 [此文章](https://www.cnblogs.com/alannxu/p/18583348) 里的代码指令进行换源，重启程序。

**参考解决方案**：
```bash
npm config set registry https://registry.npmmirror.com
npm config get registry
```

## 2. 使用网络相关

### 2.1 手机压根无法访问

尝试PC防火墙进高级设置，入站规则处新建规则，将`8080`与`12345`端口开放

### 2.2 局域网存在多个 Network 时跨域失败

**表现**：有 UI 但没有书列表/显示后端异常。  
**原因**：局域网 IP 取值条件为优先 `192.x.x.x` 网段 && 排除 `x.x.x.1`，规则样板覆盖不全。

**解决**：尝试进`超管`切换后端

## 3. 后端端口占用

**报错**：[WinError 10013] ...不允许...访问套接字的尝试。  
**原因**：后端端口 **12345** 命中了 Hyper-V 虚拟机的随机保留端口范围。

**解决**：参考 [此链接方法](https://zhaoji.wang/solve-the-problem-of-windows-10-ports-being-randomly-reserved-occupied-by-hyper-v/) 处理 并 重启

::: details 核心命令：

```powershell
# 1. 查看当前保留端口范围
netsh interface ipv4 show excludedportrange protocol=tcp
# 2. 排除 12345 端口被保留
netsh int ipv4 add excludedportrange protocol=tcp startport=12345 numberofports=1
# 3. 重启电脑
```

:::
