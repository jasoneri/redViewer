import {reactive, ref} from "vue";
import { defineStore } from 'pinia'
import axios from 'axios'

let _backendUrl = localStorage.getItem('backendUrl') || import.meta.env.LAN_IP

// 异步初始化后端地址
export async function initBackend() {
  // 优先级：localStorage > KV全局配置 > 构建时环境变量
  const localUrl = localStorage.getItem('backendUrl');
  if (localUrl) {
    _backendUrl = localUrl;
    return _backendUrl;
  }
  
  try {
    const res = await fetch('/api/config');
    const { backendUrl } = await res.json();
    if (backendUrl) {
      _backendUrl = backendUrl;
      return _backendUrl;
    }
  } catch (e) {
    console.warn('获取全局配置失败，使用默认值');
  }
  
  _backendUrl = import.meta.env.LAN_IP;
  return _backendUrl;
}

// 同步获取后端地址
export const backend = () => _backendUrl
export let indexPage = ref(1)
export const bookList = reactive({arr: []})
export const filteredBookList = reactive({arr: []})
export let sortVal = ref("")
export let pageSize = 30
export const kemonoData = {
  ArtistsList: reactive({arr: []}),
  BookList: reactive({arr: []})
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    viewSettings: JSON.parse(localStorage.getItem('viewSettings') || JSON.stringify({
      isDark: false,
      isListMode: false,
      isCompleteDel: false,
      isEro: false
    })),
    isSeriesOnly: false,
    displaySettings: JSON.parse(localStorage.getItem('displaySettings') || JSON.stringify({
      showSlider: false,
      showNavBtn: true,
      showCenterNextPrev: true,
      readingMode: 'scroll',  // 'scroll' | 'page'
      btnGroupPosition: 'top'  // 'top' | 'bottom'
    })),
    pageRecords: JSON.parse(localStorage.getItem('pageRecords') || '{}'),
    scrollConf: JSON.parse(localStorage.getItem('scrollConf') || JSON.stringify({
      intervalTime: 15,
      intervalPixel: 1
    })),
    sortValue: localStorage.getItem('sortValue') || '',
    customSorts: JSON.parse(localStorage.getItem('customSorts') || '[]'),
    scrollTopRecords: JSON.parse(localStorage.getItem('scrollTopRecords') || '{}'),
    locks: { config_path: false, book_handle: false, switch_doujin: false, force_rescan: false }
  }),
  actions: {
    toggleListMode() {
      this.viewSettings.isListMode = !this.viewSettings.isListMode
      localStorage.setItem('viewSettings', JSON.stringify(this.viewSettings))
    },
    toggleDark() {
      this.viewSettings.isDark = !this.viewSettings.isDark
      localStorage.setItem('viewSettings', JSON.stringify(this.viewSettings))
    },
    toggleSlider(value) {
      this.displaySettings.showSlider = value
      localStorage.setItem('displaySettings', JSON.stringify(this.displaySettings))
    },
    toggleNavBtn(value) {
      this.displaySettings.showNavBtn = value
      localStorage.setItem('displaySettings', JSON.stringify(this.displaySettings))
    },
    toggleCenterNextPrev(value) {
      this.displaySettings.showCenterNextPrev = value
      localStorage.setItem('displaySettings', JSON.stringify(this.displaySettings))
    },
    setReadingMode(mode) {
      this.displaySettings.readingMode = mode
      localStorage.setItem('displaySettings', JSON.stringify(this.displaySettings))
    },
    setBtnGroupPosition(position) {
      this.displaySettings.btnGroupPosition = position
      localStorage.setItem('displaySettings', JSON.stringify(this.displaySettings))
    },
    savePageRecord(bookName, page) {
      this.pageRecords[bookName] = page
      localStorage.setItem('pageRecords', JSON.stringify(this.pageRecords))
    },
    getPageRecord(bookName) {
      return this.pageRecords[bookName]
    },
    setSortValue(value) {
      this.sortValue = value
      localStorage.setItem('sortValue', value)
    },
    addCustomSort(sort) {
      this.customSorts.push(sort)
      localStorage.setItem('customSorts', JSON.stringify(this.customSorts))
    },
    toggleDeleteMode() {
      this.viewSettings.isCompleteDel = !this.viewSettings.isCompleteDel
      localStorage.setItem('viewSettings', JSON.stringify(this.viewSettings))
    },
    toggle18Mode() {
      this.viewSettings.isEro = !this.viewSettings.isEro
      localStorage.setItem('viewSettings', JSON.stringify(this.viewSettings))
    },
    setSeriesOnly(value) {
      this.isSeriesOnly = value
    },
    saveScrollTopRecord(bookName, page) {
      this.scrollTopRecords[bookName] = page
      localStorage.setItem('scrollTopRecords', JSON.stringify(this.scrollTopRecords))
    },
    getScrollTopRecord(bookName) {
      return this.scrollTopRecords[bookName] || 0
    },
    setScrollConf(intervalTime, intervalPixel) {
      this.scrollConf.intervalTime = intervalTime
      this.scrollConf.intervalPixel = intervalPixel
      localStorage.setItem('scrollConf', JSON.stringify(this.scrollConf))
    },
    async fetchLocks() {
      try {
        const res = await axios.get(backend() + '/root/locks')
        this.locks = res.data
      } catch (e) {
        console.error('获取锁状态失败', e)
      }
    },
    setLocks(locks) {
      this.locks = { ...this.locks, ...locks }
    }
  }
})