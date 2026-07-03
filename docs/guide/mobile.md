# 📱rv app

::: tip rv-app 是 rv-desktop 浏览器前端体验的加强版
手感优化，拥有  rv-desktop 前端部分做得不怎么完善的 cgs-server/mcp 远程功能。
:::

<HomeDemoVideo src="{{URL_IMG}}/file/rv/1783070093304_app.webm" title="rv mobile demo"></HomeDemoVideo>

以下复述些重点操作或没描述的操作，其他参考 上述视频 和 rv-desktop

### 侧边栏/导航栏，菜单栏

+ 左上为侧边栏(兼任导航栏)，右中为菜单栏。  
扫描键可 ~~故意输入错误地址~~ 激活使用，功能是快速扫描局域网可用的 rv-backend ip

![scan]({{URL_IMG}}/file/rv/1782999862233_scan_ip.png)

+ 菜单栏进入 多选模式 的可进行批量的 缓存/cgs`附着书`/保存/删除
+ 左侧边栏三击下方动图，可进行设置初始化（例如还原悬浮球坐标等，与书本离线缓存无关）

---

### CGS 通讯（长期处于开发状态

+ 随便点击一个特大 gateBtn 进入 cgs-server/agent 连通后，点击左上角小图标能互换模式  

::: warning 表漫用 agent , 手动挡还没做章节选择 ui
:::

+ 在 cgs-手动挡 页面入库失败时，可点击 `入库` 会出现面板进行重试补漏页

+ agent 能处理复杂条件推理，例如`附着书`的章节推理  
+ agent 进配置，偏好管理能设置条件匹配/过滤，不仅限作用于 tag ，对话时会注入 agent 的 prompt 偏好增强  
+ agent 配置 `预览` 在开启后，列表结果出来后将中断对话并切换到 cgs-手动挡页面 选择

::: info 相关事项
+ cgs-server 无法并发 session，即无法在下载这批次情况下立即处理下一批次，例如翻页  
  （后续出 悬浮下载进度 会方便点
+ llm-provider 去 [硅基流动](https://cloud.siliconflow.cn/i/j0SGXRO6) 注册个号用券用 deepseek-ai/DeepSeek-V4-Pro 够玩了  
:::

---

### 阅读模式

+ 阅读页自动下滑进行中可点击悬浮球停止，自动翻页则点击页数按钮停止

![scan]({{URL_IMG}}/file/rv/1782743702596_auto_roll.png)

+ `显示悬浮导航`常态激活，点击悬浮球会有快捷导航 返回上一级/上一本/下一本
+ 滚动模式悬浮球左滑右滑能配合设置的幅度条大幅跳跃
+ 阅读页面 **长按图片** 能保存图片到本地图库里
