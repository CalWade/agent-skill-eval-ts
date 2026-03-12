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
      <button class="history-btn" @click="historyDrawer = true">HISTORY &#9644;</button>
    </header>

    <!-- 3-column main -->
    <main class="app-main">
      <!-- Zone A: Config + Suite -->
      <aside class="zone-a">
        <div class="zone-a-scroll">
          <ConfigPanel />
          <SuitePanel @run="handleRun" />
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

      <!-- Zone B: Live Log + Progress -->
      <section class="zone-b">
        <LiveLog :logs="logs" :running="running" @clear="logs = []" />
        <ProgressBar :progress="progress" :running="running" />
      </section>

      <!-- Zone C: Result Dashboard -->
      <section class="zone-c">
        <div v-if="!currentReport" class="awaiting-state">
          <span class="awaiting-text">AWAITING TEST</span>
        </div>
        <ResultDashboard v-else :report="currentReport" />
      </section>
    </main>

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
import ConfigPanel from './components/ConfigPanel.vue'
import SuitePanel from './components/SuitePanel.vue'
import LiveLog from './components/LiveLog.vue'
import ResultDashboard from './components/ResultDashboard.vue'
import HistoryPanel from './components/HistoryPanel.vue'
import ProgressBar from './components/ProgressBar.vue'
import { startRun } from './api'
import { formatSseEvent } from './api/logFormatter'
import type { EvalReport, TestSuite } from './types'

// ── Clock ─────────────────────────────────────────────────────

function fmtClock() {
  const d = new Date()
  return d.toISOString().replace('T', ' ').slice(0, 19)
}
const clock = ref(fmtClock())
let clockTimer: ReturnType<typeof setInterval>
onMounted(() => { clockTimer = setInterval(() => { clock.value = fmtClock() }, 1000) })
onUnmounted(() => clearInterval(clockTimer))

// ── History drawer ─────────────────────────────────────────────

const historyDrawer = ref(false)

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
const currentReport = ref<EvalReport | null>(null)

// Pending payload updated whenever SuitePanel emits 'run'
const pendingPayload = ref<{ modelIds: string[]; suite: TestSuite } | null>(null)

const canRun = computed(() =>
  pendingPayload.value !== null &&
  pendingPayload.value.modelIds.length > 0 &&
  pendingPayload.value.suite.cases.length > 0 &&
  pendingPayload.value.suite.skill.length > 0
)

// SuitePanel emits 'run' on any change so App always has the latest payload
function handleRun(payload: { modelIds: string[]; suite: TestSuite }) {
  pendingPayload.value = payload
}

function handleStart() {
  if (running.value || !pendingPayload.value) return
  const payload = pendingPayload.value
  running.value = true
  progress.value = 0
  currentReport.value = null
  logs.value = []

  const total = payload.suite.cases.length * payload.modelIds.length
  let completed = 0

  addLog(`开始测试：${payload.suite.skill}`, 'info')
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
        currentReport.value = e.report
        progress.value = 100
      }
    },
    () => { running.value = false },
    (err) => { addLog(`致命错误：${err}`, 'error'); running.value = false },
  )
}

// ── History report ────────────────────────────────────────────

function handleViewReport(r: EvalReport) {
  currentReport.value = r
  historyDrawer.value = false
}
</script>

<style>
/* ── Reset & Global ─────────────────────────────────────── */
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-ui);
  background: var(--bg-root);
  color: var(--text-primary);
  font-size: var(--fs-base);
  min-width: 1280px;
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg-root); }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }

/* ── Layout ─────────────────────────────────────────────── */
.app-layout { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* ── Header ─────────────────────────────────────────────── */
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

.history-btn {
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
  transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
}

.history-btn:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan-dim);
  background: var(--accent-cyan-glow);
}

/* ── Main ───────────────────────────────────────────────── */
.app-main { display: flex; flex: 1; overflow: hidden; min-height: 0; }

/* ── Zone A (320px fixed) ────────────────────────────────── */
.zone-a {
  width: 320px;
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
  transition: filter var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
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

/* ── Zone B (flex:1) ─────────────────────────────────────── */
.zone-b {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-base);
  border-right: 1px solid var(--border-panel);
  min-width: 0;
}

/* ── Zone C (flex:1.5) ───────────────────────────────────── */
.zone-c {
  flex: 1.5;
  overflow-y: auto;
  padding: var(--space-4);
  background: var(--bg-base);
  background-image: radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px);
  background-size: 20px 20px;
  min-width: 0;
}

/* ── Awaiting state ──────────────────────────────────────── */
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

/* ── Element Plus Overrides ─────────────────────────────── */

/* Card */
.el-card {
  background: var(--bg-card) !important;
  border: 1px solid var(--border-card) !important;
  border-radius: var(--radius-card) !important;
  box-shadow: var(--shadow-card) !important;
}

