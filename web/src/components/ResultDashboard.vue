<template>
  <div class="result-dashboard">

    <!-- ── 头部元信息 ── -->
    <div class="dashboard-header">
      <span class="dashboard-title">汇总大屏</span>
      <el-tag size="small" effect="plain">{{ report.skill }}</el-tag>
      <span class="header-time">{{ formatTime(report.timestamp) }}</span>
      <div style="flex:1" />
      <span class="header-meta">{{ report.cases.length }} 用例 · {{ report.modelIds.length }} 模型</span>
    </div>

    <!-- ── 一、模型统计卡片 ── -->
    <div class="stat-row">
      <div
        v-for="stat in modelStats"
        :key="stat.modelId"
        class="stat-card"
        :class="statCardClass(stat)"
      >
        <div class="stat-model" :title="stat.modelId">{{ stat.modelId }}</div>

        <!-- 通过率主数字 -->
        <div class="stat-pass">
          <span class="stat-num">{{ stat.passed }}/{{ stat.judged }}</span>
          <span class="stat-rate">{{ stat.judged > 0 ? Math.round(stat.passRate * 100) + '%' : '-' }}</span>
        </div>
        <div class="stat-label">PASS RATE</div>

        <!-- 次要指标行 -->
        <div class="stat-secondary">
          <span class="stat-pill">{{ stat.avgDur }}s 均耗时</span>
          <span v-if="stat.displayCount > 0" class="stat-pill stat-pill-dim">{{ stat.displayCount }} 待审</span>
          <span v-if="stat.failCount > 0" class="stat-pill stat-pill-fail">{{ stat.failCount }} 失败</span>
        </div>

        <!-- Trace 汇总（local 模式有数据时显示） -->
        <div v-if="stat.hasTrace" class="stat-trace">
          <span class="stat-trace-item" title="平均 LLM 调用轮次">
            <span class="stat-trace-icon">⟳</span>{{ stat.avgTurns }} 轮
          </span>
          <span class="stat-trace-item" title="平均工具调用次数">
            <span class="stat-trace-icon">⚙</span>{{ stat.avgTools }} 工具
          </span>
          <span v-if="stat.totalErrors > 0" class="stat-trace-item stat-trace-err" title="工具报错总次数">
            <span class="stat-trace-icon">!</span>{{ stat.totalErrors }} 报错
          </span>
        </div>
      </div>
    </div>

    <!-- ── 二、图表区（3 图） ── -->
    <div class="chart-row">
      <div ref="passRateChartEl" class="chart-box" />
      <div ref="durationChartEl" class="chart-box" />
      <div v-if="hasTrace" ref="turnsChartEl" class="chart-box" />
    </div>

    <!-- ── 三、失败原因汇总 ── -->
    <template v-if="allFailReasons.length > 0">
      <div class="section-title">失败原因汇总</div>
      <div class="fail-summary">
        <div
          v-for="item in allFailReasons"
          :key="item.key"
          class="fail-summary-row"
        >
          <span class="fail-summary-id">{{ item.caseId }}</span>
          <span class="fail-summary-model">{{ item.modelId }}</span>
          <span class="fail-summary-reasons">
            <span v-for="r in item.reasons" :key="r" class="fail-summary-reason">{{ r }}</span>
          </span>
        </div>
      </div>
    </template>

    <!-- ── 四、待审用例提示 ── -->
    <template v-if="displayCases.length > 0">
      <div class="section-title" style="margin-top:12px">待人工审核用例</div>
      <div class="display-list">
        <div v-for="c in displayCases" :key="c.id" class="display-item">
          <span class="tc-id">{{ c.id }}</span>
          <span class="tc-title">{{ c.title }}</span>
          <span class="display-badge">DISPLAY</span>
        </div>
      </div>
    </template>

    <!-- ── 五、用例对比表 ── -->
    <div class="section-title" style="margin-top:16px">用例对比</div>
    <el-table
      :data="tableRows"
      size="small"
      border
      style="width:100%"
      :row-class-name="rowClass"
    >
      <el-table-column label="用例" min-width="160" fixed>
        <template #default="{ row }">
          <div class="tc-cell">
            <span class="tc-id">{{ row.caseId }}</span>
            <span class="tc-title">{{ row.caseTitle }}</span>
            <el-tag v-if="row.stepCount" size="small" effect="plain" style="margin-left:4px;font-size:10px">
              {{ row.stepCount }}步
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        v-for="modelId in report.modelIds"
        :key="modelId"
        :label="modelId"
        min-width="140"
      >
        <template #default="{ row }">
          <CellResult :result="row.cells[modelId]" />
        </template>
      </el-table-column>
    </el-table>

    <!-- ── 六、回复详情 ── -->
    <div class="section-title" style="margin-top:16px">回复详情</div>
    <el-collapse class="reply-collapse">
      <el-collapse-item
        v-for="c in report.cases"
        :key="c.id"
        :name="c.id"
      >
        <template #title>
          <span class="tc-id">{{ c.id }}</span>
          <span class="tc-title">{{ c.title }}</span>
          <el-tag v-if="c.stepCount" size="small" effect="plain" style="margin:0 6px;font-size:10px">{{ c.stepCount }}步</el-tag>
          <span class="tc-instruction">{{ c.instruction }}</span>
        </template>

        <div class="reply-grid">
          <div v-for="modelId in report.modelIds" :key="modelId" class="reply-col">
            <div class="reply-model-label">{{ modelId }}</div>

            <!-- 多步：按步骤展示 -->
            <template v-if="getResult(c.id, modelId)?.steps?.length">
              <div
                v-for="step in getResult(c.id, modelId)!.steps"
                :key="step.stepIndex"
                class="step-result-block"
              >
                <div class="step-result-header">
                  <span class="step-label">步骤 {{ step.stepIndex }}</span>
                  <span class="step-verdict" :class="verdictClass(step.verdict)">{{ step.verdict }}</span>
                </div>
                <div class="step-instruction">{{ step.instruction }}</div>
                <ReplyBlock :result="stepAsResult(step, modelId)" />
              </div>
              <!-- 多步用例的 trace 在最后整体展示 -->
              <div v-if="getResult(c.id, modelId)?.trace" class="multistep-trace">
                <span class="multistep-trace-label">整体 Trace</span>
                <ReplyBlock :result="traceOnlyResult(getResult(c.id, modelId)!)" />
              </div>
            </template>

            <!-- 单步 -->
            <ReplyBlock v-else :result="getResult(c.id, modelId)" />
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import type { EvalReport, CaseModelResult, StepResult } from '../types'
import CellResult from './CellResult.vue'
import ReplyBlock from './ReplyBlock.vue'

