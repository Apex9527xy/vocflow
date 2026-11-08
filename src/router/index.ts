import { createRouter, createMemoryHistory } from 'vue-router'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue')
    },
    {
      path: '/study',
      name: 'study',
      component: () => import('../views/WordStudyView.vue')
    },
    {
      path: '/review',
      name: 'review',
      component: () => import('../views/WordReviewView.vue')
    },
    {
      path: '/stats',
      name: 'stats',
      component: () => import('../views/StatsView.vue')
    },
    {
      path: '/focus',
      name: 'focus',
      component: () => import('../views/FocusView.vue')
    },
    {
      path: '/listening',
      name: 'listening',
      component: () => import('../views/ListeningView.vue')
    },
    {
      path: '/reading',
      name: 'reading',
      component: () => import('../views/ReadingView.vue')
    },

    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue')
    },
    {
      path: '/wrong-words',
      name: 'wrongWords',
      component: () => import('../views/WrongWordsView.vue')
    },
    {
      path: '/plan',
      name: 'studyPlan',
      component: () => import('../views/StudyPlanView.vue')
    },
    {
      path: '/exam',
      name: 'examHome',
      component: () => import('../views/ExamHomeView.vue')
    },
    {
      path: '/exam/library',
      name: 'exam',
      component: () => import('../views/ExamHubView.vue')
    },
    {
      path: '/literature',
      name: 'literature',
      component: () => import('../views/LiteratureView.vue')
    },
    {
      path: '/roots',
      name: 'rootAffix',
      component: () => import('../views/RootAffixView.vue')
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('../views/SearchView.vue')
    },
  ]
})

export default router
