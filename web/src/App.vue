<template>
  <div class="app-layout">
    <!-- 顶栏 -->
    <header class="app-header">
      <span class="app-title">Agent Skill 评测平台</span>
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
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif; background: #0f1117; color: #e0e0e0; }

.app-layout { display: flex; flex-direction: column; height: 100vh; }

.app-header {
  display: flex; align-items: center; gap: 24px;
  padding: 0 20px; height: 48px;
  background: #1a1d27; border-bottom: 1px solid #2a2d3e;
  flex-shrink: 0;
}
.app-title { font-size: 15px; font-weight: 600; color: #a78bfa; }
.header-tabs { display: flex; gap: 4px; }
.tab-btn {
  padding: 4px 16px; border-radius: 6px; border: none;
  background: transparent; color: #888; cursor: pointer; font-size: 13px;
  transition: all .15s;
}
.tab-btn:hover { background: #2a2d3e; color: #ccc; }
.tab-btn.active { background: #2a2d3e; color: #a78bfa; }

.app-main { display: flex; flex: 1; overflow: hidden; }

.left-panel {
  width: 380px; flex-shrink: 0;
  border-right: 1px solid #2a2d3e;
  overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
}

.right-panel { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }

/* Element Plus 暗色覆盖 */
.el-card { --el-card-bg-color: #1a1d27; --el-border-color: #2a2d3e; }
.el-card__header { padding: 10px 14px; font-size: 13px; font-weight: 600; color: #a78bfa; }
.el-input__wrapper { background: #0f1117 !important; box-shadow: 0 0 0 1px #2a2d3e inset !important; }
.el-input__inner { color: #e0e0e0 !important; }
.el-checkbox__label { color: #ccc; font-size: 13px; }
.el-tag { font-size: 11px; }
</style>