const props = defineProps<{ report: EvalReport }>()

// ── 计算：模型级统计 ──────────────────────────────────────────

const modelStats = computed(() => {
  return props.report.modelIds.map((modelId) => {
    const results = props.report.results.filter((r) => r.modelId === modelId)
    const judged  = results.filter((r) => r.verdict !== 'DISPLAY')
    const passed  = judged.filter((r) => r.verdict === 'PASS').length
    const failed  = judged.filter((r) => r.verdict === 'FAIL').length
    const display = results.filter((r) => r.verdict === 'DISPLAY').length
    const totalMs = results.reduce((s, r) => s + r.call.durationMs, 0)

    // Trace 汇总
    const traced = results.filter((r) => r.trace)
    const hasTrace = traced.length > 0
    const avgTurns = hasTrace
      ? (traced.reduce((s, r) => s + (r.trace?.llmTurns ?? 0), 0) / traced.length).toFixed(1)
      : '0'
    const avgTools = hasTrace
      ? (traced.reduce((s, r) => s + (r.trace?.toolCalls ?? 0), 0) / traced.length).toFixed(1)
      : '0'
    const totalErrors = traced.reduce((s, r) => s + (r.trace?.toolErrors ?? 0), 0)

    return {
      modelId,
      passed,
      failCount: failed,
      displayCount: display,
      judged: judged.length,
      passRate: judged.length > 0 ? passed / judged.length : 0,
      avgDur: results.length > 0 ? (totalMs / results.length / 1000).toFixed(1) : '-',
      hasTrace,
      avgTurns,
      avgTools,
      totalErrors,
    }
  })
})

