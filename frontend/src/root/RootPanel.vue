<template>
  <div class="root-panel">
  <!-- 加载中 -->
  <div v-if="loading" style="text-align: center; padding: 40px;">
    <el-icon class="is-loading" :size="24"><Loading /></el-icon>
    <p>加载中...</p>
  </div>

  <!-- 鉴权区域 -->
  <el-card v-else-if="needAuth && !isAuthenticated" shadow="never">
    <template #header>
      <el-icon><Lock /></el-icon>
      <span style="margin-left: 8px;">管理员鉴权</span>
    </template>
    <el-form @submit.prevent="authenticate">
      <el-form-item>
        <el-input
          v-model="secretInput"
          type="password"
          placeholder="输入密钥"
          show-password
          @keyup.enter="authenticate"
        >
          <template #prefix>
            <el-icon><Key /></el-icon>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="authenticate" :loading="authLoading" style="width: 100%;">
          验证身份
        </el-button>
      </el-form-item>
    </el-form>
  </el-card>

  <!-- 已鉴权：标签页 -->
  <div v-else>
    <div v-if="!needAuth" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
      <el-alert type="warning" :closable="false" style="flex: 1; margin-bottom: 0;">
        <span>未配置 .secret 文件，无需鉴权</span>
      </el-alert>
      <el-button type="primary" link @click="startTour" style="margin-left: 10px;">
        <el-icon><Guide /></el-icon>&nbsp;超管指引
      </el-button>
    </div>
    
    <el-tabs ref="tabsRef" v-model="activeTab" type="border-card">
      <el-tab-pane label="管理操作" name="locks">
        <el-form label-position="left" label-width="140px">
          <el-form-item>
            <template #label>
              <el-text type="primary" tag="b">纯阅读模式</el-text>
            </template>
            <el-switch
              ref="readOnlySwitchRef"
              v-model="readOnlyMode"
              @change="toggleReadOnlyMode"
              inline-prompt
            />
          </el-form-item>
          
          <el-divider content-position="left">
            <el-text type="info" size="small">独立锁控制</el-text>
          </el-divider>
          
          <el-form-item v-for="(val, key) in locks" :key="key" :label="lockLabels[key]">
            <el-switch 
              v-model="locks[key]" 
              @change="updateSingleLock(key, locks[key])"
            />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="后端配置" name="backend">
        <TabBackend :stored-secret="storedSecret" />
      </el-tab-pane>

      <el-tab-pane label="CGS 交互" name="cgs">
        <TabCgs />
      </el-tab-pane>
    </el-tabs>
  </div>

  <!-- 引导 Tour -->
  <el-tour v-model="tourOpen" :mask="{ color: 'rgba(0,0,0,0.5)' }" @change="onTourChange" @close="onTourClose">
    <el-tour-step :target="null" title="配置密钥">
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <el-input v-model="newSecret" type="password" placeholder="输入密钥" show-password style="flex: 1;" />
        <el-button type="primary" @click="initSecret" :loading="initLoading" :disabled="secretSet">
          {{ secretSet ? '已设置' : '设置' }}
        </el-button>
      </div>
      <el-text type="info" size="small">密钥文件：</el-text>
      <div style="display: flex; align-items: center; gap: 4px; margin: 4px 0 8px;">
        <el-tag size="small" style="word-break: break-all; white-space: normal;">{{ secretPath }}</el-tag>
        <el-button :icon="CopyDocument" size="small" text @click="copyPath" />
      </div>
      <el-text type="danger" size="small">此密钥应仅你一人知晓</el-text>
    </el-tour-step>
    <el-tour-step :target="readOnlySwitchRef?.$el" title="限制锁" placement="bottom">
      <p><el-text class="mx-1" type="primary">「纯阅读模式」</el-text>
        开启后将统一激活所有独立锁<br><el-text class="mx-1" type="success">锁状态</el-text>储存于后端，限制将在<el-text class="mx-1" type="primary">各设备前端上实时生效</el-text></p>
    </el-tour-step>
    <el-tour-step :target="getTabHeader(1)" title="后端配置" placement="bottom">
      <p>配置远程后端地址，用于 "远程书库"</p>
      <p>每一后端各自对应<el-text class="mx-1" type="primary">锁状态</el-text> 和 <el-text class="mx-1" type="primary">超管密钥</el-text>，<el-text class="mx-1" type="warning">理应事前设置</el-text></p>
    </el-tour-step>
    <el-tour-step :target="getTabHeader(2)" title="CGS 交互" placement="bottom">
      <p>计划开发中，敬请期待</p>
    </el-tour-step>
  </el-tour>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import axios from 'axios'