.el-card__header {
  padding: 10px 14px !important;
  font-family: var(--font-ui) !important;
  font-size: var(--fs-sm) !important;
  font-weight: 700 !important;
  color: var(--accent-cyan) !important;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border-bottom: 1px solid var(--border-card) !important;
  position: relative;
  padding-left: 18px !important;
}

.el-card__header::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: var(--accent-cyan);
  border-radius: 0 2px 2px 0;
}

/* Input */
.el-input__wrapper {
  background: var(--bg-input) !important;
  box-shadow: 0 0 0 1px var(--border-input) inset !important;
  border-radius: var(--radius-base) !important;
  transition: box-shadow var(--transition-fast) !important;
}

.el-input__wrapper:hover {
  box-shadow: 0 0 0 1px var(--border-strong) inset !important;
}

.el-input__wrapper.is-focus {
  box-shadow: 0 0 0 1px var(--border-input-focus) inset, var(--shadow-focus) !important;
}

.el-input__inner {
  color: var(--text-primary) !important;
  font-size: var(--fs-base) !important;
}

.el-input__inner::placeholder {
  color: var(--text-muted) !important;
}

/* Button Primary (Amber industrial) */
.el-button--primary {
  background: var(--warn-amber) !important;
  border-color: var(--warn-amber) !important;
  color: #000 !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.06em !important;
  font-size: var(--fs-sm) !important;
  border-radius: var(--radius-base) !important;
  box-shadow: var(--shadow-btn) !important;
  transition: filter var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast) !important;
}

.el-button--primary:hover {
  filter: brightness(1.12) !important;
  background: var(--warn-amber) !important;
  border-color: var(--warn-amber) !important;
}

.el-button--primary:active {
  filter: brightness(0.88) !important;
  transform: translateY(1px) !important;
  box-shadow: var(--shadow-btn-active) !important;
}

/* Button default / text */
.el-button {
  border-radius: var(--radius-base) !important;
  font-size: var(--fs-sm) !important;
  color: var(--text-secondary) !important;
}

.el-button.is-text {
  background: transparent !important;
  border: none !important;
  color: var(--text-secondary) !important;
}

.el-button.is-text:hover {
  color: var(--accent-cyan) !important;
  background: var(--accent-cyan-glow) !important;
}

/* Checkbox */
.el-checkbox__input.is-checked .el-checkbox__inner {
  background-color: var(--accent-cyan) !important;
  border-color: var(--accent-cyan) !important;
}

.el-checkbox__inner {
  background: var(--bg-input) !important;
  border-color: var(--border-input) !important;
  border-radius: var(--radius-none) !important;
}

.el-checkbox__label {
  color: var(--text-primary) !important;
  font-size: var(--fs-base) !important;
}

/* Tag */
.el-tag {
  border-radius: var(--radius-sm) !important;
  font-size: var(--fs-xs) !important;
  font-weight: 600 !important;
  letter-spacing: 0.04em !important;
}

/* Form label */
.el-form-item__label {
  color: var(--text-secondary) !important;
  font-size: var(--fs-sm) !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
}

/* Select */
.el-select .el-input__wrapper {
  background: var(--bg-input) !important;
}

/* Collapse */
.el-collapse {
  border: none !important;
  background: transparent !important;
}

.el-collapse-item__header {
  background: var(--bg-card, #1c2026) !important;
  color: var(--text-secondary, #888) !important;
  border-bottom: 1px solid var(--border-base, rgba(255,255,255,0.07)) !important;
  font-size: var(--fs-sm, 12px) !important;
  padding: 0 12px !important;
}

.el-collapse-item__header:hover {
  color: var(--text-primary, #d4dce6) !important;
}

.el-collapse-item__wrap {
  background: var(--bg-base, #111416) !important;
  border-bottom: 1px solid var(--border-base, rgba(255,255,255,0.07)) !important;
}

.el-collapse-item__content {
  padding: 10px 12px !important;
  background: transparent !important;
}

/* Drawer */
.el-drawer {
  background: var(--bg-panel) !important;
  border-left: 1px solid var(--border-panel) !important;
}

.el-drawer__header {
  background: var(--bg-header) !important;
  border-bottom: 1px solid var(--border-strong) !important;
  padding: 14px 16px !important;
  margin-bottom: 0 !important;
}

.el-drawer__title {
  font-family: var(--font-mono) !important;
  font-size: var(--fs-sm) !important;
  font-weight: 700 !important;
  color: var(--accent-cyan) !important;
  text-transform: uppercase !important;
  letter-spacing: 0.10em !important;
}

.el-drawer__body {
  padding: 0 !important;
  overflow-y: auto !important;
}
</style>
