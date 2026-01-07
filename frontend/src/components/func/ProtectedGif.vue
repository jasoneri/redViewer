<template>
  <div class="protected-gif-wrapper" @contextmenu.prevent>
    <img 
      v-if="blobUrl" 
      :src="blobUrl" 
      :class="imageClass"
      :alt="alt"
      @dragstart.prevent
      @selectstart.prevent
    />
    <div v-if="loading" class="loading-overlay">
      <el-icon class="is-loading"><Loading /></el-icon>
    </div>
    <div v-if="error" class="error-overlay">
      <slot name="error">
        <div class="error-text">加载失败</div>
      </slot>
    </div>
    <div class="protection-mask"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Loading } from '@element-plus/icons-vue';

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  imageClass: {
    type: String,
    default: ''
  },
  alt: {
    type: String,
    default: 'Protected GIF'
  }
});

const blobUrl = ref('');
const loading = ref(true);
const error = ref(false);

const loadGif = async () => {
  loading.value = true;
  error.value = false;
  
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value);
    blobUrl.value = '';
  }
  
  try {
    const response = await fetch(props.src, {
      mode: 'cors',
      credentials: 'same-origin'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const blob = await response.blob();
    blobUrl.value = URL.createObjectURL(blob);
    loading.value = false;
  } catch (err) {
    console.error('GIF 加载失败:', err);
    error.value = true;
    loading.value = false;
  }
};

onMounted(() => {
  loadGif();
  document.addEventListener('keydown', preventSave);
});

onUnmounted(() => {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value);
  }
  
  document.removeEventListener('keydown', preventSave);
});

watch(() => props.src, () => {
  loadGif();
});

const preventSave = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
  }
};
</script>

<style lang="scss" scoped>
.protected-gif-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  
  img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -webkit-user-drag: none;
    pointer-events: none;
  }
  
  .protection-mask {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    cursor: default;
  }
  
  .loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.05);
    z-index: 5;
    
    .el-icon {
      font-size: 32px;
      color: var(--el-color-primary);
    }
  }
  
  .error-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--el-fill-color-lighter);
    z-index: 5;
    
    .error-text {
      font-size: 14px;
      color: var(--el-text-color-secondary);
    }
  }
}
</style>