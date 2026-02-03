<template>
  <div class="page-reader" ref="readerRef"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
    @click="onClick"
  >
    <!-- 当前页图片 -->
    <div class="page-display">
      <el-image 
        v-if="currentUrl"
        :src="currentUrl"
        fit="contain"
      />
      <div v-if="!settingsStore.displaySettings.showSlider && props.imgUrls.length > 0" class="page-indicator" @click.stop="togglePageBtnGroup">
        <transition name="fade">
          <button
            v-show="showPageBtnGroup"
            class="page-btn page-btn-first"
            :disabled="currentPage === 0"
            @click.stop="goToFirstPage"
          >
            <FirstPage />
          </button>
        </transition>
        <span class="page-text">{{ currentPage + 1 }} / {{ props.imgUrls.length }}</span>
        <transition name="fade">
          <button
            v-show="showPageBtnGroup"
            class="page-btn page-btn-last"
            :disabled="currentPage === props.imgUrls.length - 1"
            @click.stop="goToLastPage"
          >
            <LastPage />
          </button>
        </transition>
      </div>
    </div>
    
    <!-- 进度滑块 -->
    <div v-if="settingsStore.displaySettings.showSlider && props.imgUrls.length > 0" class="slider-container">
      <el-tooltip content="记录当前页" placement="top">
        <el-icon class="edit-pen" @click.stop="saveCurrentPage">
          <EditPen />
        </el-icon>
      </el-tooltip>
      <el-slider
        v-model="currentPage"
        :min="0"
        :max="props.imgUrls.length - 1"
        :format-tooltip="(val) => `${val + 1} / ${props.imgUrls.length}`"
        @change="onSliderChange"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { EditPen } from '@element-plus/icons-vue'
import { FirstPage, LastPage } from '@/icons'
import { ElMessage } from 'element-plus'
import { useSettingsStore } from '@/static/store'

const settingsStore = useSettingsStore()

const props = defineProps({
  imgUrls: { type: Array, required: true },
  bookName: { type: String, required: true }
})

const emit = defineEmits(['pageChange', 'showBtnChange'])

const currentPage = ref(0)
const readerRef = ref(null)
const showPageBtnGroup = ref(false)

// 触摸相关
let touchStartX = 0
let touchStartY = 0
const swipeThreshold = 50

// 当前显示的图片 URL
const currentUrl = computed(() => props.imgUrls[currentPage.value] || '')

const btnShowThreshold = 0.15

// 计算是否显示按钮
const calcShowBtn = () => {
  const total = props.imgUrls.length
  if (total <= 1) return true
  const ratio = currentPage.value / (total - 1)
  return ratio <= btnShowThreshold || ratio >= 1 - btnShowThreshold
}

// 上一页
const prevPage = () => {
  if (currentPage.value > 0) {
    currentPage.value--
    emit('pageChange', currentPage.value)
    emit('showBtnChange', calcShowBtn())
  }
}

// 下一页
const nextPage = () => {
  if (currentPage.value < props.imgUrls.length - 1) {
    currentPage.value++
    emit('pageChange', currentPage.value)
    emit('showBtnChange', calcShowBtn())
  }
}

// 切换按钮组显示
const togglePageBtnGroup = () => {
  showPageBtnGroup.value = !showPageBtnGroup.value
}

// 跳转到首页
const goToFirstPage = () => {
  if (currentPage.value > 0) {
    currentPage.value = 0
    emit('pageChange', 0)
    emit('showBtnChange', calcShowBtn())
  }
}

// 跳转到末页
const goToLastPage = () => {
  const lastPage = props.imgUrls.length - 1
  if (currentPage.value < lastPage) {
    currentPage.value = lastPage
    emit('pageChange', lastPage)
    emit('showBtnChange', calcShowBtn())
  }
}

// 点击翻页 (左侧50%上一页，右侧50%下一页)
const onClick = (e) => {
  const rect = readerRef.value?.getBoundingClientRect()
  if (!rect) return
  const clickX = e.clientX - rect.left
  const threshold = rect.width * 0.5
  
  if (clickX < threshold) {
    prevPage()
  } else {
    nextPage()
  }
}

// 触摸开始
const onTouchStart = (e) => {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}

// 触摸结束 (滑动翻页)
const onTouchEnd = (e) => {
  const touchEndX = e.changedTouches[0].clientX
  const touchEndY = e.changedTouches[0].clientY
  const deltaX = touchEndX - touchStartX
  const deltaY = touchEndY - touchStartY
  
  // 水平滑动大于垂直滑动，且超过阈值
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > swipeThreshold) {
    if (deltaX > 0) {
      prevPage()  // 右滑 = 上一页
    } else {
      nextPage()  // 左滑 = 下一页
    }
  }
}

// 滑块变化
const onSliderChange = (page) => {
  emit('pageChange', page)
  emit('showBtnChange', calcShowBtn())
}

// 保存进度
const saveCurrentPage = () => {
  settingsStore.savePageRecord(props.bookName, currentPage.value)
  ElMessage.success(`已记录第 ${currentPage.value + 1} 页`)
}

// 恢复进度
const restoreProgress = () => {
  const saved = settingsStore.getPageRecord(props.bookName)
  if (saved !== undefined && saved < props.imgUrls.length) {
    currentPage.value = saved
  } else {
    currentPage.value = 0
  }
  emit('showBtnChange', calcShowBtn())
}

onMounted(() => {
  if (props.imgUrls.length > 0) restoreProgress()
})

// 监听 imgUrls 变化（首次加载完成时恢复进度）
watch(() => props.imgUrls.length, (newLen, oldLen) => {
  if (oldLen === 0 && newLen > 0) restoreProgress()
})

// 监听 bookName 变化
watch(() => props.bookName, () => {
  if (props.imgUrls.length > 0) restoreProgress()
})
</script>

<style scoped lang="scss">
.page-reader {
  height: 100%;
  width: 100%;
  position: relative;
  background: #000;
  user-select: none;
  overflow: hidden;
}

.page-display {
  height: 100%;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  
  .el-image {
    height: 100%;
    max-width: 100%;
  }
}

.page-indicator {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 14px;
  cursor: pointer;
}

.page-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  color: #fff;
  cursor: pointer;
  // padding: 1px;
  border-radius: 8px;
  transition: opacity 0.2s, background-color 0.2s;

  &:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.8);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.page-btn-first {
  right: 100%;
  margin-right: 8px;
}

.page-btn-last {
  left: 100%;
  margin-left: 8px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slider-container {
  position: fixed;
  bottom: 3.2vh;
  background: #ffffff04;
  left: 50%;
  transform: translateX(-50%);
  width: 90vw;
  padding: 10px 15px;
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
  color: #333;
}

.edit-pen:hover {
  transform: scale(1.1);
}

:deep(.el-slider) {
  width: 100%;
}

:deep(.el-slider__runway) {
  background-color: rgba(255, 255, 255, 0.3);
}

:deep(.el-slider__bar) {
  background-color: var(--el-color-primary);
}
</style>
