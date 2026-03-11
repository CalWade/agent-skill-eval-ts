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
        <ResultDashboard
          v-if="activeTab === 'run' && report"
          :report="report"
        />
        <ResultDashboard
          v-if="activeTab === 'history' && historyReport"
          :report="historyReport"
        />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import ConfigPanel from './components/ConfigPanel.vue'
import SuitePanel from './components/SuitePanel.vue'
import LiveLog from './components/LiveLog.vue'
import ResultDashboard from './components/ResultDashboard.vue'
import HistoryPanel from './components/HistoryPanel.vue'
import { startRun } from './api'
import type { EvalReport, SseEvent, TestSuite } from './types'

const tabs = [
  { key: 'run', label: '运行测试' },
  { key: 'history', label: '历史报告' },
]
const activeTab = ref<'run' | 'history'>('run')

// 实时日志
interface LogEntry {
  id: number
  text: string
  type: 'info' | 'success' | 'error' | 'muted'
}
const logs = ref<LogEntry[]>([])
let logId = 0

function addLog(text: string, type: LogEntry['type'] = 'info') {
  logs.value.push({ id: logId++, text, type })
}

// 运行状态
const running = ref(false)
const report = ref<EvalReport | null>(null)
let cancelRun: (() => void) | null = null

function handleRun(payload: { modelIds: string[]; suite: TestSuite }) {
  if (running.value) return
  running.value = true
  report.value = null
  logs.value = []

  addLog(`开始测试：${payload.suite.skill}`, 'info')
  addLog(`模型：${payload.modelIds.join(', ')}`, 'muted')
  addLog(`用例数：${payload.suite.cases.length}`, 'muted')

  function onEvent(e: SseEvent) {
    switch (e.type) {
      case 'model_start':
        addLog(`\n── [${e.index + 1}/${e.total}] 模型：${e.modelId} ──`, 'info')
        break
      case 'switch':
        addLog(`  切换模型：${e.cmd} ...`, 'muted')
        break
      case 'switch_ok':
        addLog(`  切换成功（${(e.durationMs / 1000).toFixed(1)}s）`, 'success')
        break
      case 'switch_fail':
        addLog(`  切换失败：${e.error}`, 'error')
        break
      case 'case_start':
        addLog(`\n  [${e.index + 1}/${e.total}] ${e.caseId} ${e.caseTitle}`, 'info')
        break
      case 'case_result': {
        const dur = `${(e.call.durationMs / 1000).toFixed(1)}s`
        const tok = e.call.totalTokens != null ? ` / ${e.call.totalTokens} tok` : ''
        addLog(`  耗时：${dur}${tok}`, 'muted')
        if (e.verdict === 'PASS') addLog(`  判定：✅ PASS`, 'success')
        else if (e.verdict === 'FAIL') {
          addLog(`  判定：❌ FAIL`, 'error')
          for (const r of e.failReasons) addLog(`    - ${r}`, 'error')
        }
        if (e.call.success) {
          addLog(`  回复：`, 'muted')
          for (const line of e.call.output.split('\n')) {
            addLog(`    ${line}`, 'info')
          }
        } else {
          addLog(`  错误：${e.call.error}`, 'error')
        }
        break
      }
      case 'model_done':
        addLog(`\n  ${e.modelId} 完成`, 'success')
        break
      case 'done':
        report.value = e.report
        addLog(`\n测试全部完成，报告已保存：${e.reportFile}`, 'success')
        break
      case 'error':
        addLog(`错误：${e.message}`, 'error')
        break
    }
  }

  cancelRun = startRun(
    payload.modelIds,
    payload.suite,
    onEvent,
    () => { running.value = false },
    (err) => { addLog(`致命错误：${err}`, 'error'); running.value = false },
  )
}

// 历史报告
const historyReport = ref<EvalReport | null>(null)
function handleViewReport(r: EvalReport) {
  historyReport.value = r
}
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
