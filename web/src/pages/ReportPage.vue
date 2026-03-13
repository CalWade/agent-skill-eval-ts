<template>
  <div class="report-page-layout">
    <!-- Header -->
    <header class="report-header">
      <button class="back-btn" @click="router.push('/')">&#8592; 返回测试台</button>
      <span class="report-header-title">[EVAL REPORT]</span>
      <span class="header-clock">{{ clock }}</span>
    </header>

    <!-- Page switcher -->
    <div class="page-switcher" @mouseenter="switcherOpen = true" @mouseleave="switcherOpen = false">
      <div class="switcher-handle" :class="{ open: switcherOpen }">
        <span class="switcher-handle-label">页面切换</span>
      </div>
      <transition name="switcher-slide">
        <div v-show="switcherOpen" class="switcher-card">
          <div class="switcher-title">NAVIGATE</div>
          <button class="switcher-item" @click="router.push('/')">
            <span class="switcher-item-icon">&#9632;</span>
            <span class="switcher-item-text">测试台</span>
          </button>
          <button class="switcher-item active">
            <span class="switcher-item-icon">&#9650;</span>
            <span class="switcher-item-text">汇总大屏</span>
          </button>
        </div>
      </transition>
    </div>

    <!-- Body: sidebar + main -->
    <div class="report-body">
      <!-- 左侧：历史报告列表 -->
      <aside class="report-sidebar">
        <div class="sidebar-header">选择报告</div>
        <HistoryPanel @view="handleViewReport" />
      </aside>

      <!-- 右侧：报告内容 -->
      <main class="report-main">
        <div v-if="!currentReport" class="awaiting-state">
          <span class="awaiting-text">SELECT A REPORT</span>
        </div>
        <ResultDashboard v-else :report="currentReport" />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import ResultDashboard from '../components/ResultDashboard.vue'
import HistoryPanel from '../components/HistoryPanel.vue'
import type { EvalReport } from '../types'

const router = useRouter()

// ── Clock ──────────────────────────────────────────────────────
function fmtClock() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const clock = ref(fmtClock())
let clockTimer: ReturnType<typeof setInterval>
onMounted(() => {
  clockTimer = setInterval(() => { clock.value = fmtClock() }, 1000)

  // 如果从主页带来了报告数据，读取它
  const stored = sessionStorage.getItem('latestReport')
  if (stored) {
    try { currentReport.value = JSON.parse(stored) } catch { /* ignore */ }
  }
})
onUnmounted(() => clearInterval(clockTimer))

const switcherOpen = ref(false)
const currentReport = ref<EvalReport | null>(null)

function handleViewReport(r: EvalReport) {
  currentReport.value = r
  sessionStorage.setItem('latestReport', JSON.stringify(r))
}
</script>

<style scoped>
.report-page-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────────── */
.report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 52px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border-strong);
  box-shadow: var(--shadow-header);
  flex-shrink: 0;
}

.back-btn {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-base);
  border-radius: var(--radius-base);
  padding: 5px 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.back-btn:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan-dim);
  background: var(--accent-cyan-glow);
}

.report-header-title {
  font-family: var(--font-mono);
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--accent-cyan);
  letter-spacing: 0.10em;
  text-transform: uppercase;
}

.header-clock {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}

/* ── Body ───────────────────────────────────────────────────── */
.report-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* ── Sidebar ────────────────────────────────────────────────── */
.report-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-panel);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.10em;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-panel);
  flex-shrink: 0;
}

/* ── Main content ───────────────────────────────────────────── */
.report-main {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  background: var(--bg-base);
  background-image: radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px);
  background-size: 20px 20px;
  min-height: 0;
  min-width: 0;
}

/* ── Awaiting ───────────────────────────────────────────────── */
.awaiting-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.25;
}

.awaiting-text {
  font-family: var(--font-mono);
  font-size: var(--fs-xl);
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.20em;
  text-transform: uppercase;
}

/* ── Page switcher ───────────────────────────────────────────── */
.page-switcher {
  position: fixed;
  right: 0;
  top: 25%;
  z-index: 200;
  display: flex;
  align-items: flex-start;
  padding-left: 8px;
}

.switcher-handle {
  width: 30px;
  background: var(--bg-panel);
  border: 1px solid var(--border-panel);
  border-right: none;
  border-radius: var(--radius-card) 0 0 var(--radius-card);
  padding: 18px 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  box-shadow: -2px 0 8px rgba(0,0,0,0.4);
  transition: background 0.15s, border-color 0.15s;
}

.switcher-handle.open {
  background: var(--bg-card);
  border-color: var(--accent-cyan-dim);
}

.switcher-handle-label {
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  user-select: none;
  transition: color 0.15s;
}

.switcher-handle.open .switcher-handle-label {
  color: var(--accent-cyan);
}

.switcher-card {
  background: var(--bg-panel);
  border: 1px solid var(--accent-cyan-dim);
  border-right: none;
  border-radius: var(--radius-card) 0 0 var(--radius-card);
  padding: 12px 0 8px;
  min-width: 140px;
  box-shadow: -4px 0 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,200,212,0.08);
  overflow: hidden;
}

.switcher-title {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 0 14px 8px;
  border-bottom: 1px solid var(--border-base);
  margin-bottom: 4px;
}

.switcher-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: transparent;
  border: none;
  padding: 9px 14px;
  cursor: pointer;
  text-align: left;
  border-left: 2px solid transparent;
  transition: background 0.12s, border-color 0.12s;
}

.switcher-item:hover {
  background: var(--accent-cyan-glow);
  border-left-color: var(--accent-cyan);
}

.switcher-item.active {
  border-left-color: var(--accent-cyan);
  background: rgba(0,200,212,0.06);
  cursor: default;
}

.switcher-item-icon {
  font-size: 8px;
  flex-shrink: 0;
}

.switcher-item.active .switcher-item-icon { color: var(--accent-cyan); }
.switcher-item:not(.active) .switcher-item-icon { color: var(--text-muted); }

.switcher-item-text {
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
}

.switcher-item.active .switcher-item-text { color: var(--accent-cyan); }
.switcher-item:not(.active):hover .switcher-item-text { color: var(--text-primary); }

.switcher-slide-enter-active,
.switcher-slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.switcher-slide-enter-from,
.switcher-slide-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
