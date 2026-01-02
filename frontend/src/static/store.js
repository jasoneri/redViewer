import {reactive, ref} from "vue";
import { defineStore } from 'pinia'

export const backend = import.meta.env.LAN_IP
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
      readingMode: 'scroll'  // 'scroll' | 'page'
    })),
    pageRecords: JSON.parse(localStorage.getItem('pageRecords') || '{}'),
    scrollConf: JSON.parse(localStorage.getItem('scrollConf') || JSON.stringify({
      intervalTime: 15,
      intervalPixel: 1
    })),
    sortValue: localStorage.getItem('sortValue') || '',
    customSorts: JSON.parse(localStorage.getItem('customSorts') || '[]'),
    scrollTopRecords: JSON.parse(localStorage.getItem('scrollTopRecords') || '{}')
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
    }
  }
})