<template>
  <div class="app-layout">
    <!-- Header -->
    <header class="app-header">
      <span class="app-title">[AGENT SKILL EVAL]</span>
      <div class="header-center">
        <span class="status-badge" :class="running ? 'status-running' : 'status-idle'">
          STATUS: {{ running ? 'RUNNING' : 'IDLE' }}
        </span>
        <span class="header-clock">{{ clock }}</span>
      </div>
      <div class="header-actions">
        <button class="header-btn" @click="historyDrawer = true">HISTORY &#9644;</button>
      </div>
    </header>

    <!-- 3-column main -->
    <main class="app-main">
      <!-- Zone A: Config + Suite (fixed 300px) -->
      <aside class="zone-a">
        <div class="zone-a-scroll">
          <ConfigPanel />
          <SuitePanel ref="suitePanelRef" @run="handleRun" />
        </div>
        <div class="zone-a-footer">
          <button
            class="cta-btn"
            :class="{ running, disabled: !canRun || running }"
            :disabled="!canRun || running"
            @click="handleStart"
          >
            <span v-if="running">EXECUTING...</span>
            <span v-else>&#9654; START TEST</span>
          </button>
        </div>
      </aside>

      <!-- Zone B: Case list (flex:1.2, enlarged) -->
      <section class="zone-b">
        <CasePanel
          v-if="suitePanelRef?.suite"
          :suite="suitePanelRef.suite"
          @change="handleCaseChange"
        />
      </section>

      <!-- Zone C: Live Log + Progress (flex:1) -->
      <section class="zone-c">
        <LiveLog :logs="logs" :running="running" @clear="logs = []" />
        <ProgressBar :progress="progress" :running="running" />
      </section>
    </main>

    <!-- Page switcher: fixed right-side hover tab -->
    <div class="page-switcher" @mouseenter="switcherOpen = true" @mouseleave="switcherOpen = false">
      <!-- collapsed handle -->
      <div class="switcher-handle" :class="{ open: switcherOpen }">
        <span class="switcher-handle-label">页面切换</span>
      </div>
      <!-- expanded card -->
      <transition name="switcher-slide">
        <div v-show="switcherOpen" class="switcher-card">
          <div class="switcher-title">NAVIGATE</div>
          <button class="switcher-item active">
            <span class="switcher-item-icon">&#9632;</span>
            <span class="switcher-item-text">测试台</span>
          </button>
          <button class="switcher-item" @click="goReport">
            <span class="switcher-item-icon">&#9650;</span>
            <span class="switcher-item-text">汇总大屏</span>
          </button>
        </div>
      </transition>
    </div>

    <!-- History Drawer -->
    <el-drawer
      v-model="historyDrawer"
      title="HISTORY"
      direction="rtl"
      size="360px"
      :append-to-body="true"
    >
      <HistoryPanel @view="handleViewReport" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import ConfigPanel from '../components/ConfigPanel.vue'
import SuitePanel from '../components/SuitePanel.vue'
import CasePanel from '../components/CasePanel.vue'
import LiveLog from '../components/LiveLog.vue'
import HistoryPanel from '../components/HistoryPanel.vue'
import ProgressBar from '../components/ProgressBar.vue'
import { startRun } from '../api'
import { formatSseEvent } from '../api/logFormatter'
import type { EvalReport, TestSuite } from '../types'

const router = useRouter()

// ── Clock ──────────────────────────────────────────────────────
function fmtClock() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}
const clock = ref(fmtClock())
let clockTimer: ReturnType<typeof setInterval>
onMounted(() => { clockTimer = setInterval(() => { clock.value = fmtClock() }, 1000) })
onUnmounted(() => clearInterval(clockTimer))

// ── History drawer ─────────────────────────────────────────────
const historyDrawer = ref(false)

// ── Page switcher ──────────────────────────────────────────────
const switcherOpen = ref(false)

// ── SuitePanel ref (exposes suite) ────────────────────────────
const suitePanelRef = ref<InstanceType<typeof SuitePanel> | null>(null)

function handleCaseChange() {
  // re-emit so canRun recomputes
  if (pendingPayload.value && suitePanelRef.value?.suite) {
    pendingPayload.value = { ...pendingPayload.value, suite: { ...suitePanelRef.value.suite } }
  }
}

// ── Live log ──────────────────────────────────────────────────
export interface LogEntry {
  id: number
  text: string
  type: 'info' | 'success' | 'error' | 'muted'
}

const logs = ref<LogEntry[]>([])
let logId = 0

function addLog(text: string, type: LogEntry['type'] = 'info') {
  logs.value.push({ id: logId++, text, type })
}

// ── Run state ─────────────────────────────────────────────────
const running = ref(false)
const progress = ref(0)

const pendingPayload = ref<{ modelIds: string[]; suite: TestSuite } | null>(null)

const canRun = computed(() =>
  pendingPayload.value !== null &&
  pendingPayload.value.modelIds.length > 0 &&
  pendingPayload.value.suite.cases.length > 0
)

