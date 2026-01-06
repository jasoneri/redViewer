<template>
  <div class="top-btn-wrapper">
  <el-button-group class="btn-group">
    <el-button style="flex: 1; height: 100%" type="info" @click="goBack">
      <el-icon size="large"><BackIcon /></el-icon>
    </el-button>
    <el-button style="flex: 4; height: 100%" type="primary" @click="previousBook"><el-icon class="el-icon--left" size="large"><ArrowLeft /></el-icon>上一本</el-button>
    <el-button style="flex: 4; height: 100%" type="primary" @click="nextBook">下一本<el-icon class="el-icon--right" size="large"><ArrowRight /></el-icon></el-button>
  <el-dropdown trigger="click" style="flex: 1; height: 100%;" placement="bottom-end" size="large">
    <el-button type="info"  @click="menuVisible = true" style="width: 100%; height: 100%;">
      <el-icon size="large"><Operation /></el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item>
          <el-radio-group v-model="readingMode">
            <el-radio-button value="scroll"><el-icon ><ArrowsVertical /></el-icon>滚动</el-radio-button>
            <el-radio-button value="page"><el-icon ><ArrowsHorizontal /></el-icon>翻页</el-radio-button>
          </el-radio-group>
        </el-dropdown-item>
        <el-dropdown-item :icon="ArrowDownBold" @click="showScrollConfDia">自动下滑设置</el-dropdown-item>
        <el-dropdown-item>
          <el-switch v-model="btnGroupPosition" :active-action-icon="Top" :inactive-action-icon="Bottom" active-text="按钮组在顶部" inactive-text="按钮组在底部" active-value="top" inactive-value="bottom"></el-switch>
        </el-dropdown-item>
        <el-dropdown-item>
          <el-switch v-model="showSlider" :active-action-icon="View" :inactive-action-icon="Hide" active-text="页数滚动条"></el-switch>
        </el-dropdown-item>
        <el-dropdown-item>
          <el-switch v-model="showNavBtn" :active-action-icon="View" :inactive-action-icon="Hide" active-text="导航按钮"></el-switch>
        </el-dropdown-item>
        <el-dropdown-item>
          <el-switch v-model="showCenterNextPrev" :active-action-icon="View" :inactive-action-icon="Hide" active-text="页中翻书按钮"></el-switch>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
  </el-button-group>
  <el-button-group v-if="showCenterNextPrev">
    <el-button 
      class="float-btn left-btn" 
      type="primary" 
      :icon="ArrowLeft" 
      @click="previousBook"
    />
    <el-button 
      class="float-btn right-btn" 
      type="primary" 
      :icon="ArrowRight" 
      @click="nextBook"
    >
    </el-button>
  </el-button-group>
  <ScrollSpeedDialog v-model:visible="dialogFormVisible" />
  </div>
</template>

<script setup>
import {ArrowDownBold, ArrowLeft, ArrowRight, Operation, Hide, View, Top, Bottom} from "@element-plus/icons-vue";
import { ArrowsHorizontal, ArrowsVertical } from "@/icons"
import { BackIcon } from '@/icons';
import ScrollSpeedDialog from '@/components/func/ScrollSpeedDialog.vue';
import {ref, watch} from "vue";
import {useSettingsStore} from "@/static/store.js";
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';

const router = useRouter();
const settingsStore = useSettingsStore()
const showCenterNextPrev = ref(settingsStore.displaySettings.showCenterNextPrev)
const showSlider = ref(settingsStore.displaySettings.showSlider)
const showNavBtn = ref(settingsStore.displaySettings.showNavBtn)
const readingMode = ref(settingsStore.displaySettings.readingMode || 'scroll')
const btnGroupPosition = ref(settingsStore.displaySettings.btnGroupPosition || 'top')

watch(readingMode, (newValue) => {
  settingsStore.setReadingMode(newValue)
})

watch(btnGroupPosition, (newValue) => {
  settingsStore.setBtnGroupPosition(newValue)
})

watch(showSlider, (newValue) => {
  settingsStore.toggleSlider(newValue)
  checkAllHidden()
})

watch(showNavBtn, (newValue) => {
  settingsStore.toggleNavBtn(newValue)
  checkAllHidden()
})

watch(showCenterNextPrev, (newValue) => {
  settingsStore.toggleCenterNextPrev(newValue)
  checkAllHidden()
})

const checkAllHidden = () => {
  if (!showSlider.value && !showNavBtn.value && !showCenterNextPrev.value) {
    ElMessage.warning('按钮全部隐藏时，页数过多将在中途无法快速处理，建议至少保留一项')
  }
}

const props = defineProps({
  previousBook:{type: Function, required: true},
  nextBook:{type: Function, required: true},
})
const dialogFormVisible = ref(false)

const showScrollConfDia = () => {
  dialogFormVisible.value = true
}

const goBack = () => {
  router.back();
};
</script>

<style scoped lang="scss">
.top-btn-wrapper {
  display: contents;
}
.btn-group {
  display: flex;
  width: 100%;
  height: 100%;
}

@media (hover: none) and (pointer: coarse) {
  .float-btn {
    -webkit-tap-highlight-color: transparent !important;
    tap-highlight-color: transparent;
    
    &:active, &:focus {
      background-color: rgba(0,0,0,0.3) !important;
      opacity: 0.3 !important;
    }
  }
}
.float-btn {
  position: fixed;
  top: 60vh;
  transform: translateY(-50%);
  width: 10vw !important;
  height: 15vh !important;
  min-width: 60px;
  min-height: 60px;
  opacity: 0.3;
  z-index: 999;
  transition: all 0.3s;
  background-color: rgba(0,0,0,0.3);
  border: none;
  &:hover,
  &:active {
    opacity: 0.8;
    background-color: rgba(64, 158, 255, 0.5);
  }
  :deep(.el-icon) {
    font-size: 2.5rem;
  }

}
.left-btn {
  left: 0;
  border-radius: 0 8px 8px 0;
}
.right-btn {
  right: 0;
  border-radius: 8px 0 0 8px;
}
</style>