<template>
    <el-container>
      <el-header height="5vh" :style="`min-height: 40px`">
        <TopBtnGroup :reload="reload" :items="bookList" :filtered-items="filteredBookList" :handle-conf="handleConf"
                     :handle-filter="handleFilter" :keywords_list="keywords_list" v-model="isListMode" @send_sort="sv_sort" @switchEro="handleswitchEro"/>
      </el-header>
      <el-main>
        <el-empty v-if="bookList.arr.length===0"
            :image="apiErr?`/empty.png`:`/empty_list.png`" :description="apiErr?backendErrText:emptyListText" />
        <el-scrollbar ref="scrollbarRef">
          <div class="demo-pagination-block">
            <el-pagination
              v-model:current-page="indexPage"
              :page-size="pageSize" :total="bookTotal"
              layout="prev, pager, next, jumper"
            />
          </div>
          <!-- 列表视图 -->
          <el-table v-if="isListMode" :data="pagedBook">
            <el-table-column prop="book" label="Book" >
              <template v-slot="{ row: item }">
                <el-space wrap :size="'small'">
                  <el-button v-if="!item.eps" type="info" style="width: 20%;height: 100%;" @click="setFilter(item.book)">
                    <el-icon size="large"><Filter /></el-icon>
                  </el-button>
                  <el-button-group v-if="!item.eps">
                    <bookHandleBtn :retainCallBack="retainCallBack" :removeCallBack="removeCallBack" :delCallBack="delCallBack"
                                   :bookName="item.book" :bookHandlePath="'/comic/handle'" />
                  </el-button-group>
                  <span v-else class="eps-badge">
                    <EpisodesIcon />
                    {{ item.eps.length }} Epsiodes
                  </span>
                  <router-link :style="`font-size: var(--el-font-size-extra-large)`"
                               :to="item.eps ? { path: '/ep_list', query: { book: item.book }} : { path: '/book', query: { book: item.book }}">
                    {{ item.book }}
                  </router-link>
                </el-space>
              </template>
            </el-table-column>
          </el-table>
          <!-- 网格视图 -->
          <div v-else class="grid-container">
            <el-row :gutter="20">
              <el-col v-for="item in pagedBook" :key="item.book" :span="4" :xs="12" :sm="8" :md="6" :lg="4">
                <el-card :body-style="{ padding: '0px' }" class="book-card">
                  <router-link :to="item.eps ? { path: '/ep_list', query: { book: item.book }} : { path: '/book', query: { book: item.book }}">
                    <el-image :src="backend+item.first_img" class="book-image" :title="item.book" fit="cover">
                      <template #error>
                        <div class="error-container">
                          <img src="/empty.png" :alt="errorText" />
                          <div class="error-text" v-html="errorText"></div>
                        </div>
                      </template>
                    </el-image>
                    <div class="book-info">
                      <span class="book-title">{{ item.book }}</span>
                    </div>
                  </router-link>
                  <div class="book-actions">
                    <el-button v-if="!item.eps" style="width: 20%;height: 100%;" type="info" @click="setFilter(item.book)" >
                      <el-icon size="large"><Filter /></el-icon>
                    </el-button>
                    <el-button-group v-if="!item.eps" :style="`width:100%;`">
                      <bookHandleBtn
                        :retainCallBack="retainCallBack" :removeCallBack="removeCallBack" :delCallBack="delCallBack"
                        :bookName="item.book" :bookHandlePath="'/comic/handle'" />
                    </el-button-group>
                    <span v-else class="eps-badge">
                      <EpisodesIcon />
                      {{ item.eps.length }} Epsiodes
                    </span>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </div>
          <div class="demo-pagination-block">
            <el-pagination
                v-model:current-page="indexPage"
                :page-size="pageSize" :total="bookTotal"
                layout="prev, pager, next, jumper"
            />
          </div>
          <topBottom :scrollbarRef="scrollbarRef" :hideDown="true"/>
        </el-scrollbar>
      </el-main>
    </el-container>
</template>