// 是否有任何 trace 数据（决定是否渲染第三张图）
const hasTrace = computed(() =>
  props.report.results.some((r) => r.trace),
)

// ── 计算：失败原因汇总 ─────────────────────────────────────────

const allFailReasons = computed(() => {
  return props.report.results
    .filter((r) => r.verdict === 'FAIL' && r.failReasons.length > 0)
    .map((r) => ({
      key: `${r.caseId}-${r.modelId}`,
      caseId: r.caseId,
      modelId: r.modelId,
      reasons: r.failReasons,
    }))
})

// ── 计算：待审用例列表 ─────────────────────────────────────────

const displayCases = computed(() => {
  // 只列出所有模型结果都是 DISPLAY 的用例（没有任何模型能判定它）
  return props.report.cases.filter((c) => {
    const results = props.report.results.filter((r) => r.caseId === c.id)
    return results.length > 0 && results.every((r) => r.verdict === 'DISPLAY')
  })
})

// ── 计算：对比表行数据 ─────────────────────────────────────────

const tableRows = computed(() => {
  return props.report.cases.map((c) => {
    const cells: Record<string, CaseModelResult | undefined> = {}
    for (const modelId of props.report.modelIds) {
      cells[modelId] = props.report.results.find(
        (r) => r.caseId === c.id && r.modelId === modelId,
      )
    }
    return { caseId: c.id, caseTitle: c.title, stepCount: c.stepCount, cells }
  })
})

// ── helpers ───────────────────────────────────────────────────

function getResult(caseId: string, modelId: string): CaseModelResult | undefined {
  return props.report.results.find((r) => r.caseId === caseId && r.modelId === modelId)
}

function stepAsResult(step: StepResult, modelId: string): CaseModelResult {
  return {
    caseId: '',
    caseTitle: step.instruction,
    modelId,
    call: step.call,
    verdict: step.verdict,
    failReasons: step.failReasons,
  }
}

/** 多步用例：构造只含 trace 的 result，用于在步骤展示后单独展示 trace 块 */
function traceOnlyResult(r: CaseModelResult): CaseModelResult {
  return {
    ...r,
    // 不展示回复文本和判定，只让 ReplyBlock 渲染 trace 块
    call: { ...r.call, output: '', success: true },
    verdict: 'DISPLAY',
    failReasons: [],
    steps: undefined,
  }
}

function rowClass({ row }: { row: { cells: Record<string, CaseModelResult | undefined> } }) {
  const hasFail = Object.values(row.cells).some((r) => r?.verdict === 'FAIL')
  return hasFail ? 'row-fail' : ''
}

function statCardClass(stat: typeof modelStats.value[0]) {
  if (stat.judged === 0) return 'status-no-judge'
  if (stat.passRate >= 1) return 'status-all-pass'
  if (stat.passed === 0) return 'status-all-fail'
  return 'status-partial'
}

function verdictClass(v: string) {
  if (v === 'PASS') return 'vpass'
  if (v === 'FAIL') return 'vfail'
  return 'vdisp'
}

function formatTime(iso: string) {
  return iso.replace('T', ' ').slice(0, 16)
}

// ── ECharts ───────────────────────────────────────────────────

const passRateChartEl = ref<HTMLElement | null>(null)
const durationChartEl = ref<HTMLElement | null>(null)
const turnsChartEl    = ref<HTMLElement | null>(null)

let passChart:  echarts.ECharts | null = null
let durChart:   echarts.ECharts | null = null
let turnsChart: echarts.ECharts | null = null

