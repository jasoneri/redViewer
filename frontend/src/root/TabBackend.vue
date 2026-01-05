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
  </el-form>
</template>

<script setup>
import { ref } from 'vue'
import { backend } from '@/static/store.js'
import { ElMessage } from 'element-plus'
import { Link, Check, RefreshLeft } from '@element-plus/icons-vue'

const currentBackend = backend
const backendUrl = ref(localStorage.getItem('backendUrl') || '')
const backendHistory = ref(JSON.parse(localStorage.getItem('backendHistory') || '[]'))

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
</script>