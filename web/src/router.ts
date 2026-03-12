import { createRouter, createWebHashHistory } from 'vue-router'
import MainPage from './pages/MainPage.vue'
import ReportPage from './pages/ReportPage.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: MainPage },
    { path: '/report', component: ReportPage },
  ],
})

export default router