const COLORS = ['#00c8d4', '#f5a623', '#3a82c4', '#e04a4a', '#3fc87a', '#8b5cf6']

const CT = {
  text:      '#7e8fa0',
  heading:   '#e8edf2',
  axisLine:  'rgba(255,255,255,0.10)',
  splitLine: 'rgba(255,255,255,0.06)',
  tipBg:     '#1c2026',
  tipBorder: 'rgba(0,200,212,0.4)',
  tipText:   '#d4dce6',
}

function makeBarOption(title: string, labels: string[], values: (string | number)[], fmt: string) {
  return {
    backgroundColor: 'transparent',
    title: { text: title, textStyle: { color: CT.heading, fontSize: 11 } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: CT.tipBg,
      borderColor: CT.tipBorder,
      textStyle: { color: CT.tipText, fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { color: CT.text, fontSize: 10, rotate: labels.some(l => l.length > 12) ? 12 : 0,
        formatter: (v: string) => v.length > 20 ? v.slice(v.lastIndexOf('/') + 1) : v },
      axisLine: { lineStyle: { color: CT.axisLine } },
      axisTick: { lineStyle: { color: CT.axisLine } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: CT.text, formatter: fmt === '%' ? '{value}%' : `{value}${fmt}` },
      axisLine: { lineStyle: { color: CT.axisLine } },
      splitLine: { lineStyle: { color: CT.splitLine } },
      ...(fmt === '%' ? { max: 100 } : {}),
    },
    series: [{
      type: 'bar',
      data: values,
      barMaxWidth: 36,
      itemStyle: {
        color: (p: { dataIndex: number }) => COLORS[p.dataIndex % COLORS.length],
        borderRadius: [2, 2, 0, 0],
      },
      label: {
        show: true,
        position: 'top',
        color: CT.text,
        fontSize: 10,
        formatter: fmt === '%' ? '{c}%' : `{c}${fmt}`,
      },
    }],
    grid: { top: 36, bottom: 44, left: 40, right: 10 },
  }
}

function initCharts() {
  const stats  = modelStats.value
  const labels = stats.map((s) => s.modelId)

  if (passRateChartEl.value) {
    passChart?.dispose()
    passChart = echarts.init(passRateChartEl.value, null, { renderer: 'canvas' })
    passChart.setOption(makeBarOption(
      '判定通过率',
      labels,
      stats.map((s) => Math.round(s.passRate * 100)),
      '%',
    ))
  }

  if (durationChartEl.value) {
    durChart?.dispose()
    durChart = echarts.init(durationChartEl.value, null, { renderer: 'canvas' })
    durChart.setOption(makeBarOption(
      '平均耗时（秒）',
      labels,
      stats.map((s) => s.avgDur),
      's',
    ))
  }

  if (turnsChartEl.value && hasTrace.value) {
    turnsChart?.dispose()
    turnsChart = echarts.init(turnsChartEl.value, null, { renderer: 'canvas' })
    turnsChart.setOption(makeBarOption(
      '平均 LLM 轮次',
      labels,
      stats.map((s) => s.avgTurns),
      '',
    ))
  }
}

onMounted(async () => { await nextTick(); initCharts() })
watch(() => props.report, async () => { await nextTick(); initCharts() }, { deep: false })
</script>

<style scoped>
/* ── 整体容器 ────────────────────────────────────────────────── */
.result-dashboard {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── 头部 ────────────────────────────────────────────────────── */
.dashboard-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-card);
}

.dashboard-title {
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--accent-cyan);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.header-time {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

.header-meta {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
}

/* ── 统计卡片 ────────────────────────────────────────────────── */
.stat-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-card);
  padding: 12px 14px;
  min-width: 140px;
  flex: 1;
  box-shadow: var(--shadow-card);
  border-top: 2px solid transparent;
  transition: border-color var(--transition-base);
}

.stat-card.status-all-pass  { border-top-color: var(--status-pass); }
.stat-card.status-partial   { border-top-color: var(--warn-amber); }
.stat-card.status-all-fail  { border-top-color: var(--status-fail); }
.stat-card.status-no-judge  { border-top-color: var(--text-muted); }

