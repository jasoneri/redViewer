<template>
    <el-container>
      <el-header>
        <TopBtnGroup :reload="reload" @send_sort="sv_sort"/>
      </el-header>
      <el-main>
        <el-scrollbar>
          <el-table :data="pagedArtists">
            <el-table-column prop="book" label="Artists" >
              <template v-slot="scope">
                <el-space wrap :size="'small'">
                  <router-link :style="`font-size: var(--el-font-size-extra-large)`"
                               :to="{ path: 'kemono_books_list', query: { u_s: scope.row.artists}}">
                    {{ scope.row.artists }}
                  </router-link>
                </el-space>
              </template>
            </el-table-column>
          </el-table>
        </el-scrollbar>
        <topBottom></topBottom>
      </el-main>
    </el-container>
</template>
<script setup>
    import {computed} from "vue";
    import axios from "axios";
    import {backend,kemonoData,sortVal} from "@/static/store.js";
    import topBottom from '@/components/topBottom.vue'
    import TopBtnGroup from '@/components/TopBtnGroup.vue'

    // ------------------------后端交互 & 数据处理
    const getArtists = async(callBack) => {
      await axios.get(backend() + '/kemono/')
        .then(res => {
          let result = res.data.map((_) => {
            return { artists: _}
          });
          callBack(result)
        })
        .catch(function (error) {
          console.log(error);
        })
    }
    const pagedArtists = computed(() => {
      return kemonoData.ArtistsList.arr;
    });
    // ------------------------渲染相关
    const init = () => {
      getArtists(callBack)
      function callBack(data){
        kemonoData.ArtistsList.arr = data
      }
    }
    init()
    const reload = init
    function sv_sort(val){
      sortVal.value = val
      reload()
    }

</script>
<style lang="scss" scoped>
    .app-container {
        display: flex;
        width: 100%;
        justify-content: center;
        .container {
            display: flex;
            flex-wrap: wrap;
            position: relative;
            .handler {
              display: flex;
              justify-content: center;
            }
        }
    }
</style>