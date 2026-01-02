<template>
  <div class="top-btn-wrapper">
  <el-button-group class="btn-group">
    <el-button text class="switch" :class="isDark ? 'isDark-switch' : 'noDark-switch'" style="flex: 1; height: 100%" @click="toggleDark">
      <el-icon v-if="!isDark" size="large"><SunIcon /></el-icon>
      <el-icon v-else size="large"><MoonIcon /></el-icon>
    </el-button>
    <el-button type="info" style="flex: 1; height: 100%" @click="toggleViewMode">
      <el-icon v-if="isListMode" size="large"><ListIcon /></el-icon>
      <el-icon v-else size="large"><Grid /></el-icon>
    </el-button>
    <el-button type="primary" :icon="RefreshRight" @click="props.reload(true)"
               style="flex: 7; height: 100%; font-size: 15px">
      重新加载</el-button>

    <el-dropdown trigger="click" style="flex: 1; height: 100%;" placement="bottom-end" size="large">
      <el-button type="success" @click="menuVisible = true" style="width: 100%; height: 100%;">
        <el-icon size="large"><Menu /></el-icon>
      </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :icon="Operation" @click="showConfDialog">配置</el-dropdown-item>
            <el-dropdown-item :icon="Filter" @click="open_filter">筛选</el-dropdown-item>
            <el-dropdown-item :icon="Switch" @click="switchDelMode">删除模式</el-dropdown-item>
            <el-dropdown-item @click="switchEroMode">
              <el-icon><DoujinIcon /></el-icon>&nbsp;切换同人志</el-dropdown-item>
            <el-select v-model="select_value" placeholder="排序" placement="left-start">
              <el-option
                v-for="item in select_options" style="height: 100%" :icon="Sort"
                :key="item.value" :label="item.label" :value="item.value"
                @click="handleSortChange(item.value)"
              />
              <template #footer>
                <el-button v-if="!isAdding" text bg size="small" @click="onAddOption">
                  自定义排序
                </el-button>
                <template v-else>
                  <el-input
                    v-model="optionName" class="option-input" size="small"
                    placeholder="自定义: 'time/name'+'_'+'asc/desc'"
                  />
                  <el-button type="primary" size="small" @click="onConfirm">confirm</el-button>
                  <el-button size="small" @click="clear">cancel</el-button>
                </template>
              </template>
            </el-select>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
  </el-button-group>

  <ConfigDialog
    :visible="dialogVisible"
    :initial-data="confForm"
    @update:visible="dialogVisible = $event"
    @submit="onConfSubmit"
  />

  <FilterDialog
    :visible="filterDialogVisible"
    :keywords-list="props.keywords_list"
    @update:visible="filterDialogVisible = $event"
    @filter="handleFilter"
    @series-only="handleSeriesOnly"
  />
  </div>
</template>

<script setup>
import {ref, onMounted, computed, reactive} from 'vue'
import {Filter, RefreshRight, Menu, Sort, Operation, Switch, Grid} from "@element-plus/icons-vue";
import {ElMessage} from 'element-plus'
import { useSettingsStore } from "@/static/store.js"
import { SunIcon, MoonIcon, ListIcon, DoujinIcon } from "@/icons"
import ConfigDialog from '@/components/func/ConfigDialog.vue'
import FilterDialog from '@/components/func/FilterDialog.vue'

const props = defineProps({
  modelValue: {type: Boolean, required: true},
  reload:{type: Function, required: true},
  handleConf:{type: Function, required: false},
  items: {type: Object, required: false},
  filteredItems: {type: Object, required: false},
  handleFilter: {type: Function, required: false},
  keywords_list: {type: Array, required: false}
})

const emit = defineEmits(['send_sort', 'update:modelValue', 'switchEro'])