.stat-model {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-pass {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.stat-num {
  font-family: var(--font-mono);
  font-size: var(--fs-2xl);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.stat-rate {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--text-secondary);
}

.stat-label {
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.stat-secondary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.stat-pill {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-secondary);
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
}

.stat-pill-fail {
  color: var(--status-fail);
  background: rgba(224,74,74,0.08);
  border-color: rgba(224,74,74,0.2);
}

.stat-pill-dim {
  color: var(--text-muted);
}

/* Trace 汇总 */
.stat-trace {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 6px;
  border-top: 1px solid var(--border-base);
}

.stat-trace-item {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 3px;
}

.stat-trace-icon {
  font-size: 9px;
  opacity: 0.8;
}

.stat-trace-err {
  color: var(--status-fail);
}

/* ── 图表区 ──────────────────────────────────────────────────── */
.chart-row {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.chart-box {
  flex: 1;
  height: 170px;
}

/* ── Section 标题 ────────────────────────────────────────────── */
.section-title {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.10em;
  color: var(--text-secondary);
  margin-bottom: 8px;
  padding-left: 2px;
  border-left: 2px solid var(--accent-cyan);
  padding-left: 8px;
}

/* ── 失败原因汇总 ─────────────────────────────────────────────── */
.fail-summary {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 4px;
  background: rgba(224,74,74,0.04);
  border: 1px solid rgba(224,74,74,0.15);
  border-radius: var(--radius-card);
  padding: 8px 12px;
}

.fail-summary-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.fail-summary-row:last-child {
  border-bottom: none;
}

.fail-summary-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent-cyan);
  font-weight: 600;
  flex-shrink: 0;
  min-width: 24px;
}

.fail-summary-model {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
  min-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fail-summary-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.fail-summary-reason {
  font-size: 11px;
  color: var(--status-fail);
  background: rgba(224,74,74,0.08);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  line-height: 1.5;
}

/* ── 待审用例列表 ─────────────────────────────────────────────── */
.display-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 4px;
}

.display-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-base);
}

.display-badge {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  color: var(--text-muted);
  background: rgba(255,255,255,0.06);
  border: 1px dashed var(--text-muted);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
  letter-spacing: 0.06em;
  margin-left: auto;
}

/* ── 对比表 ──────────────────────────────────────────────────── */
.tc-cell {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}

.tc-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent-cyan);
  font-weight: 600;
  margin-right: 4px;
}

.tc-title {
  font-size: 12px;
  color: var(--text-primary);
}

.tc-instruction {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 4px;
}

/* ── 回复详情折叠区 ──────────────────────────────────────────── */
.reply-collapse {
  background: var(--bg-root);
}

.reply-grid {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 6px 0 2px 12px;
  border-left: 2px solid var(--border-panel);
}

.reply-col {
  flex: 1;
  min-width: 220px;
}

.reply-model-label {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  margin-bottom: 5px;
}

/* ── 步骤结果块 ──────────────────────────────────────────────── */
.step-result-block {
  border-left: 2px solid var(--border-panel);
  padding-left: 8px;
  margin-bottom: 10px;
}

.step-result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
}

.step-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent-cyan);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.step-verdict {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  border-radius: var(--radius-sm);
  padding: 1px 5px;
}

.step-verdict.vpass { color: var(--status-pass); background: rgba(63,200,122,0.10); }
.step-verdict.vfail { color: var(--status-fail); background: rgba(224,74,74,0.10); }
.step-verdict.vdisp { color: var(--text-muted);  background: rgba(255,255,255,0.05); }

.step-instruction {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
  font-style: italic;
}

/* 多步 trace 整体展示区 */
.multistep-trace {
  border-top: 1px solid var(--border-base);
  padding-top: 6px;
  margin-top: 4px;
}

.multistep-trace-label {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  display: block;
  margin-bottom: 4px;
}
</style>
