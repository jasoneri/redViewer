<template>
  <el-button
      :class="['handle-btn', { 'vertical-btn-sv': verticalMode }]"
      type="success"
      @click="retain(props.bookName)"
      :disabled="settingsStore.locks.book_handle"
  >
      <el-icon size="large"><SaveIcon /></el-icon>
  </el-button>
  <el-button
      :class="['handle-btn', { 'vertical-btn-del': verticalMode }]"
      :type="isCompleteDel ? 'danger' : 'warning'"
      @click="isCompleteDel ? delBook(props.bookName) : removeBook(props.bookName)"
      :disabled="settingsStore.locks.book_handle"
  ><el-icon size="large"><Delete /></el-icon></el-button>
</template>

<script setup>
    import { Delete } from '@element-plus/icons-vue'
    import { SaveIcon } from '@/icons'
    import axios from "axios";
    import {backend} from "@/static/store.js";
    import { ElMessage } from 'element-plus'
    import { computed } from 'vue'
    import { useSettingsStore } from "@/static/store.js"

    const settingsStore = useSettingsStore()
    const isCompleteDel = computed(() => settingsStore.viewSettings.isCompleteDel)

    const props = defineProps({
      bookName:{type: String, required: true},
      epName:{type: String, required: false, default: null},
      retainCallBack:{type: Function, required: true},
      removeCallBack:{type: Function, required: true},
      delCallBack:{type: Function, required: true},
      bookHandlePath:{type: String, required: true},
      handleApiBodyExtra:{type: Object, required: false},
      verticalMode:{type: Boolean, required: false}
    })

    const handleBook = async(handle, book, callBack) => {
      let body = {handle: handle, book: book, ep: props.epName};
      body = {...body, ...props.handleApiBodyExtra}
      axios.post(backend + props.bookHandlePath, body)
        .then(res => {
          callBack(res.data.handled, res.data.path, props.epName)
        })
        .catch(function (error) {
          if (error.response?.status === 403) {
            ElMessage.error('书籍操作已被锁定')
          } else {
            ElMessage('此为缓存，【'+book+'】已经处理过了，无法再次处理')
          }
        })
    }
    const retain = (book) => {
      handleBook('save', book, props.retainCallBack)
    }
    const removeBook = (book) => {
      handleBook('remove', book, props.removeCallBack)
    }
    const delBook = (book) => {
      handleBook('del', book, props.delCallBack)
    }
</script>

<style lang="scss" scoped>
.handle-btn {
    width: 50%;
    height: 100%;

    @mixin vertical-btn($bottom) {
      position: fixed;
      width: 11vw;
      max-width: 50px;
      height: 8vh;
      left: 0vw;
      bottom: $bottom;
      opacity: 0.6;
      margin: 0;
      &:hover {
        opacity: 1;
      }
    }
    &.vertical-btn-sv {
      @include vertical-btn(18vh);
    }
    &.vertical-btn-del {
      @include vertical-btn(10vh);
    }
}
</style>