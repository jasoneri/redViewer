<template>
  <div>
  <!-- 筛选输入对话框 -->
  <el-dialog v-model="dialogVisible" title="筛选" width="80vw" top="15vh">
    <div class="filter-input-wrapper">
      <el-input v-model="filterInput" placeholder="大小写严格匹配" />
      <el-dropdown @command="handleKeywordSelect" trigger="click" placement="bottom-end" max-height="55vh">
        <el-button class="el-button--text">
          <el-icon><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu class="keyword-dropdown">
            <el-dropdown-item v-for="keyword in keywordsList" :key="keyword" :command="keyword">
              {{ keyword }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <template #footer>
      <span class="dialog-footer">
        <el-button round class="series-only-btn" @click="handleSeriesOnly" style="width: 30%;">
          <el-icon><SeriesIcon /></el-icon>&nbsp;筛系列
        </el-button>
        <el-button type="success" @click="showBoardDialog" style="width: 35%;">
          面板选择&nbsp;<el-icon><BoardIcon /></el-icon>
        </el-button>
        <el-button type="primary" @click="handleFilterConfirm">确认</el-button>
      </span>
    </template>
  </el-dialog>

  <!-- 筛选面板对话框 -->
  <el-dialog v-model="boardDialogVisible" title="筛选面板" width="80vw" top="15vh">
    <el-scrollbar class="filter-scrollbar">
      <div class="filter-tags-container">
        <el-tag
          v-for="keyword in keywordsList"
          :key="keyword"
          class="filter-tag"
          @click="handleTagClick(keyword)"
          :effect="filterInput === keyword ? 'dark' : 'plain'"
        >
          {{ keyword }}
        </el-tag>
      </div>
    </el-scrollbar>
  </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { SeriesIcon, BoardIcon } from '@/icons'

const props = defineProps({
  visible: { type: Boolean, default: false },
  keywordsList: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:visible', 'filter', 'seriesOnly'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const boardDialogVisible = ref(false)
const filterInput = ref('')

const handleKeywordSelect = (keyword) => {
  filterInput.value = keyword
}

const handleFilterConfirm = () => {
  if (filterInput.value) {
    emit('filter', filterInput.value)
    dialogVisible.value = false
  } else {
    ElMessage.warning('请输入关键字')
  }
}

const showBoardDialog = () => {
  dialogVisible.value = false
  boardDialogVisible.value = true
}

const handleTagClick = (keyword) => {
  filterInput.value = keyword
  emit('filter', keyword)
  boardDialogVisible.value = false
}

const handleSeriesOnly = () => {
  emit('seriesOnly')
  dialogVisible.value = false
}
</script>

<style scoped lang="scss">
.filter-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  
  .el-dropdown {
    position: absolute;
    right: 10px;
  }
  
  .el-input {
    width: 100%;
  }
}

.keyword-dropdown {
  max-height: 45vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.filter-tags-container {
  padding: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-tag {
  cursor: pointer;
  transition: all 0.3s;
  
  &:hover {
    transform: scale(1.05);
  }
}

.filter-scrollbar {
  height: 60vh;
}

.series-only-btn {
  background: var(--el-fill-color-light);
}
</style>