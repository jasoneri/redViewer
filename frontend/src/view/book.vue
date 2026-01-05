<template>
  <el-container>
    <el-header height="5vh" :style="`min-height: 40px`" v-show="showBtn">
      <el-button-group style="width: 100%; height: 100%;" id="top-btn-group">
        <TopBtnGroupOfBook :nextBook="nextBook" :previousBook="previousBook" />
      </el-button-group>
    </el-header>
    <el-main id="main">
      <!-- 滚动模式 -->
      <template v-if="readingMode === 'scroll'">
        <el-scrollbar class="demo-image__lazy" :height="showBtn?`90vh`:`95vh`" always
        ref="scrollbarRef" @scroll.native.capture="handleRealScroll">
          <div ref="imageContainer">
            <el-image
              v-for="url in imgUrls.arr"
              :key="url"
              :src="url"
              :lazy="!settingsStore.displaySettings.showSlider"
              @load="handleImageLoad"
            />
            <el-empty class="custom-empty" v-if="!loadedFlag && imgUrls.arr.length===0"
              image="/empty.png" :description="errorText" />
          </div>
          <topBottom v-if="settingsStore.displaySettings.showNavBtn" :scrollbarRef="scrollbarRef" />
        </el-scrollbar>
        <!-- 滚动模式滑块 -->
        <div v-if="settingsStore.displaySettings.showSlider" class="slider-container">
          <el-icon class="edit-pen" @click="saveCurrScrollTop">
            <EditPen />
          </el-icon>
          <el-slider
            v-model="currScrollTop"
            :max="maxScrollHeight"
            :show-tooltip="false"
            @input="inputSlider"
          />
        </div>
      </template>
      
      <!-- 翻页模式 -->
      <PageReader
        v-else
        :imgUrls="imgUrls.arr"
        :bookName="route.query.book"
        :class="{ 'page-reader-fullscreen': !showBtn }"
        @showBtnChange="(v) => showBtn = v"
      />
      
      <div v-show="showBtn">
        <bookHandleBtn
            :retainCallBack="retainCallBack" :removeCallBack="removeCallBack" :delCallBack="delCallBack"
            :bookName="route.query.book" :epName="route.query.ep" :bookHandlePath="'/comic/handle'" :verticalMode="true"
        />
      </div>
    </el-main>
  </el-container>
</template>

<script setup>
    import {backend,bookList,filteredBookList} from '@/static/store.js'
    import axios from 'axios'
    import {useRoute,useRouter} from 'vue-router'
    import {reactive,markRaw,computed,ref,h} from "vue"
    import {ElMessageBox} from 'element-plus'
    import bookHandleBtn from '@/components/bookHandleBtn.vue'
    import {Delete, Finished, Warning,} from "@element-plus/icons-vue"
    import topBottom from '@/components/topBottom.vue'
    import TopBtnGroupOfBook from '@/components/TopBtnGroupOfBook.vue'
    import PageReader from '@/components/func/PageReader.vue'

