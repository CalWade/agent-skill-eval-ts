<template>
  <div class="app-layout">
    <!-- 顶栏 -->
    <header class="app-header">
      <span class="app-title">[AGENT SKILL EVAL]</span>
      <div class="header-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >{{ tab.label }}</button>
      </div>
    </header>

    <!-- 主体：左右布局 -->
    <main class="app-main">
      <!-- 左侧配置面板 -->
      <aside class="left-panel">
        <ConfigPanel v-if="activeTab === 'run'" />
        <SuitePanel v-if="activeTab === 'run'" @run="handleRun" />
        <HistoryPanel v-if="activeTab === 'history'" @view="handleViewReport" />
      </aside>

      <!-- 右侧结果面板 -->
      <section class="right-panel">
        <LiveLog v-if="activeTab === 'run'" :logs="logs" :running="running" @clear="logs = []" />
        <ResultDashboard v-if="displayReport" :report="displayReport" />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ConfigPanel from './components/ConfigPanel.vue'
import SuitePanel from './components/SuitePanel.vue'
import LiveLog from './components/LiveLog.vue'
import ResultDashboard from './components/ResultDashboard.vue'
import HistoryPanel from './components/HistoryPanel.vue'
import { startRun } from './api'
import { formatSseEvent } from './api/logFormatter'
import type { EvalReport, TestSuite } from './types'

const tabs = [
  { key: 'run', label: '运行测试' },
  { key: 'history', label: '历史报告' },
]
const activeTab = ref<'run' | 'history'>('run')

// ── 实时日志 ──────────────────────────────────────────────────

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

// ── 运行状态 ──────────────────────────────────────────────────

const running = ref(false)
const report = ref<EvalReport | null>(null)

function handleRun(payload: { modelIds: string[]; suite: TestSuite }) {
  if (running.value) return
  running.value = true
  report.value = null
  logs.value = []

  addLog(`开始测试：${payload.suite.skill}`, 'info')
  addLog(`模型：${payload.modelIds.join(', ')}`, 'muted')
  addLog(`用例数：${payload.suite.cases.length}`, 'muted')

  startRun(
    payload.modelIds,
    payload.suite,
    (e) => {
      // 格式化 SSE 事件为日志行（逻辑内聚在 logFormatter.ts）
      const entries = formatSseEvent(e)
      for (const entry of entries) addLog(entry.text, entry.type)
      // 测试完成时更新报告
      if (e.type === 'done') report.value = e.report
    },
    () => { running.value = false },
    (err) => { addLog(`致命错误：${err}`, 'error'); running.value = false },
  )
}

// ── 历史报告 ──────────────────────────────────────────────────

const historyReport = ref<EvalReport | null>(null)
function handleViewReport(r: EvalReport) {
  historyReport.value = r
}

// 合并当前运行报告和历史报告，右侧面板统一展示
const displayReport = computed<EvalReport | null>(() =>
  activeTab.value === 'run' ? report.value : historyReport.value
)
</script>

<style>
/* ── Reset & Global ─────────────────────────────────────── */
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-ui);
  background: var(--bg-root);
  color: var(--text-primary);
  font-size: var(--fs-base);
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg-root); }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }

/* ── Layout ─────────────────────────────────────────────── */
.app-layout { display: flex; flex-direction: column; height: 100vh; }

/* ── Header ─────────────────────────────────────────────── */
.app-header {
  display: flex;
  align-items: center;
  gap: 24px;
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

.header-tabs { display: flex; gap: 2px; }

.tab-btn {
  padding: 0 18px;
  height: 52px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--fs-sm);
  font-family: var(--font-ui);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  transition: color var(--transition-fast), border-color var(--transition-fast);
  position: relative;
}

.tab-btn:hover { color: var(--text-primary); }

.tab-btn.active {
  color: var(--accent-cyan);
  border-bottom: 2px solid var(--accent-cyan);
}

/* ── Main ───────────────────────────────────────────────── */
.app-main { display: flex; flex: 1; overflow: hidden; }

/* ── Left Panel ─────────────────────────────────────────── */
.left-panel {
  width: 380px;
  flex-shrink: 0;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-panel);
  box-shadow: var(--shadow-panel);
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ── Right Panel ────────────────────────────────────────── */
.right-panel {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background: var(--bg-base);
  background-image: radial-gradient(circle, rgba(255,255,255,0.035) 1px, transparent 1px);
  background-size: 20px 20px;
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
</style>
