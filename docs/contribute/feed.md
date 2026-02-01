# 🍼 投喂

小手注册点两点，让它开发爽一点

- [学英语浏览器插件](https://Ries.ai?c=Jzva)  
- [硅基流动](https://cloud.siliconflow.cn/i/j0SGXRO6)  
- [语雀](https://www.yuque.com) 邀请码: CZULIQ


<div style="display: flex; gap: 12px; margin: 20px 0;">
  <button @click="showDialog = true" style="display: flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 6px; border: 1px solid var(--vp-c-brand); background: var(--vp-c-brand); color: white; cursor: pointer; font-size: 14px;">
    <img src="/lxd.png" alt="invite" style="width: 20px; height: 20px;" />
    <span>注册邀请</span></button>
  <a href="https://credit.linux.do/paying/online?token=26af47ee90b1192086095d107dc9bc1ca4137bd12496fefaf22efadcc349a98a" target="_blank" style="display: flex; align-items: center; padding: 10px 20px; border-radius: 6px; border: 1px solid var(--vp-c-brand); background: var(--vp-c-brand); color: white; text-decoration: none; cursor: pointer; font-size: 14px;">
    🎅LDC 投喂</a>
</div>

<div v-if="showDialog" @click="showDialog = false" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 9999;">
  <div @click.stop style="background: var(--vp-c-bg); border-radius: 8px; padding: 24px; max-width: 500px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);">
    <div style="display: flex; gap: 16px; align-items: center;"><div style="flex: 1; line-height: 1.6;">
        【Linux.do】给 CGS 和 rv 点 star ，(半年内的新gh号请回)<br>
        然后加群备注 <code>lxd注册-{github用户名}</code>， <br>阅读 lxd 注册群公告后根据指示操作
      </div>
      <a href="https://qm.qq.com/q/T2SONVQmiW" target="_blank" style="padding: 8px 16px; border-radius: 4px; border: 1px solid var(--vp-c-brand); background: var(--vp-c-brand); color: white; text-decoration: none; white-space: nowrap; cursor: pointer;"
      >Q群</a>
</div></div></div>

<script setup>
import { ref } from 'vue'
const showDialog = ref(false)
</script>
