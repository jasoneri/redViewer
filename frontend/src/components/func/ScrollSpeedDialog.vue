<template>
  <el-dialog v-model="dialogVisible" title="调速" width="70vw" align-center>
    <el-form>
      <el-form-item label="间隔时间毫秒" label-width="140px">
        <el-input v-model="settingsStore.scrollConf.intervalTime" autocomplete="off" :clearable="true"/>
      </el-form-item>
      <el-form-item label="下滑像素" label-width="140px">
        <el-input v-model="settingsStore.scrollConf.intervalPixel" autocomplete="off" :clearable="true"/>
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-popover placement="bottom-start" :width="250" trigger="click">
          <template #reference>
            <el-button class="m-2" :icon="InfoFilled" type="info">数值相关</el-button>
          </template>
          大致分为两种形式 <hr style="border-style: dotted">
          动画式：流畅下滑，数值均设小，<br>例如 15ms/1px <hr style="border-style: dashed">
          ppt式：跨度大，预留阅读时间，<br>例如 3000ms/400px<hr style="border-style: dashed">
          仅当 小于20px 且 小于200毫秒 <br>会被视为动画式
        </el-popover>
        <el-button @click="dialogVisible = false">Cancel</el-button>
        <el-button type="primary" @click="handleConfirm">Ok</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { useSettingsStore } from '@/static/store.js'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['update:visible'])

const settingsStore = useSettingsStore()

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const handleConfirm = () => {
  settingsStore.setScrollConf(settingsStore.scrollConf.intervalTime, settingsStore.scrollConf.intervalPixel)
  dialogVisible.value = false
}
</script>