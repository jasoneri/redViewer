# 🎸功能详细预览

建议新窗口开 [![demo](https://img-cgs.101114105.xyz/file/rv/1769934434211_btn-demo.svg)](https://demo-rv.101114105.xyz/) 边看此文档，直观功能演示

## rv-app

::: tip rv-app 是 rv-desktop 的体验加强版
手感优化，拥有  rv-desktop 前端部分没有的 cgs-server/mcp 远程功能。
:::

以下仅列出一些注意事项，其他参考 rv-desktop

1. 侧边栏点按 0.5s 左右即可拖出侧边栏菜单，手指松开进行对应的功能

2. 配置点击此按钮可快速扫描局域网可用的 rv-backend（初始也会自动扫）

![scan](https://img-cgs.101114105.xyz/file/rv/1781338593263_scan_ip.png)

3. 自动下滑进行中可点击悬浮球停止，自动翻页则点击页数按钮停止

![scan](https://img-cgs.101114105.xyz/file/rv/1781338599535_auto_roll.png)

## rv-desktop

### 📚 列表/网格预览

![books_list](https://img-cgs.101114105.xyz/file/rv/1781338599167_books_list.png)

### 📑 章节页预览

跟网格展示相同，手机端需要注意顶部按钮组的含义如下（手机宽度问题只保留图标）

![ep_list_head](https://img-cgs.101114105.xyz/file/rv/1781338601468_ep_list_head.png)

### 📖 阅读预览

![book](https://img-cgs.101114105.xyz/file/rv/1781338600377_book.png)

### 🎲 其他说明

#### 未提及

+ 章节页预览 > 点一下系列名，弹出菜单系列列表可跳转
+ 阅读 > 翻页模式点一下下方页数可跳转页首页尾

#### 筛选相关

筛选状态下，按`重新加载`就能恢复原始列表。  
筛选有两种方式：  
&emsp;**1. 手动输入关键字**  
&emsp;**2. 自动扫描关键字**：首次进入页面时，前端会根据两种规则扫描列表并获取关键字数组（作者/作品名），使用面板 或 列表页的按钮即可

::: info 自动扫描规则
作者规则：`[xxx]一本好书` → `xxx` 成为关键字  
:::

## 🔰 额外

### Kemono 支持

设置 `kemono路径`，可观看从 `CGS` 脚本集下的 `kemono` 内容。

- 📖 [查看 kemono 内容目录树参考](https://cgs.101114105.xyz/feat/script.html#%F0%9F%93%92-%E8%AF%B4%E6%98%8E)
- 🌐 观看链接：`你的局域网ip:端口/kemono`
