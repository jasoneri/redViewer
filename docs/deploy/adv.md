# 🍮进阶部署

<span style="display: inline-flex; align-items: center; gap: 8px;">
  <span style="line-height:40px;font-family: 'Fira Code', monospace; font-size: 30px; color: #ffffffff;">感谢</span>
  <a href="https://git.io/typing-svg"><img src="https://readme-typing-svg.demolab.com?font=Fira+Code&size=31&duration=800&pause=500&color=F71313&vCenter=true&repeat=false&width=150&height=32&lines=CF%E5%A4%A7%E5%96%84%E4%BA%BA%EF%BC%81" alt="Typing SVG" /></a>
</span>

## 后端

参考 [一命(令)部署](deploy/)，可在脚本运行时选择 `3: 📡 只启动后端`

::: info 常规方式

用服务器 和 公网 ip，就这样

::: warning 自主测试
确保你的后端防火墙开放 12345 端口，或已用 nginx 反代，外部自测通访问
:::

::: details 大善人的内网穿透方式（Cloudflare Tunnel）

> [!warning] 必须手上有域名（事前 cf 上设置域），否则用其他部署方式

### 一步到位流程

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 打开左侧菜单的 "Zero Trust"
3. 选择左侧菜单的 "网络" > "连接器" > "添加/创建隧道"
4. 选择 "Cloudflare" > "起名后保存隧道"
5. 按指示在 pc/后端 安装连接器运行命令，直到下方 Connectors 状态出现 "已连接"，点击下一步

### 收尾（添加已发布应用程序路由）

> [!Tip] 只有事前在 cf 设置了域，并成功接通，这步才能选择 域

6. 添加路由：子域与域自己选择
7. 服务：类型选 `http`，URL 填 `localhost:12345`，点完成设置

:::

## 前端

### 🎿 Step-1：Fork 项目

1. 访问 [redViewer 项目](https://github.com/jasoneri/redViewer)
2. 点击右上角的 "Fork" 按钮
3. 选择您的 GitHub 账户
4. 确认 Fork 完成

### 🏗️ Step-2：创建 Pages 项目

#### 2.1 访问 Cloudflare Dashboard

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 选择左侧菜单的 "计算和AI" > "Workers 和 Pages"
3. 下方点击 `Looking to deploy Pages? Get started`
4. 选择 " Git 存储库"

#### 2.2 连接 GitHub 仓库

1. 如果首次使用，需要授权 Cloudflare 访问 GitHub
2. 选择您 Fork 的 `redViewer` 仓库
3. 点击 "开始设置"

#### 2.3 配置项目设置

| 配置项 | 值 | 说明 |
| -------- | ---- | ---- |
| 项目名称 | `redviewer` | 项目标识符 |
| 生产分支 | `master` | 生产环境分支 |
| 构建命令 | `npm install && npm run build` | 安装依赖并构建 |
| 构建输出目录 | `dist` | Vite 默认输出目录 |
| 根目录 | `frontend` | **重要：前端代码目录** |

| 环境变量-变量名称 | 值 |
| -------- | ---- |
| `VITE_BACKEND_URL` | `https://your-backend.example.com` |

::: tip `VITE_BACKEND_URL` 是保底后端 url
- 不要在地址末尾添加斜杠 `/`
- 示例：`https://api.mycomic.com` 或 `http://192.168.1.100:12345`
:::

点击 **"保存并部署"**，等待构建完成，如无意外可以验证去耍了

### 🗄️ Step-3：配置 KV 存储

::: warning 如需通过 `超管` 窗口切换后端 url 的话，"KV 命名空间"是必须配置的
**全局生效**：后端地址保存到 KV 后，所有用户（包括游客）刷新页面即可生效。
:::

#### 3.1 创建 KV 命名空间

1. 选择左侧菜单的 "储存和数据库" > "Workers KV"
2. 点击"新建实例"按钮
3. 名称填写：`RV_KV` 进行创建

#### 3.2 绑定 KV 到 Pages 项目

1. 返回上面创建的 Pages > 设置 > 绑定
2. 点击 "添加" > "KV 命名空间"
3. 变量名：`RV_KV`
4. 选择刚创建的命名空间
5. 点击"保存"

#### 3.3 重试部署

1. 进入项目的 "部署" 页面
2. 找到最新的部署记录
3. 点击右侧的 "..." 菜单
4. 选择 "重试部署"
5. 等待部署完成

## 🍻 Next

至此已完成所有部署，可以前往 [🎸功能预览](/guide) / [🔐超管](/guide/admin) 查看更多
