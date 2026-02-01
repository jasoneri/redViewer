<template>
  <div>
  <el-dialog v-model="dialogVisible" title="修改配置" width="80vw" top="15vh" @open="onOpen">
    <el-form label-width="100px">
      <template v-if="!settingsStore.locks.config_path">
        <el-alert
          v-if="!settingsStore.isPathConfigured"
          title="请配置漫画库路径"
          description="当前使用的是临时目录，请选择存在书籍的目录保存"
          type="warning"
          :closable="false"
          show-icon
          style="margin-bottom: 12px"
        />
        <!-- 面包屑导航 -->
        <div v-if="pathSegments.length" class="path-breadcrumb">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item v-for="seg in pathSegments" :key="seg.path">
              <span class="breadcrumb-link" @click="jumpToPath(seg.path)">{{ seg.name }}</span>
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
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
            :default-expanded-keys="expandedKeys"
            node-key="value"
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
            :default-expanded-keys="expandedKeys"
            node-key="value"
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
const pathSegments = ref([])
const expandedKeys = ref([])

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

const buildExpandedTree = async (segments, roots) => {
  const currentRoot = segments?.[0]?.path
  // 关键：当前盘符设置 children，其他盘符不设置 children（让 lazy load 生效）
  const result = roots.map(root => root === currentRoot
    ? { value: root, label: root, isLeaf: false, children: [] }
    : { value: root, label: root, isLeaf: false }
  )
  if (!segments?.length) return result
  
  // 预展开当前路径
  for (let i = 0; i < segments.length; i++) {
    const res = await axios.get(backend() + '/comic/filesystem', { params: { path: segments[i].path } })
    const dirs = res.data.directories || []
    const sep = segments[i].path.includes('\\') ? '\\' : '/'
    const nextPath = segments[i + 1]?.path
    // 关键：只有在当前路径链上的节点才设置 children
    const children = dirs.map(dir => {
      const childPath = `${segments[i].path}${sep}${dir}`
      return childPath === nextPath
        ? { value: childPath, label: dir, isLeaf: false, children: [] }
        : { value: childPath, label: dir, isLeaf: false }
    })
    const findAndSet = (nodes, targetPath) => {
      for (const node of nodes) {
        if (node.value === targetPath) { node.children = children; return true }
        if (node.children?.length && findAndSet(node.children, targetPath)) return true
      }
      return false
    }
    findAndSet(result, segments[i].path)
  }
  return result
}

const onOpen = async () => {
  await settingsStore.fetchLocks()
  try {
    const confRes = await axios.get(backend() + '/comic/conf')
    confForm.path = confRes.data.path || ''
    confForm.kemono_path = confRes.data.kemono_path || ''
    settingsStore.setPathConfigured(confRes.data.path_configured)
  } catch {}
  // 获取当前配置路径的文件系统信息
  const res = await axios.get(backend() + '/comic/filesystem', { params: { path: confForm.path || undefined } })
  const roots = res.data.roots || []
  pathSegments.value = res.data.path_segments || []
  treeData.value = await buildExpandedTree(pathSegments.value, roots)
  expandedKeys.value = pathSegments.value.slice(0, -1).map(seg => seg.path)
}

const loadNode = async (node, resolve) => {
  if (node.level === 0) { resolve([]); return }
  try {
    const res = await axios.get(backend() + '/comic/filesystem', { params: { path: node.data.value } })
    const dirs = res.data.directories || []
    const sep = node.data.value.includes('\\') ? '\\' : '/'
    resolve(dirs.map(dir => ({ value: `${node.data.value}${sep}${dir}`, label: dir, isLeaf: false })))
  } catch { resolve([]) }
}

const jumpToPath = async (targetPath) => {
  confForm.path = targetPath
  const res = await axios.get(backend() + '/comic/filesystem', { params: { path: targetPath } })
  pathSegments.value = res.data.path_segments || []
}

watch(() => confForm.path, async (newPath) => {
  if (!newPath) { pathSegments.value = []; return }
  const res = await axios.get(backend() + '/comic/filesystem', { params: { path: newPath } })
  pathSegments.value = res.data.path_segments || []
})

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

<style scoped>
.path-breadcrumb {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}
.breadcrumb-link {
  cursor: pointer;
}
.breadcrumb-link:hover {
  color: var(--el-color-primary);
}
</style>