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
        <el-icon><Guide /></el-icon>
        超管指引
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
        <el-form label-position="top">
          <el-form-item label="后端地址">
            <el-input v-model="backendUrl" placeholder="http://your-ip:12345">
              <template #prefix>
                <el-icon><Link /></el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item>
            <el-text type="info" size="small">当前: {{ currentBackend }}</el-text>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveBackend">
              <el-icon><Check /></el-icon>
              保存并刷新
            </el-button>
            <el-button @click="backendUrl = ''">
              <el-icon><RefreshLeft /></el-icon>
              重置为默认
            </el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="CGS 交互" name="cgs">
        <el-empty description="计划开发中" :image-size="80" />
      </el-tab-pane>
    </el-tabs>
  </div>

  <!-- 引导 Tour -->
  <el-tour v-model="tourOpen" :mask="{ color: 'rgba(0,0,0,0.5)' }" @change="onTourChange">
    <el-tour-step :target="null" title="配置鉴权文件">
      <p>在后端以下路径上创建 <code>.secret</code> 文件并写入<el-text class="mx-1" type="primary">超管密钥</el-text>：</p>
      <el-tag type="info" style="word-break: break-all;">{{ secretPath }}</el-tag>
      <el-button :icon="CopyDocument" size="small" text @click="copyPath" style="margin-left: 4px;" />
      <p><el-text class="mx-1" type="danger">此密钥应该仅此你一人知晓</el-text></p>
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
import { Lock, Key, Link, Check, RefreshLeft, Guide, Loading, CopyDocument } from '@element-plus/icons-vue'

const emit = defineEmits(['close'])
const settingsStore = useSettingsStore()
const currentBackend = backend
const backendUrl = ref(localStorage.getItem('backendUrl') || '')
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
  force_rescan: '锁定强制重扫'
}

const readOnlyMode = computed({
  get: () => Object.values(locks).every(v => v),
  set: () => {}
})

onMounted(async () => {
  try {
    const [statusRes, locksRes, pathRes] = await Promise.all([
      axios.get(backend + '/root/'),
      axios.get(backend + '/root/locks'),
      axios.get(backend + '/root/secret-dir')
    ])
    console.log('RootPanel 初始化:', { status: statusRes.data, locks: locksRes.data, path: pathRes.data })
    needAuth.value = statusRes.data.has_secret
    Object.assign(locks, locksRes.data)
    secretPath.value = pathRes.data.path
    settingsStore.setLocks(locksRes.data)  // 同步到全局 store
    
    if (!needAuth.value) {
      isAuthenticated.value = true
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
    const res = await axios.post(backend + '/root/auth', { secret: pwd })
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
    await axios.post(backend + '/root/locks', updates, {
      headers: { 'X-Secret': storedSecret.value }
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

const saveBackend = () => {
  localStorage.setItem('backendUrl', backendUrl.value)
  ElMessage.success('保存成功，即将刷新页面')
  setTimeout(() => location.reload(), 500)
}
</script>

<style scoped>
:deep(.el-tour__content) {
  max-width: 90vw;
}
</style>