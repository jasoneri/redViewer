<template>
    <el-container>
      <el-header>
        <TopBtnGroup :reload="reload" :items="kemonoData.BookList" :filtered-items="filteredBookList" 
                     :handle-filter="handleFilter" :keywords_list="keywords_list" @send_sort="sv_sort"/>
      </el-header>
      <el-main>
        <el-scrollbar>
          <div class="demo-pagination-block">
            <el-pagination
              v-model:current-page="indexPage"
              :page-size="pageSize" :total="bookTotal"
              layout="prev, pager, next, jumper"
            />
          </div>
          <el-table :data="pagedBook">
            <el-table-column prop="book" label="Book" >
              <template v-slot="scope">
                <el-space wrap :size="'small'">
                  <el-button type="info" style="width: 20%;height: 100%;" @click="setFilter(scope.row.book)">
                    <el-icon size="large"><Filter /></el-icon>
                  </el-button>
                  <el-button-group>
                    <bookHandleBtn :retainCallBack="retainCallBack" :removeCallBack="removeCallBack" :delCallBack="delCallBack"
                                   :bookName="scope.row.book" :bookHandlePath="'/kemono/handle'" :handleApiBodyExtra="{u_s: u_s}"/>
                  </el-button-group>
                  <router-link :style="`font-size: var(--el-font-size-extra-large)`"
                               :to="{ path: 'kemono_book', query: {u_s: u_s, book: scope.row.book}}">
                    {{ scope.row.book }}
                  </router-link>
                </el-space>
              </template>
            </el-table-column>
          </el-table>
          <div class="demo-pagination-block">
            <el-pagination
                v-model:current-page="indexPage"
                :page-size="pageSize" :total="bookTotal"
                layout="prev, pager, next, jumper"
            />
          </div>
        </el-scrollbar>
        <topBottom></topBottom>
      </el-main>
    </el-container>
</template>
<script setup>
    import {computed,h,ref} from 'vue';
    import axios from "axios";
    import {backend,indexPage,kemonoData,sortVal,pageSize,filteredBookList} from "@/static/store.js";
    import {ElNotification,ElMessage} from "element-plus";
    import topBottom from '@/components/topBottom.vue'
    import TopBtnGroup from '@/components/TopBtnGroup.vue'
    import bookHandleBtn from '@/components/bookHandleBtn.vue'
    import {useRoute} from "vue-router";
    import { Filter } from '@element-plus/icons-vue';

    const route = useRoute()
    const u_s = route.query.u_s
    const filterKeyword = ref('');
    const keywords_list = ref([]);

    // 添加过滤方法
    const applyFilter = (data) => {
      if (filterKeyword.value) {
        filteredBookList.arr = data.filter(item => item.book.includes(filterKeyword.value))
      } else {
        filteredBookList.arr = data
      }
    }

    const handleFilter = (keyword) => {
      filterKeyword.value = keyword
      localStorage.setItem('kemonoFilterKeyword', keyword)
      applyFilter(kemonoData.BookList.arr)
    }

    const setFilter = (book) => {
      // 2. 当book为`xxx yyy`形式时，keyword=xxx
      let keyword
      if (book.includes('[') && book.includes(']')) {
        keyword = book.split('[')[1].split(']')[0]
        handleFilter(keyword)
      } else if (book.includes(' ')) {
        keyword = book.split(' ')[0]
        handleFilter(keyword)
      } else {
        ElMessage({
          message: '没有适用过滤的规则',
          type: 'warning',
        });
      }
    }

    // ------------------------后端交互 & 数据处理
    const getBooks = async(callBack) => {
      const params = {u_s: u_s, sort: sortVal.value};
      await axios.get(backend() + '/kemono/book/', {params})
        .then(res => {
          let result = res.data.map((_) => {
            return { book: _}
          });
          callBack(result)
        })
        .catch(function (error) {
          console.log(error);
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
    // ------------------------渲染相关
    const init = () => {
      // 从 localStorage 读取筛选关键字
      const savedFilter = localStorage.getItem('kemonoFilterKeyword')
      if (savedFilter) {
        filterKeyword.value = savedFilter
      }
      
      getBooks(callBack)
      function callBack(data){
        kemonoData.BookList.arr = data
        applyFilter(data)
        // 异步提取关键词
        setTimeout(() => {
          const keywords = new Set()
          data.forEach(book => {
            const keyword = extractKeywords(book.book)
            if (keyword) keywords.add(keyword.slice(0, 20))
          })
          keywords_list.value = Array.from(keywords).sort((a, b) => a.localeCompare(b))
        }, 0)
      }
    }
    init()
    const reload = (refreshFilterKeyword = false) => {
      if (refreshFilterKeyword) {
        filterKeyword.value = ''
        localStorage.removeItem('kemonoFilterKeyword')
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

    const extractKeywords = (book) => {
      if (book.includes('[') && book.includes(']')) {
        return book.split('[')[1].split(']')[0]
      } else if (book.includes(' ')) {
        return book.split(' ')[0]
      }
      return null
    }

</script>
<style lang="scss" scoped>
    @use '@/styles/books_list.scss';
</style>