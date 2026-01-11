<template>
  <div>
  <el-dialog v-model="dialogVisible" title="修改配置" width="80vw" top="15vh" @open="onOpen">
    <el-form label-width="100px">
      <template v-if="!settingsStore.locks.config_path">
        <el-form-item label="漫画路径">
          <el-tree-select
            v-model="confForm.path"
            :data="treeData"
            lazy
            :load="loadNode"
            :props="treeProps"
            check-strictly
            placeholder="选择目录"
            clearable
            style="width: 100%"
            :render-after-expand="false"
          />
        </el-form-item>
        <el-form-item label="Kemono路径">
          <el-tree-select
            v-model="confForm.kemono_path"
            :data="treeData"
            lazy
            :load="loadNode"
            :props="treeProps"
            check-strictly
            placeholder="选择目录"
            clearable
            style="width: 100%"
            :render-after-expand="false"
          />
        </el-form-item>
      </template>
      <el-empty v-else description="路径配置已锁定" :image-size="60" />
    </el-form>
    <template #footer>
      <el-button
        v-if="!settingsStore.locks.force_rescan"
        @click="forceRescan" type="warning" plain :loading="rescanLoading"
      >
        <el-icon><RefreshRight /></el-icon>&nbsp;强制重载
      </el-button>
      <el-button @click="rootDialogVisible = true" type="info" plain>
        <el-icon><AdminIcon /></el-icon>&nbsp;超管
      </el-button>
      <el-button v-if="!settingsStore.locks.config_path" type="primary" @click="submitConf">提交</el-button>
    </template>
  </el-dialog>

  <!-- 管理界面对话框 -->
  <el-dialog v-model="rootDialogVisible" title="管理中心" width="90vw" style="max-width: 650px;" top="10vh" destroy-on-close>
    <RootPanel @close="rootDialogVisible = false" />
  </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue'
import axios from 'axios'
import { backend, useSettingsStore } from '@/static/store.js'
import { Setting, RefreshRight } from '@element-plus/icons-vue'
import { AdminIcon } from "@/icons"
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus'
import RootPanel from '@/root/RootPanel.vue'

const settingsStore = useSettingsStore()
const rootDialogVisible = ref(false)
const rescanLoading = ref(false)

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['update:visible', 'submit', 'rescan-finished'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const confForm = reactive({ path: '', kemono_path: '' })
const treeData = ref([])
const treeProps = { label: 'label', value: 'value', isLeaf: 'isLeaf', children: 'children' }

const onOpen = async () => {
  await settingsStore.fetchLocks()
  // 获取当前配置
  try {
    const confRes = await axios.get(backend() + '/comic/conf')
    confForm.path = confRes.data.path || ''
    confForm.kemono_path = confRes.data.kemono_path || ''
  } catch {}
  // 获取文件系统根目录
  const res = await axios.get(backend() + '/comic/filesystem')
  const roots = res.data.roots || []
  treeData.value = roots.map(root => ({
    value: root,
    label: root,
    isLeaf: false
  }))
}

const loadNode = async (node, resolve) => {
  if (node.level === 0) {
    resolve([])
    return
  }
  try {
    const res = await axios.get(backend() + '/comic/filesystem', { params: { path: node.data.value } })
    const dirs = res.data.directories || []
    const sep = node.data.value.includes('\\') ? '\\' : '/'
    resolve(dirs.map(dir => ({
      value: `${node.data.value}${sep}${dir}`,
      label: dir,
      isLeaf: false
    })))
  } catch {
    resolve([])
  }
}

const submitConf = async () => {
  const loading = ElLoading.service({ lock: true, text: '配置更改中...' })
  try {
    await axios.post(backend() + '/comic/conf', { ...confForm })
    ElMessage.success('配置更改已成功')
    emit('submit')
    dialogVisible.value = false
  } catch (err) {
    ElMessage.error(err.response?.status === 403 ? '路径配置已被锁定' : '配置更新失败')
  } finally {
    loading.close()
  }
}

const forceRescan = async () => {
  try {
    await ElMessageBox.confirm(
      '此操作将重置扫描状态并重新扫描目录，可能需要一些时间。确定继续？',
      '强制重新扫描',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  
  rescanLoading.value = true
  try {
    const res = await axios.post(backend() + '/comic/force_rescan')
    ElMessage.success(`扫描完成，找到 ${res.data.book_count} 本书籍`)
    emit('rescan-finished')
    dialogVisible.value = false
  } catch (err) {
    ElMessage.error('扫描失败: ' + (err.response?.data?.detail || err.message))
  } finally {
    rescanLoading.value = false
  }
}
</script>