<script setup>
    import {computed, h, ref, onMounted} from 'vue';
    import axios from "axios";
    import {backend,indexPage,bookList,filteredBookList,sortVal,pageSize, useSettingsStore} from "@/static/store.js";
    import {ElNotification,ElMessage,ElLoading} from "element-plus";
    import TopBtnGroup from '@/components/TopBtnGroup.vue'
    import bookHandleBtn from '@/components/bookHandleBtn.vue'
    import topBottom from '@/components/topBottom.vue'
    import { Filter } from '@element-plus/icons-vue';
    import { EpisodesIcon } from '@/icons';

    const settingsStore = useSettingsStore()

    const isListMode = ref(true);
    const apiErr = ref(false);
    const filterKeyword = ref('');
    const keywords_list = ref([]);
    const scrollbarRef = ref(null)
    const errorText = computed(() => '这目录..<br>没有图片...')
    const backendErrText = computed(() => '后端异常...')
    const emptyListText = computed(() => '没找到书籍列表，点击右上配置修改 path 看看吧...')

    // 添加过滤方法
    const applyFilter = (data) => {
      let result = data
      if (filterKeyword.value) {
        result = result.filter(item => item.book.includes(filterKeyword.value))
      }
      if (settingsStore.isSeriesOnly) {
        result = result.filter(item => item.eps)
      }
      filteredBookList.arr = result
    }

    const extractKeywords = (book) => {
      if (book.includes('[') && book.includes(']')) {
        return book.split('[')[1].split(']')[0]
      }
      return null
    }

    // ------------------------后端交互 & 数据处理
    const getBooks = async(callBack) => {
      const params = {sort: sortVal.value};
      await axios.get(backend + '/comic/', {params})
        .then(res => {
          apiErr.value = false
          let result = res.data
          callBack(result)
        })
        .catch(function (error) {
          apiErr.value = error?.response?.data === "no books exists"?false:true
        })
    }
    const bookTotal = computed(() => {
      return filteredBookList.arr.length
    });
    const pagedBook = computed(() => {
      const start = (indexPage.value - 1) * pageSize;
      const end = start + pageSize;
      return filteredBookList.arr.slice(start, end);
    });
    const handleConf = async(param) => {
      if (typeof param === "function") {
        // GET 配置，返回 JSON 对象
        await axios.get(backend + '/comic/conf')
          .then(res => {param(res.data);})
          .catch(function (error) {console.log(error);})
      } else if (typeof param === "object") {
        // POST 配置，发送 JSON 对象
        await axios.post(backend + '/comic/conf', param)
          .then(res => {
            reload();
            ElNotification.success({
              title: '配置更改已成功',
              message: h('i', { style: 'white-space: pre-wrap; word-wrap: break-word;' }, `配置后端的静态资源锚点已更新`),
              offset: 150,
              duration: 1300
            })
            handleFilter('')  // 换配置时清除筛选值
          })
          .catch(function (error) {
            if (error.response?.status === 403) {
              ElMessage.error('路径配置已被锁定')
            } else {
              ElNotification.error({
                title: 'Error',
                message: '处理配置发生错误，自行去终端窗口查看报错堆栈',
                offset: 100,
              })
            }
          })
      } else {
         console.log("handleConf-param type = " + typeof param);
      }
    }
    // ------------------------渲染相关
    const init = () => {
      // 从 localStorage 读取排序值
      const savedSort = localStorage.getItem('sortValue')
      if (savedSort) {
        sortVal.value = savedSort
      }
      
      // 从 localStorage 读取筛选关键字
      const savedFilter = localStorage.getItem('filterKeyword')
      if (savedFilter) {
        filterKeyword.value = savedFilter
      }
      
      getBooks(callBack)
      function callBack(data){
        bookList.arr = data
        applyFilter(data)
        // 异步提取关键词
        setTimeout(() => {
          const keywords = new Set()
          data.forEach(item => {
            const keyword = extractKeywords(item.book)
            if (keyword) keywords.add(keyword.slice(0, 20))
          })
          keywords_list.value = Array.from(keywords).sort((a, b) => a.localeCompare(b))
        }, 0)
      }
    }

    onMounted(async () => {
      try {
        const res = await axios.get(backend + '/comic/switch_ero/')
        if (res.data !== settingsStore.viewSettings.isEro) {
          settingsStore.viewSettings.isEro = res.data
        }
      } catch (e) {
        console.warn('获取 ero 状态失败，使用本地缓存')
      }
      init()
    })
    const reload = (refreshFilterKeyword = false) => {
      if (refreshFilterKeyword) {
        filterKeyword.value = ''
        localStorage.removeItem('filterKeyword')
        settingsStore.setSeriesOnly(false)
      }
      init()
    }
    function retainCallBack(done, path){
        notification('已移至保留目录', 'success', path)
        reload()
      }
    function removeCallBack(done, path){
        notification('已删至回收站', 'warning', path)
        reload()
      }
    function delCallBack(done, _){
        notification('已彻底删除', 'error', _)
        reload()
      }
    const notification = (handle, _type, book) => {
      ElNotification({
        title: handle,
        message: h('i', { style: 'color: teal;font-size: 18px' }, book),
        type: _type,
        duration: 3500,
      })
    }
    function sv_sort(val){
      sortVal.value = val
      reload()
    }

    const handleswitchEro = async (enable) => {
      const loading = ElLoading.service({
        lock: true,
        text: '正在切换模式，请稍候...',
        background: 'rgba(0, 0, 0, 0.7)',
      })
      try {
        await axios.post(backend + '/comic/switch_ero', null, { params: { enable } })
        settingsStore.toggle18Mode()
        ElMessage({
          message: enable ? '已切换至「同人志」模式' : '已切换至「普通」模式',
          type: enable ? 'success' : 'info', duration: 2500
        })
        init()
      } catch (e) {
        if (e.response?.status === 403) {
          ElMessage.error('切换同人志已被锁定')
        }
      } finally {
        loading.close()
      }
    }

    const handleFilter = (keyword) => {
      filterKeyword.value = keyword
      localStorage.setItem('filterKeyword', keyword)
      applyFilter(bookList.arr)
    }

    const setFilter = (book) => {
      // 当book为`[artist]xxx`形式时，keyword=artist
      let keyword
      if (book.includes('[') && book.includes(']')) {
        keyword = book.split('[')[1].split(']')[0]
        handleFilter(keyword)
      } else {
        ElMessage({
          message: '没有适用过滤的规则',
          type: 'warning',
        });
      }
    }

</script>
<style lang="scss" scoped>
    @use '@/styles/books_list.scss';
    @use '@/styles/empty.scss';

.eps-badge {
  display: inline-flex;
  align-items: center;
  width: 100%;
  height: 32px;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--el-border-radius-large);
  background: var(--el-fill-color-light);
  box-shadow: var(--el-box-shadow);
  font-size: 14px;
  color: var(--el-text-color-primary);
  box-sizing: border-box;
  svg { flex-shrink: 0; }
}

.error-container {
  position: relative;
  display: inline-block;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;

  img {
    width: 100%;
    height: auto;
    object-fit: contain;
    margin-top: 3px;
  }
}

.error-text {
  position: relative;
  font-size: 1.1rem;
  font-weight: bold;
  color: #333;
  text-align: center;
  margin-top: 10px;
  padding: 0 5px;
  
  /* 可选文字阴影增强可读性 */
  text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.925);
}
</style>