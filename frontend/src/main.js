import { createApp } from 'vue'

// 引入element-puls
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './style.css'
import App from './App.vue'
import { createPinia } from 'pinia'
// 引入vue-router
import router from './router'
import { initBackend } from './static/store'

// 初始化后端配置后再挂载应用
initBackend().then(() => {
  createApp(App)
    .use(router)
    .use(ElementPlus)
    .use(createPinia())
    .mount('#app')
})
