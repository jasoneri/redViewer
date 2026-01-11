<template>
    <div v-if="settingsStore.showSlider" class="slider-container">
      <el-tooltip content="记录当前页" placement="top">
        <el-icon class="edit-pen" @click="saveCurrentPage">
          <EditPen />
        </el-icon>
      </el-tooltip>
      <el-slider
        v-model="localPage"
        :max="props.totalPages"
        @change="changeSlider"
      />
    </div>
</template>

<script setup>
import {EditPen} from "@element-plus/icons-vue";
import {reactive, ref, watch, onMounted, nextTick, watchEffect, onUnmounted, computed } from "vue";
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import _ from 'lodash';
import { useSettingsStore } from '@/static/store'

const route = useRoute()
const settingsStore = useSettingsStore()
const props = defineProps({
  currentPage:{type: Number, required: true},
  totalPages:{type: Number, required: true},
})

const emit = defineEmits(['changeSlider', 'setCurrentPage'])
const observer = ref(null)
const localPage = ref(props.currentPage)

// 监听本地值变化，同步到父组件
watch(localPage, (newVal) => {
  emit('setCurrentPage', newVal)
})

const changeSlider = (value) => {
  emit('changeSlider', value)
}

// 保存当前页
const saveCurrentPage = () => {
  settingsStore.savePageRecord(route.query.book, localPage.value)
  ElMessage.success(`已记录第 ${localPage.value} 页，后续阅读此本时会从自动翻到该页`)
}

// 初始化
const initSlider = async () => {
  // 初始化观察器
  initObserver()
}
// 初始化 Intersection Observer
const initObserver = () => {
  // 确保有图片元素
  const imgs = document.querySelector('.demo-image__lazy')?.querySelectorAll('.el-image')
  if (!imgs || imgs.length === 0) {
    console.log('没有找到图片元素，延迟初始化 observer')
    setTimeout(initObserver, 300)
    return
  }
  const savedPage = settingsStore.getPageRecord(route.query.book)
  if (savedPage) {
    changeSlider(savedPage)
    localPage.value = savedPage
  }
}
// 优化后的初始化
onMounted(() => {
  // 统一初始化逻辑
  const init = async () => {
    await nextTick()
    await initSlider()
  }
  init()
})

// 监听路由变化
watch(() => route.query.book, () => {
  initSlider()    // FIXME 当下一排序进入存在记录的book后，点击上一排序触发initObserver一直循环
})

// 组件卸载时清理
onUnmounted(() => {
  if (observer.value) {
    observer.value.disconnect()
  }
});
</script>

<style scoped lang="scss">
.slider-container {
  position: fixed;
  bottom: 3.2vh;
  background: #ffffff04;
  left: 50%;
  transform: translateX(-50%);
  width: 90vw;
  max-height: 3px;
  padding: 10px;
  border-radius: 15px;
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 15px;
}

.edit-pen {
  cursor: pointer;
  padding: 5px;
  background: #ffffff72;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(255, 255, 255, 0.599);
  transition: all 0.3s;
}

.edit-pen:hover {
  transform: scale(1.1);
}

:deep(.el-slider) {
  width: 100%;
}

</style>