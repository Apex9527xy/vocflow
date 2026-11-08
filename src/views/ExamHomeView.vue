<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function openSection(section: 'basic' | 'university' | 'overseas'): void {
  void router.push({ path: '/exam/library', query: { section } })
}
</script>

<template>
  <div class="exam-home">
    <header class="home-header">
      <div>
        <div class="eyebrow">EXAM LIBRARY</div>
        <h1 class="heading-display">真题导航</h1>
      </div>
    </header>

    <section class="portal-grid">
      <button class="portal-card elementary" type="button" @click="openSection('basic')">
        <strong class="card-title">基础教育：一年级—高三</strong>
      </button>
      <button class="portal-card university" type="button" @click="openSection('university')">
        <strong class="card-title">大学板块：考研 四级 六级</strong>
      </button>
      <button class="portal-card overseas" type="button" @click="openSection('overseas')">
        <strong class="card-title">出国考试：雅思 托福</strong>
      </button>
    </section>
  </div>
</template>

<style scoped>
.exam-home { width: 100%; max-width: 1500px; height: 100%; min-height: 0; margin: 0 auto; display: flex; flex-direction: column; }
.home-header { flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 16px; }
.eyebrow { color: var(--accent); font-family: var(--font-mono); font-size: 8px; font-weight: 800; letter-spacing: 1.5px; }
.home-header h1 { margin: 4px 0 0; font-size: 27px; font-weight: 500; }
.portal-grid { flex: 1; min-height: 360px; width: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: stretch; }
.portal-card { min-width: 0; height: 100%; display: flex; align-items: center; justify-content: center; padding: 28px 20px; container-type: inline-size; border: 1px solid var(--glass-border); border-radius: 14px; background: var(--bg-card); box-shadow: var(--shadow-card); text-align: center; transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
.portal-card.elementary { border-top: 3px solid #22c55e; background: linear-gradient(145deg, rgba(34,197,94,.18), var(--bg-card) 65%); }
.portal-card.elementary .card-title { color: #15803d; }
.portal-card.university { border-top: 3px solid #f59e0b; background: linear-gradient(145deg, rgba(245,158,11,.2), var(--bg-card) 65%); }
.portal-card.university .card-title { color: #b45309; }
.portal-card.overseas { border-top: 3px solid #3b82f6; background: linear-gradient(145deg, rgba(59,130,246,.18), var(--bg-card) 65%); }
.portal-card.overseas .card-title { color: #1d4ed8; }
.portal-card:hover { transform: translateY(-2px); border-color: rgba(217,119,6,.28); box-shadow: 0 12px 30px rgba(44,36,32,.1); }
.card-title { display: block; max-width: 100%; color: var(--text-primary); font-size: clamp(16px, 5.4cqw, 32px); font-weight: 750; line-height: 1.25; white-space: nowrap; letter-spacing: -.025em; }
@media (max-width: 900px) {
  .exam-home { height: auto; }
  .portal-grid { flex: none; min-height: 0; grid-template-columns: 1fr; }
  .portal-card { min-height: 150px; }
}
</style>
