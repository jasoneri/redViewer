# 🔐超级管理员

超管面板提供了操作限制锁，切换后端，~~CGS交互~~ 等功能

## 访问管理面板

列表/网格页点`配置`，对话框点 `超管` 按钮进入面板  
未配置 `.secret` 时会自动弹出 **`超管指引`**，初次使用请按序阅读

::: tip 前端设置受限时，可以直接在终端执行命令来配置密钥：

<div style="display: flex; gap: 8px; align-items: center; margin: 12px 0;">
  <input
    v-model="secretKey"
    placeholder="输入你的密钥"
    style="flex: 1; padding: 8px; border-radius: 4px; border: 1px solid var(--vp-c-border); background: var(--vp-c-bg);"
  />
  <button
    @click="generate"
    :disabled="!secretKey.trim()"
    style="padding: 8px 16px; border-radius: 4px; border: 1px solid var(--vp-c-brand); background: var(--vp-c-brand); color: white; cursor: pointer; white-space: nowrap;"
    :style="!secretKey.trim() && 'opacity: 0.5; cursor: not-allowed;'"
  >
    生成命令
  </button>
</div>
<div v-if="cmd" style="display: flex; gap: 8px; align-items: center;">
  <code style="flex: 1; padding: 8px 12px; background: var(--vp-c-bg-alt); border-radius: 4px; overflow-x: auto; white-space: nowrap; font-size: 13px;">{{ cmd }}</code>
  <button
    @click="copy"
    style="padding: 8px 16px; border-radius: 4px; border: 1px solid var(--vp-c-border); background: var(--vp-c-bg); cursor: pointer; white-space: nowrap;"
  >
    {{ copyText }}
  </button>
</div>
:::

<script setup>
import { ref } from 'vue'
const secretKey = ref('')
const cmd = ref('')
const copyText = ref('复制')

const generate = () => {
  const escaped = secretKey.value.replace(/'/g, "'\"'\"'")
  cmd.value = `uv run python -c "from platformdirs import user_config_path; from pathlib import Path; p = Path(user_config_path()) / 'redViewer' / '.secret'; p.parent.mkdir(parents=True, exist_ok=True); p.write_text('${escaped}')"`
}

const copy = async () => {
  await navigator.clipboard.writeText(cmd.value)
  copyText.value = '已复制!'
  setTimeout(() => copyText.value = '复制', 2000)
}
</script>

## 后端ip优先级

浏览器缓存 > CF KV[`RV_KV`] > CF [`VITE_BACKEND_URL`] > 本地局域网ip

---

::: warning 忘记密钥如何处理

1. 在后端进 `~\AppData\Local\redViewer` / `~/.config/redViewer` / `~/Library/Application Support/redViewer` 找到 `.secret` 文件
2. 直接改内容 / 删掉后在前端重新设置

:::
