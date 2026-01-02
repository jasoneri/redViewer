<template>
  <el-button-group class="btn-group">
    <el-button type="info" style="flex: 1; height: 100%;" @click="$router.push('/')">
      <el-icon size="large"><BackIcon /></el-icon>
    </el-button>
    <el-button :type="isCompleteDel ? 'danger' : 'warning'" @click="switchDelMode" style="flex: 1; height: 100%;">
      <el-icon><Switch /></el-icon>
      <span class="btn-text">模式:{{ isCompleteDel ? '彻底删除' : '扔回收站' }}</span>
    </el-button>
    <el-button type="primary" style="flex: 1; height: 100%;" @click="props.previousSeries">
      <el-icon><ArrowLeft /></el-icon>
      <span class="btn-text">上一系列</span>
    </el-button>
    <el-button disabled class="book-name-btn" style="flex: 6; height: 100%;">{{ props.bookName }}</el-button>
    <el-button type="primary" style="flex: 1; height: 100%;" @click="props.nextSeries">
      <span class="btn-text">下一系列</span>
      <el-icon><ArrowRight /></el-icon>
    </el-button>
  </el-button-group>
</template>

<script setup>
import { computed } from 'vue';
import { BackIcon } from '@/icons';
import { Back, ArrowLeft, ArrowRight, Switch } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useSettingsStore } from '@/static/store.js';

const props = defineProps({
  bookName: { type: String, required: true },
  previousSeries: { type: Function, required: true },
  nextSeries: { type: Function, required: true },
});

const settingsStore = useSettingsStore();
const isCompleteDel = computed(() => settingsStore.viewSettings.isCompleteDel);

const switchDelMode = () => {
  if (!settingsStore.viewSettings.isCompleteDel) {
    ElMessage({ message: `已切换至「彻底删除」模式，请谨慎操作`, type: 'warning', duration: 3500 });
  }
  settingsStore.toggleDeleteMode();
};
</script>

<style scoped>
.btn-group {
  display: flex;
  width: 100%;
  height: 100%;
}
.book-name-btn {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  justify-content: flex-start;
}

@media (max-width: 768px) {
  .btn-text {
    display: none;
  }
}
</style>