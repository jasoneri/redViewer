<template>
  <el-container>
    <el-header height="5vh" :style="`min-height: 40px`">
      <TopBtnGroupOfEp :bookName="bookName" :previousSeries="previousSeries" :nextSeries="nextSeries" />
    </el-header>
    <el-main>
      <el-scrollbar ref="scrollbarRef">
        <div class="demo-pagination-block">
          <el-pagination
            v-model:current-page="epPage"
            :page-size="pageSize" :total="epTotal"
            layout="prev, pager, next, jumper"
          />
        </div>
        <div class="grid-container">
          <el-row :gutter="20">
            <el-col v-for="ep in pagedEps" :key="ep.ep" :span="4" :xs="12" :sm="8" :md="6" :lg="4">
              <el-card :body-style="{ padding: '0px' }" class="book-card">
                <router-link :to="{ path: '/book', query: { book: bookName, ep: ep.ep }}">
                  <el-image :src="backend + ep.first_img" class="book-image" :title="ep.ep" fit="cover">
                    <template #error>
                      <div class="error-container">
                        <img src="/empty.png" alt="error" />
                      </div>
                    </template>
                  </el-image>
                  <div class="book-info">
                    <span class="book-title">{{ ep.ep }}</span>
                  </div>
                </router-link>
                <div class="book-actions">
                  <el-button-group :style="`width:100%;`">
                    <bookHandleBtn
                      :retainCallBack="retainCallBack" :removeCallBack="removeCallBack" :delCallBack="delCallBack"
                      :bookName="bookName" :epName="ep.ep" :bookHandlePath="'/comic/handle'" />
                  </el-button-group>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </div>
        <div class="demo-pagination-block">
          <el-pagination
            v-model:current-page="epPage"
            :page-size="pageSize" :total="epTotal"
            layout="prev, pager, next, jumper"
          />
        </div>
        <topBottom :scrollbarRef="scrollbarRef" :hideDown="true"/>
      </el-scrollbar>
    </el-main>
  </el-container>
</template>

<script setup>
import { ref, computed, h } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { backend, filteredBookList, pageSize } from '@/static/store.js';
import { ElNotification } from 'element-plus';
import bookHandleBtn from '@/components/bookHandleBtn.vue';
import topBottom from '@/components/topBottom.vue';
import TopBtnGroupOfEp from '@/components/TopBtnGroupOfEp.vue';

const route = useRoute();
const router = useRouter();
const scrollbarRef = ref(null);
const epPage = ref(1);

const bookName = computed(() => route.query.book);

const seriesOnly = computed(() => filteredBookList.arr.filter(b => b.eps));

const currentSeriesIndex = computed(() => {
  return seriesOnly.value.findIndex(b => b.book === bookName.value);
});

const previousSeries = () => {
  const idx = currentSeriesIndex.value;
  if (idx > 0) {
    router.push({ path: '/ep_list', query: { book: seriesOnly.value[idx - 1].book } });
  }
};

const nextSeries = () => {
  const idx = currentSeriesIndex.value;
  if (idx < seriesOnly.value.length - 1) {
    router.push({ path: '/ep_list', query: { book: seriesOnly.value[idx + 1].book } });
  }
};

const currentBook = computed(() => {
  return filteredBookList.arr.find(b => b.book === bookName.value);
});

const eps = computed(() => currentBook.value?.eps || []);
const epTotal = computed(() => eps.value.length);
const pagedEps = computed(() => {
  const start = (epPage.value - 1) * pageSize;
  const end = start + pageSize;
  return eps.value.slice(start, end);
});

function retainCallBack(done, path, epName) {
  notification('已移至保留目录', 'success', path);
  removeEpFromList(epName);
}
function removeCallBack(done, path, epName) {
  notification('已删至回收站', 'warning', path);
  removeEpFromList(epName);
}
function delCallBack(done, path, epName) {
  notification('已彻底删除', 'error', path);
  removeEpFromList(epName);
}

function removeEpFromList(epName) {
  const book = currentBook.value;
  if (book?.eps) {
    const idx = book.eps.findIndex(e => e.ep === epName);
    if (idx !== -1) book.eps.splice(idx, 1);
    if (book.eps.length === 0) {
      // 移除整个 book
      const bookIdx = filteredBookList.arr.findIndex(b => b.book === bookName.value);
      if (bookIdx !== -1) filteredBookList.arr.splice(bookIdx, 1);
      router.push('/');
    }
  }
}

const notification = (handle, _type, book) => {
  ElNotification({
    title: handle,
    message: h('i', { style: 'color: teal;font-size: 18px' }, book),
    type: _type,
    duration: 3500,
  });
};
</script>

<style lang="scss" scoped>
@use '@/styles/books_list.scss';
@use '@/styles/empty.scss';

.error-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  img {
    width: 100%;
    height: auto;
    object-fit: contain;
  }
}
</style>