import { backend, useSettingsStore } from '@/static/store.js'
import { ElMessage } from 'element-plus'
import { Lock, Key, Guide, Loading, CopyDocument } from '@element-plus/icons-vue'
import TabBackend from './TabBackend.vue'
import TabCgs from './TabCgs.vue'
import { passThroughEncrypt } from '@/utils/crypto.js'

const emit = defineEmits(['close'])
const settingsStore = useSettingsStore()

const secretInput = ref('')
const activeTab = ref('locks')
const isAuthenticated = ref(false)
const storedSecret = ref('')
const authLoading = ref(false)
const loading = ref(true)
const needAuth = ref(true)
const tourOpen = ref(false)
const secretPath = ref('')
const readOnlySwitchRef = ref(null)
const tabsRef = ref(null)
const newSecret = ref('')
const initLoading = ref(false)
const secretSet = ref(false)

const locks = reactive({
  config_path: false,
  book_handle: false,
  switch_doujin: false,
  force_rescan: false
})

const lockLabels = {
  config_path: '锁定路径配置',
  book_handle: '锁定书籍操作',
  switch_doujin: '锁定切换同人志',
  force_rescan: '锁定强制重载'
}

const readOnlyMode = computed({
  get: () => Object.values(locks).every(v => v),
  set: () => {}
})

onMounted(async () => {
  try {
    const [statusRes, locksRes] = await Promise.all([
      axios.get(backend + '/root/'),
      axios.get(backend + '/root/locks')
    ])
    needAuth.value = statusRes.data.has_secret
    Object.assign(locks, locksRes.data)
    settingsStore.setLocks(locksRes.data)
    
    if (!needAuth.value) {
      isAuthenticated.value = true
      const pathRes = await axios.get(backend + '/root/secret-file')
      secretPath.value = pathRes.data.path
    } else {
      const cached = localStorage.getItem('rootSecret')
      if (cached) authenticate(cached, true)
    }
  } catch (e) {
    console.error('获取状态失败', e)
  } finally {
    loading.value = false
  }
})

const startTour = () => {
  activeTab.value = 'locks'
  tourOpen.value = true
}

const onTourChange = (current) => {
  // 根据步骤切换标签页
  if (current === 1) activeTab.value = 'locks'
  else if (current === 2) activeTab.value = 'backend'
  else if (current === 3) activeTab.value = 'cgs'
}

const getTabHeader = (index) => {
  // 获取标签页头部元素
  return tabsRef.value?.$el?.querySelectorAll('.el-tabs__item')?.[index] || null
}

const authenticate = async (secret, silent = false) => {
  const pwd = typeof secret === 'string' ? secret : secretInput.value
  authLoading.value = true
  try {
    const encrypted = passThroughEncrypt(`${pwd}:${Date.now()}`)
    const res = await axios.post(backend + '/root/auth', { secret: encrypted })
    isAuthenticated.value = true
    storedSecret.value = pwd
    localStorage.setItem('rootSecret', pwd)
    if (!silent) ElMessage.success(res.data.skip ? '无需鉴权' : '鉴权成功')
  } catch {
    localStorage.removeItem('rootSecret')
    if (!silent) ElMessage.error('鉴权失败')
  } finally {
    authLoading.value = false
  }
}

const toggleReadOnlyMode = async (enabled) => {
  const newLocks = { config_path: enabled, book_handle: enabled, switch_doujin: enabled, force_rescan: enabled }
  await updateLocks(newLocks)
}

const updateSingleLock = async (key, val) => {
  await updateLocks({ [key]: val })
}

const updateLocks = async (updates) => {
  try {
    const encrypted = passThroughEncrypt(`${storedSecret.value}:${Date.now()}`)
    await axios.post(backend + '/root/locks', updates, {
      headers: { 'X-Secret': encrypted }
    })
    Object.assign(locks, updates)
    settingsStore.setLocks(locks)
    ElMessage.success('更新成功')
  } catch {
    ElMessage.error('更新失败')
    const res = await axios.get(backend + '/root/locks')
    Object.assign(locks, res.data)
    settingsStore.setLocks(res.data)
  }
}

const copyPath = () => {
  navigator.clipboard.writeText(secretPath.value)
  ElMessage.success('已复制')
}

const initSecret = async () => {
  if (!newSecret.value.trim()) {
    ElMessage.warning('密钥不能为空')
    return
  }
  initLoading.value = true
  try {
    await axios.post(backend + '/root/init-secret', { secret: newSecret.value })
    ElMessage.success('密钥设置成功，请继续了解其他功能')
    storedSecret.value = newSecret.value
    localStorage.setItem('rootSecret', newSecret.value)
    secretSet.value = true
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '设置失败')
  } finally {
    initLoading.value = false
  }
}

const onTourClose = () => {
  if (secretSet.value) {
    needAuth.value = true
    isAuthenticated.value = true
  }
}
</script>

<style scoped>
:deep(.el-tour__content) {
  max-width: 90vw;
}
</style>