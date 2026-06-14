import DefaultTheme from 'vitepress/theme'
import MyLayout from './MyLayout.vue'
import './custom.css'
import HomeDemoVideo from './components/HomeDemoVideo.vue'

export default {
  extends: DefaultTheme,
  Layout: MyLayout,
  enhanceApp({ app }) {
    app.component('HomeDemoVideo', HomeDemoVideo)
  }
}