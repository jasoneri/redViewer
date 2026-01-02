// 引入vue router
import { createRouter, createWebHistory } from 'vue-router'

// 路由配置
const routes = [{
  path: '/',
  name: 'books list',
  meta: {
    title: "books list"
  },
  component: () => import('@/view/books_list.vue')
},{
  path: '/ep_list',
  name: 'ep_list',
  meta: {
    title: "episodes"
  },
  component: () => import('@/view/ep_list.vue')
},{
  path: '/book',
  name: 'book',
  meta: {
    title: "book"
  },
  component: () => import('@/view/book.vue')
},{
  path: '/kemono',
  name: 'kemono',
  meta: {
    title: "kemono artists"
  },
  component: () => import('@/view/kemono.vue')
},{
  path: '/kemono_books_list',
  name: 'kemono_books_list',
  meta: {
    title: "kemono books list"
  },
  component: () => import('@/view/kemono_books_list.vue')
},{
  path: '/kemono_book',
  name: 'kemono_book',
  meta: {
    title: "kemono book"
  },
  component: () => import('@/view/kemono_book.vue')
}]
// 创建 vueRouter 实例
const router = createRouter({
  history: createWebHistory(),
  routes
})
router.beforeEach((to, from) => {
    document.title=to.meta.title
})

export default router