function handleRun(payload: { modelIds: string[]; suite: TestSuite }) {
  pendingPayload.value = payload
}

function handleStart() {
  if (running.value || !pendingPayload.value) return
  // merge live suite cases in case CasePanel modified them
  const payload = suitePanelRef.value?.suite
    ? { ...pendingPayload.value, suite: { ...suitePanelRef.value.suite } }
    : pendingPayload.value

  running.value = true
  progress.value = 0
  logs.value = []

  const total = payload.suite.cases.length * payload.modelIds.length
  let completed = 0

  addLog(`开始测试：${payload.suite.skill ?? '(未命名)'}`, 'info')
  addLog(`模型：${payload.modelIds.join(', ')}`, 'muted')
  addLog(`用例数：${payload.suite.cases.length}`, 'muted')

  startRun(
    payload.modelIds,
    payload.suite,
    (e) => {
      const entries = formatSseEvent(e)
      for (const entry of entries) addLog(entry.text, entry.type)
      if (e.type === 'case_result') {
        completed++
        progress.value = total > 0 ? Math.round((completed / total) * 100) : 0
      }
      if (e.type === 'done') {
        progress.value = 100
        // store report and navigate to report page
        sessionStorage.setItem('latestReport', JSON.stringify(e.report))
      }
    },
    () => { running.value = false },
    (err) => { addLog(`致命错误：${err}`, 'error'); running.value = false },
  )
}

// ── History report ────────────────────────────────────────────
function handleViewReport(r: EvalReport) {
  sessionStorage.setItem('latestReport', JSON.stringify(r))
  historyDrawer.value = false
  router.push('/report')
}

function goReport() {
  router.push('/report')
}
</script>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────── */
.app-layout { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* ── Header ─────────────────────────────────────────────────── */
.app-header {
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

.app-title {
  font-family: var(--font-mono);
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--accent-cyan);
  letter-spacing: 0.10em;
  text-transform: uppercase;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-badge {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid;
}

.status-idle {
  color: var(--text-muted);
  border-color: var(--border-base);
  background: transparent;
}

.status-running {
  color: var(--warn-amber);
  border-color: var(--warn-amber-dim);
  background: rgba(245,166,35,0.08);
}

.header-clock {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-btn {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-base);
  border-radius: var(--radius-base);
  padding: 5px 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.header-btn:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan-dim);
  background: var(--accent-cyan-glow);
}

/* ── Main ───────────────────────────────────────────────────── */
.app-main { display: flex; flex: 1; overflow: hidden; min-height: 0; }

/* ── Zone A: Config sidebar (300px fixed) ────────────────────── */
.zone-a {
  width: 300px;
  flex-shrink: 0;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-panel);
  box-shadow: var(--shadow-panel);
  display: flex;
  flex-direction: column;
}

.zone-a-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
}

.zone-a-footer {
  flex-shrink: 0;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border-panel);
  background: var(--bg-panel);
}

.cta-btn {
  width: 100%;
  background: var(--warn-amber);
  color: #0d0f11;
  border: none;
  padding: 10px 16px;
  font-size: var(--fs-sm);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-radius: var(--radius-base);
  cursor: pointer;
  transition: filter 0.15s, transform 0.15s, box-shadow 0.15s;
  box-shadow: var(--shadow-btn);
}

.cta-btn:hover:not(.disabled):not(.running) { filter: brightness(1.12); }

.cta-btn:active:not(.disabled) {
  filter: brightness(0.88);
  transform: translateY(1px);
  box-shadow: var(--shadow-btn-active);
}

.cta-btn.disabled {
  background: rgba(245,166,35,0.25);
  color: rgba(0,0,0,0.4);
  cursor: not-allowed;
}

.cta-btn.running {
  background: rgba(245,166,35,0.6);
  cursor: not-allowed;
}

/* ── Zone B: Case panel (flex:1.4, enlarged) ─────────────────── */
.zone-b {
  flex: 1.4;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-panel);
  min-width: 0;
  overflow: hidden;
}

/* ── Zone C: Log (flex:1) ────────────────────────────────────── */
.zone-c {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-base);
  min-width: 0;
}

/* ── Page switcher ───────────────────────────────────────────── */
.page-switcher {
  position: fixed;
  right: 0;
  top: 25%;
  z-index: 200;
  display: flex;
  align-items: flex-start;
  /* extend hover area so card doesn't flicker when moving between handle and card */
  padding-left: 8px;
}

/* The always-visible tab handle */
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

/* The expanded card */
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
  color: var(--accent-cyan);
  flex-shrink: 0;
}

.switcher-item.active .switcher-item-icon {
  color: var(--accent-cyan);
}

.switcher-item:not(.active) .switcher-item-icon {
  color: var(--text-muted);
}

.switcher-item-text {
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
}

.switcher-item.active .switcher-item-text {
  color: var(--accent-cyan);
}

.switcher-item:not(.active):hover .switcher-item-text {
  color: var(--text-primary);
}

/* Slide transition */
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
