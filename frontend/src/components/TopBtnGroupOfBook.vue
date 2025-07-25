<template>
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
  <el-button-group style="width: 100%; height: 100%">
    <el-button style="width: 10%; height: 100%" type="info" @click="goBack">
      <el-icon size="large"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g><path d="M0 0h24v24H0z" fill="none"/><path d="M5.828 7l2.536 2.536L6.95 10.95 2 6l4.95-4.95 1.414 1.414L5.828 5H13a8 8 0 1 1 0 16H4v-2h9a6 6 0 1 0 0-12H5.828z"/></g></svg></el-icon>
    </el-button>
    <el-button style="width: 37%; height: 100%" type="primary" :icon="ArrowLeft" @click="previousBook">上一本</el-button>
    <el-button style="width: 37%; height: 100%" type="primary" @click="nextBook">下一本<el-icon class="el-icon--right"><ArrowRight /></el-icon></el-button>
  <el-dropdown trigger="click" style="width: 16%;height: 100%;" placement="bottom-end" size="large">
    <el-button type="info"  @click="menuVisible = true" style="width: 100%;height: 100%;">
      <el-icon size="large"><Operation /></el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item :icon="ArrowDownBold" @click="showScrollConfDia">自动下滑设置</el-dropdown-item>
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
  <el-dialog v-model="dialogFormVisible" title="调速" width="70vw" align-center>
    <el-form>
      <el-form-item label="间隔时间毫秒" :label-width="formLabelWidth">
        <el-input v-model="settingsStore.scrollConf.intervalTime" autocomplete="off"  :clearable="true"/>
      </el-form-item>
      <el-form-item label="下滑像素" :label-width="formLabelWidth">
        <el-input v-model="settingsStore.scrollConf.intervalPixel" autocomplete="off" :clearable="true"/>
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-popover
          placement="bottom-start"
          :width="250"
          trigger="click"
        >
          <template #reference>
            <el-button class="m-2" :icon="InfoFilled" type="info">数值相关</el-button>
          </template>
          大致分为两种形式 <hr style="border-style: dotted">
          动画式：流畅下滑，数值均设小，<br>例如 15ms/1px <hr style="border-style: dashed">
          ppt式：跨度大，预留阅读时间，<br>例如 3000ms/400px<hr style="border-style: dashed">
          仅当 小于20px 且 小于200毫秒 <br>会被视为动画式
        </el-popover>
        <el-button @click="dialogFormVisible = false">Cancel</el-button>
        <el-button type="primary" @click="setScrollConf">Ok</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import {ArrowDownBold, ArrowLeft, ArrowRight, Operation, InfoFilled, Hide, View} from "@element-plus/icons-vue";
import {ref, watch} from "vue";
import {useSettingsStore} from "@/static/store.js";
import { useRouter } from 'vue-router';

const router = useRouter();
const settingsStore = useSettingsStore()
const showCenterNextPrev = ref(settingsStore.displaySettings.showCenterNextPrev)
const showSlider = ref(settingsStore.displaySettings.showSlider)
const showNavBtn = ref(settingsStore.displaySettings.showNavBtn)

watch(showSlider, (newValue) => {
  settingsStore.toggleSlider(newValue)
})

watch(showNavBtn, (newValue) => {
  settingsStore.toggleNavBtn(newValue)
})

watch(showCenterNextPrev, (newValue) => {
  settingsStore.toggleCenterNextPrev(newValue)
})

const props = defineProps({
  previousBook:{type: Function, required: true},
  nextBook:{type: Function, required: true},
})
const dialogFormVisible = ref(false)
const formLabelWidth = '140px'

const showScrollConfDia = () => {
  dialogFormVisible.value = true
}

const setScrollConf = () => {
  settingsStore.setScrollConf(settingsStore.scrollConf.intervalTime, settingsStore.scrollConf.intervalPixel)
  dialogFormVisible.value = false
}

const goBack = () => {
  router.back();
};
</script>

<style scoped lang="scss">
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