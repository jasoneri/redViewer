<template>
  <el-button-group class="btn-group">
    <el-button type="info" style="flex: 1; height: 100%;" @click="$router.push('/')">
      <el-icon size="large"><BackIcon /></el-icon>
    </el-button>
    <el-button :type="isCompleteDel ? 'danger' : 'warning'" @click="switchDelMode" style="flex: 1; height: 100%;">
      <el-icon size="large"><Switch /></el-icon>
      <span class="btn-text">模式:{{ isCompleteDel ? '彻底删除' : '扔回收站' }}</span>
    </el-button>
    <el-button type="primary" style="flex: 1; height: 100%;" @click="props.previousSeries">
      <el-icon size="large"><ArrowLeft /></el-icon>
      <span class="btn-text">上一系列</span>
    </el-button>
    <el-dropdown trigger="click" placement="bottom-end" style="flex: 6; height: 100%;">
      <el-button class="book-name-btn" style="width: 100%; height: 100%;">{{ props.bookName }}</el-button>
      <template #dropdown>
        <div style="padding: 8px; border-bottom: 1px solid var(--el-border-color);">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索系列..."
            clearable
            @click.stop
          />
        </div>
        <el-dropdown-menu style="max-height: 60vh; max-width: 50vw; overflow-y: auto;">
          <el-dropdown-item
            v-for="series in filteredSeriesList"
            :key="series.book"
            @click="handleSeriesClick(series.book)"
            :class="{ 'is-active': series.book === props.bookName }"
          >
            {{ series.book }}
          </el-dropdown-item>
          <el-dropdown-item v-if="filteredSeriesList.length === 0" disabled>
            无匹配结果
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <el-button type="primary" style="flex: 1; height: 100%;" @click="props.nextSeries">
      <span class="btn-text">下一系列</span>
      <el-icon size="large"><ArrowRight /></el-icon>
    </el-button>
  </el-button-group>
</template>

<script setup>
import { ref, computed } from 'vue';
import { BackIcon } from '@/icons';
import { Back, ArrowLeft, ArrowRight, Switch } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useSettingsStore } from '@/static/store.js';
import { useRouter } from 'vue-router';

const router = useRouter();

const props = defineProps({
  bookName: { type: String, required: true },
  previousSeries: { type: Function, required: true },
  nextSeries: { type: Function, required: true },
  seriesList: { type: Array, required: true },
});

const searchKeyword = ref('');

const filteredSeriesList = computed(() => {
  if (!searchKeyword.value) return props.seriesList;
  const keyword = searchKeyword.value.toLowerCase();
  return props.seriesList.filter(series =>
    series.book.toLowerCase().includes(keyword)
  );
});

const settingsStore = useSettingsStore();
const isCompleteDel = computed(() => settingsStore.viewSettings.isCompleteDel);

const switchDelMode = () => {
  if (!settingsStore.viewSettings.isCompleteDel) {
    ElMessage({ message: `已切换至「彻底删除」模式，请谨慎操作`, type: 'warning', duration: 3500 });
  }
  settingsStore.toggleDeleteMode();
};

const handleSeriesClick = (bookName) => {
  router.push({ path: '/ep_list', query: { book: bookName } });
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

.is-active {
  background-color: var(--el-color-primary);
  color: var(--el-color-white);
}

@media (max-width: 768px) {
  .btn-text {
    display: none;
  }
}
</style>