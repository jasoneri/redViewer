# 📱rv app

::: tip rv-app 是 rv-desktop 浏览器前端体验的加强版
手感优化，拥有  rv-desktop 前端部分没有的 cgs-server/mcp 远程功能。
:::

<HomeDemoVideo src="{{URL_IMG}}/file/rv/mobile.webm" title="rv mobile demo"></HomeDemoVideo>

### 列一些不太直观的操作，其他参考 上述视频 和 rv-desktop

1. 左上侧边栏，右下菜单栏。菜单栏在同人志模式下额外有 多选模式 的子项

2. 扫描键可 故意输入错误地址 激活使用，功能是快速扫描局域网可用的 rv-backend ip

![scan]({{URL_IMG}}/file/rv/1781338593263_scan_ip.png)

::: tip 3. cgs 通讯 （长期处于开发状态
+ 随便点击一个特大 gateBtn 进入 cgs-server/mcp 连通后，点击左上角小图标能互换模式
+ 一般同人本用 server ，表漫用 mcp  
mcp 有 agent 加持且做了接口会自动处理所以能处理 server 还没做的章节交互
::: info 相关事项
+ cgs-server 无法并发 session
+ mcp-llm 去 [硅基流动](https://cloud.siliconflow.cn/i/j0SGXRO6) 注册个号用 deepseek-ai/DeepSeek-V4-Pro 单玩能玩到优惠券额度过期  
:::

4. 自动下滑进行中可点击悬浮球停止，自动翻页则点击页数按钮停止

![scan]({{URL_IMG}}/file/rv/auto_roll.png)

5. 滚动模式悬浮球左滑右滑能配合设置的幅度条大幅跳跃

6. 左侧边栏三击下方动图，可进行设置初始化（例如还原悬浮球坐标等，与书本离线缓存无关）
