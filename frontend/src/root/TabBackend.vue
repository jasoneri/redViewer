<template>
  <el-form label-position="top">
    <el-form-item label="后端地址">
      <el-autocomplete
        v-model="backendUrl"
        :fetch-suggestions="fetchBackendHistory"
        placeholder="http://your-ip:12345"
        style="width: 100%"
      >
        <template #prefix>
          <el-icon><Link /></el-icon>
        </template>
      </el-autocomplete>
    </el-form-item>
    <el-form-item>
      <el-text type="info" size="small">当前: {{ currentBackend }}</el-text>
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="saveBackend">
        <el-icon><Check /></el-icon>&nbsp;保存并刷新
      </el-button>
      <el-button @click="backendUrl = ''">
        <el-icon><RefreshLeft /></el-icon>&nbsp;重置为默认
      </el-button>
    </el-form-item>

    <el-divider />

    <el-form-item label="运行访问该后端的白名单">
      <el-input
        v-model="newWhitelistItem"
        placeholder="192.168.1.* 或 *.example.com"
        style="width: 100%"
        @keyup.enter="addWhitelist"
      >
        <template #append>
          <el-button @click="addWhitelist">添加</el-button>
        </template>
      </el-input>
      <el-text type="info" size="small">支持通配符: * 匹配任意, ? 匹配单个。为空时允许所有访问。</el-text>
    </el-form-item>
    <el-form-item>
      <el-tag
        v-for="(item, index) in whitelist"
        :key="index"
        closable
        @close="removeWhitelist(index)"
        style="margin-right: 8px; margin-bottom: 4px;"
      >
        {{ item }}
      </el-tag>
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="saveWhitelist" :loading="whitelistLoading">
        <el-icon><Check /></el-icon>&nbsp;保存白名单
      </el-button>
    </el-form-item>
  </el-form>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { backend } from '@/static/store.js'
import { ElMessage } from 'element-plus'
import { Link, Check, RefreshLeft } from '@element-plus/icons-vue'

const props = defineProps({
  storedSecret: { type: String, default: '' }
})

const currentBackend = backend
const backendUrl = ref(localStorage.getItem('backendUrl') || '')
const backendHistory = ref(JSON.parse(localStorage.getItem('backendHistory') || '[]'))
const whitelist = ref([])
const newWhitelistItem = ref('')
const whitelistLoading = ref(false)

onMounted(async () => {
  try {
    const res = await axios.get(backend + '/root/whitelist')
    whitelist.value = res.data.whitelist || []
  } catch (e) {
    console.error('获取白名单失败', e)
  }
})

const fetchBackendHistory = (query, cb) => {
  const results = query
    ? backendHistory.value.filter(item => item.includes(query)).map(v => ({ value: v }))
    : backendHistory.value.map(v => ({ value: v }))
  cb(results)
}

const saveBackend = () => {
  localStorage.setItem('backendUrl', backendUrl.value)
  if (backendUrl.value && !backendHistory.value.includes(backendUrl.value)) {
    backendHistory.value.push(backendUrl.value)
    localStorage.setItem('backendHistory', JSON.stringify(backendHistory.value))
  }
  ElMessage.success('保存成功，即将刷新页面')
  setTimeout(() => location.reload(), 500)
}

const addWhitelist = () => {
  const item = newWhitelistItem.value.trim()
  if (item && !whitelist.value.includes(item)) {
    whitelist.value.push(item)
    newWhitelistItem.value = ''
  }
}

const removeWhitelist = (index) => {
  whitelist.value.splice(index, 1)
}

// 加密函数框架，当前直接返回原文，后续实现加密
const encrypt = (raw) => raw

const saveWhitelist = async () => {
  whitelistLoading.value = true
  try {
    const secret = props.storedSecret || localStorage.getItem('rootSecret') || ''
    const encrypted = encrypt(`${secret}:${Date.now()}`)
    await axios.post(backend + '/root/whitelist', { whitelist: whitelist.value }, {
      headers: { 'X-Secret': encrypted }
    })
    ElMessage.success('白名单保存成功')
  } catch (e) {
    ElMessage.error(e.response?.data?.detail || '保存失败')
  } finally {
    whitelistLoading.value = false
  }
}
</script>