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

createApp(App)
  .use(router)
  .use(ElementPlus)
  .use(createPinia())
  .mount('#app')