const settingsStore = useSettingsStore()
const isListMode = computed(() => settingsStore.viewSettings.isListMode)
const isDark = computed(() => settingsStore.viewSettings.isDark)
const select_value = computed({
  get: () => settingsStore.sortValue,
  set: (value) => settingsStore.setSortValue(value)
})
const select_options = computed(() => [
  {value: 'time_desc', label: '时间倒序'},
  {value: 'name_asc', label: '名字顺序'},
  ...settingsStore.customSorts
])

onMounted(() => {
  emit('update:modelValue', isListMode.value)
  setTheme(isDark.value)
})

const setTheme = (isDarkMode) => {
  const html = document.querySelector('html')
  if (html) {
    if (isDarkMode) {
      html.classList.remove("light")
      html.classList.add("dark")
    } else {
      html.classList.remove("dark")
      html.classList.add("light")
    }
  }
}

const toggleDark = () => {
  settingsStore.toggleDark()
  setTheme(isDark.value)
}

const toggleViewMode = () => {
  settingsStore.toggleListMode()
  emit('update:modelValue', isListMode.value)
}

const switchDelMode = () => {
  if (settingsStore.viewSettings.isCompleteDel === false) {
    ElMessage ({
      message: `已切换至「彻底删除」模式，请谨慎操作`,
      type: 'warning',
      duration: 3500
    })
  }
  settingsStore.toggleDeleteMode()
}

const switchEroMode = () => {
  const newValue = !settingsStore.viewSettings.isEro
  emit('switchEro', newValue)
  settingsStore.toggle18Mode()
  ElMessage({
    message: newValue ? '已切换至「同人志」模式' : '已切换至「普通」模式',
    type: newValue ? 'success': 'info', duration: 2500
  })
}

const dialogVisible = ref(false);
const isAdding = ref(false)
const optionName = ref('')

// 配置表单相关
const confForm = reactive({ path: '', kemono_path: '' })

const filterDialogVisible = ref(false)

const open_filter = () => {
  filterDialogVisible.value = true
}

const handleFilter = (keyword) => {
  if (props.handleFilter) {
    props.handleFilter(keyword)
  } else {
    props.filteredItems.arr = props.items.arr.filter(item => item.book_name.includes(keyword))
  }
}

const showConfDialog = () => {
  if (props.handleConf) {
    props.handleConf((data) => {
      confForm.path = data.path || ''
      confForm.kemono_path = data.kemono_path || ''
      dialogVisible.value = true
    })
  }
}

const onConfSubmit = (data) => {
  if (props.handleConf) {
    props.handleConf(data)
  }
}
const onAddOption = () => {
  isAdding.value = true
}
const onConfirm = () => {
  if (optionName.value) {
    const newOption = {
      label: optionName.value,
      value: optionName.value,
    }
    settingsStore.addCustomSort(newOption)
    clear()
  }
}
const clear = () => {
  optionName.value = ''
  isAdding.value = false
}

const handleSortChange = (value) => {
  select_value.value = value
  emit('send_sort', value)
}

const handleSeriesOnly = () => {
  settingsStore.setSeriesOnly(true)
  props.filteredItems.arr = props.items.arr.filter(item => item.eps)
}
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

.switch {
  width: 40px;
  height: 20px;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  box-sizing: border-box;
  cursor: pointer;
  padding-bottom: 0;
  padding-top: 0;
  background-color: #fff !important;
  font-size: 12px;
}

.isDark-switch {
  background-color: rgb(8, 8, 8) !important;
  .el-icon {
    color: #fff;
    margin-left: 15px;
  }
}

.noDark-switch {
  background-color: #ebeef5 !important;
  .el-icon {
    background-color: #fff !important;
    padding: 2px;
    border-radius: 50%;
    color: #000;
    margin-left: -8px;
  }
}

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

.keyword-dropdown::-webkit-scrollbar {
  width: 6px;
}

.keyword-dropdown::-webkit-scrollbar-thumb {
  background-color: var(--el-border-color-darker);
  border-radius: 3px;
}

.keyword-dropdown::-webkit-scrollbar-track {
  background-color: var(--el-border-color-lighter);
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