// [slider.vue] script
import {EditPen} from "@element-plus/icons-vue";
import {onMounted, onBeforeUnmount, nextTick, watch} from "vue";
import { ElMessage,ElNotification } from 'element-plus'
import { useSettingsStore } from '@/static/store'
import { debounce } from 'lodash-es';
const settingsStore = useSettingsStore()
const imageContainer = ref(null) // 引用图片容器
const maxScrollHeight = ref(0)   // 最大滚动高度
// [slider.vue] script end

    const route = useRoute()
    const router = useRouter()
    const imgUrls = reactive({arr:[]})
    const loadedImages = ref(0)
    const totalImages = ref(0)
    const currScrollTop = ref(0)
    const scrollbarRef = ref(null)
    const showBtn = ref(true)
    const btnShowThreshold = 0.15
    const errorText = computed(() => '已经说过没图片了！..')
    const readingMode = computed(() => settingsStore.displaySettings.readingMode || 'scroll')

    const getBook = async(book, ep, callBack) => {
      const params = ep ? { ep } : {};
      await axios.get(backend + '/comic/' + encodeURIComponent(book), { params })
        .then(res => {
          let result = res.data.map((_) => {
            return backend + _
          });
          totalImages.value = result.length
          loadedImages.value = 0
          callBack(result)
        })
        .catch(function (error) {
          console.log(error);
        })
    }
    // 当前书籍对象
    const currentBook = computed(() => {
      return filteredBookList.arr.find(item => item.book === route.query.book)
    });
    // 当前章节索引（有章节时）
    const currentEpIndex = computed(() => {
      if (!route.query.ep || !currentBook.value?.eps) return -1
      return currentBook.value.eps.findIndex(e => e.ep === route.query.ep)
    });
    // 无章节书籍列表
    const singlesOnly = computed(() => {
      return filteredBookList.arr.filter(item => !item.eps)
    });
    // 当前书籍在无章节列表中的索引
    const singleIndex = computed(() => {
      return singlesOnly.value.findIndex(item => item.book === route.query.book)
    });
    
    const init = () => {
      const book = route.query.book
      const ep = route.query.ep || null
      getBook(book, ep, callBack)
      function callBack(data){
        imgUrls.arr = data
      }
    }
    init()
    function triggerInit(book, ep = null){
      imgUrls.arr = []
      const query = ep ? { book, ep } : { book }
      router.replace({path:'/book', query})
      getBook(book, ep, (data) => { imgUrls.arr = data })
    }
    function previousBook(){
      const ep = route.query.ep
      if (ep && currentBook.value?.eps) {
        // 有章节：在同系列章节中导航
        const prevIdx = currentEpIndex.value - 1
        if (prevIdx >= 0) {
          triggerInit(route.query.book, currentBook.value.eps[prevIdx].ep)
        }
      } else {
        // 无章节：在无章节书籍中导航
        const prevIdx = singleIndex.value - 1
        if (prevIdx >= 0) {
          triggerInit(singlesOnly.value[prevIdx].book)
        }
      }
    }
    function nextBook(){
      const ep = route.query.ep
      if (ep && currentBook.value?.eps) {
        // 有章节：在同系列章节中导航
        const nextIdx = currentEpIndex.value + 1
        if (nextIdx < currentBook.value.eps.length) {
          triggerInit(route.query.book, currentBook.value.eps[nextIdx].ep)
        }
      } else {
        // 无章节：在无章节书籍中导航
        const nextIdx = singleIndex.value + 1
        if (nextIdx < singlesOnly.value.length) {
          triggerInit(singlesOnly.value[nextIdx].book)
        }
      }
    }

    // 保存操作前的导航目标
    const savedNextBook = ref(null)
    const savedPrevBook = ref(null)
    
    function saveNavTargets() {
      const ep = route.query.ep
      if (ep && currentBook.value?.eps) {
        const idx = currentEpIndex.value
        savedPrevBook.value = idx > 0 ? { book: route.query.book, ep: currentBook.value.eps[idx - 1].ep } : null
        savedNextBook.value = idx < currentBook.value.eps.length - 1 ? { book: route.query.book, ep: currentBook.value.eps[idx + 1].ep } : null
      } else {
        const idx = singleIndex.value
        savedPrevBook.value = idx > 0 ? { book: singlesOnly.value[idx - 1].book } : null
        savedNextBook.value = idx < singlesOnly.value.length - 1 ? { book: singlesOnly.value[idx + 1].book } : null
      }
    }
    
    function removeFromList() {
      saveNavTargets()
      const ep = route.query.ep
      if (ep && currentBook.value?.eps) {
        const idx = currentBook.value.eps.findIndex(e => e.ep === ep)
        if (idx !== -1) currentBook.value.eps.splice(idx, 1)
      } else {
        const idx = filteredBookList.arr.findIndex(b => b.book === route.query.book)
        if (idx !== -1) filteredBookList.arr.splice(idx, 1)
      }
    }
    function retainCallBack(done, path) {removeFromList(); MsgOpen(done, Finished, 'success', path)}
    function removeCallBack(done, path) {removeFromList(); MsgOpen(done, Warning, 'warning', path)}
    function delCallBack(done, path) {removeFromList(); MsgOpen(done, Delete, 'error', path)}
    const MsgOpen = (handle, _ico, _type, book) => {
      function back_index(){router.push({path: '/'})}
      function goNext() {
        if (savedNextBook.value) {
          triggerInit(savedNextBook.value.book, savedNextBook.value.ep)
        }
      }
      function goPrev() {
        if (savedPrevBook.value) {
          triggerInit(savedPrevBook.value.book, savedPrevBook.value.ep)
        }
      }
      ElMessageBox.confirm(
        book,
        handle + ' (点消息框右上x返回目录)',
        {
          distinguishCancelAndClose: true,
          confirmButtonText: '下一排序',
          cancelButtonText: '上一排序',
          center: true,
          type: _type,
          icon: markRaw(_ico),
        }
      )
      .then(() => {
        goNext()
      })
      .catch((action) => {
        const catch_func = action === 'cancel' ? goPrev : back_index;
        catch_func();
      })
    }

    const handleRealScroll = (e) => {
      const scrollTop = e.target.scrollTop
      currScrollTop.value = scrollTop

      const maxScrollTop = e.target.scrollHeight - e.target.clientHeight
      const thresholdVal = maxScrollTop * btnShowThreshold
      showBtn.value = 
        scrollTop <= thresholdVal || 
        scrollTop >= maxScrollTop - thresholdVal
    }
    const inputSlider = (scrollTopVal) => {
      scrollbarRef.value?.setScrollTop(scrollTopVal)
    }

