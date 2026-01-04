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
      <el-button @click="rootDialogVisible = true" type="info" plain>
        <el-icon><Setting /></el-icon>
        超管
      </el-button>
      <el-button v-if="!settingsStore.locks.config_path" type="primary" @click="submitConf">提交修改</el-button>
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
import { Setting } from '@element-plus/icons-vue'
import RootPanel from '@/root/RootPanel.vue'

const settingsStore = useSettingsStore()
const rootDialogVisible = ref(false)

const props = defineProps({
  visible: { type: Boolean, default: false },
  initialData: { type: Object, default: () => ({ path: '', kemono_path: '' }) }
})

const emit = defineEmits(['update:visible', 'submit'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const confForm = reactive({ path: '', kemono_path: '' })
const treeData = ref([])
const treeProps = { label: 'label', value: 'value', isLeaf: 'isLeaf', children: 'children' }

watch(() => props.visible, (val) => {
  if (val) {
    confForm.path = props.initialData.path || ''
    confForm.kemono_path = props.initialData.kemono_path || ''
  }
})

const onOpen = async () => {
  await settingsStore.fetchLocks()
  const res = await axios.get(backend + '/comic/filesystem')
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
    const res = await axios.get(backend + '/comic/filesystem', { params: { path: node.data.value } })
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

const submitConf = () => {
  emit('submit', { ...confForm })
  dialogVisible.value = false
}
</script>