// [slider.vue] script
const handleImageLoad = () => {
  loadedImages.value++
  if (loadedImages.value === totalImages.value && totalImages.value > 0) {
    nextTick(() => {
      calculateTotalHeight()
      const savedScrollTop = settingsStore.getScrollTopRecord(route.query.book)
      savedScrollTop && scroll2Top(savedScrollTop)
    })
  }
}
const loadedFlag = computed(() => {
  if (totalImages.value === 0) return
  const _loadFlag = loadedImages.value === totalImages.value
  if (!settingsStore.displaySettings.showSlider && _loadFlag) return true;
  if (!imageContainer.value) return _loadFlag;
  const imgs = imageContainer.value.querySelectorAll('.el-image');
  return !imgs || imgs.length === totalImages.value
})
const calculateTotalHeight = () => {
  if (!imageContainer.value) return;
  // 获取所有图片元素
  const images = imageContainer.value.querySelectorAll('.el-image');
  let totalHeight = 0;
  // 计算所有图片的总高度
  images.forEach((img, index) => {
    const imgHeight = img.offsetHeight;
    // 解决部分过长书，其最后图片只显示一半左右的情况
    totalHeight += (index === images.length-1) ? imgHeight * 1.5 : imgHeight
  });
  // 设置最大滚动高度（总高度减去视口高度）
  const scrollWrap = scrollbarRef.value?.wrap$;
  maxScrollHeight.value = scrollWrap 
    ? Math.max(0, totalHeight - scrollWrap.clientHeight) 
    : totalHeight
  console.log('计算最大滚动高度:', maxScrollHeight.value);
};
// 保存当前页
const saveCurrScrollTop = () => {
  const v = parseInt(currScrollTop.value)
  settingsStore.saveScrollTopRecord(route.query.book, v)
  ElMessage.success(`已记录翻滚像素 ${v} `)
  ElNotification({
    title: '仅限滚动条可视状态下',
    message: h('span', { style: 'font-size: large' }, '重读此本会自动跳到此处'),
    type: 'info',offset: 50,duration: 2800,
  })
}
const scroll2Top = (val) => {
  if (settingsStore.displaySettings.showSlider && !loadedFlag.value && maxScrollHeight.value) {
    console.log('scroll2Top 循环中！');
    setTimeout(()=>{scroll2Top(val)}, 150)
  }
  if (loadedFlag.value) {
    currScrollTop.value = val
    scrollbarRef.value?.setScrollTop(val);
  }
}
// 初始化：计算总高度
onMounted(() => {
  if (settingsStore.displaySettings.showSlider) {
    nextTick(calculateTotalHeight);
  }
});

// 监听滑块显示状态变化
watch(() => settingsStore.displaySettings.showSlider, (newValue, oldValue) => {
  if (newValue && oldValue === false) {
    // 强制重新渲染所有图片（取消懒加载）
    const urls = [...imgUrls.arr];
    imgUrls.arr = [];
    nextTick(() => {
      imgUrls.arr = urls;
      loadedImages.value = 0;
      totalImages.value = urls.length;
    });
  }
});
</script>

<style lang="scss" scoped>
  @use '@/styles/book.scss';
  @use '@/styles/empty.scss';

  // [slider.vue] scss
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
    background: #0000003b;
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

  // 翻页模式非全屏：保持在容器内居中
  :deep(.page-reader) {
    height: 90vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .page-reader-fullscreen {
    position: fixed !important;
    top: 0;
    left: 0;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 1000;
  }
</style>
