<template>
  <div class="result-dashboard">
    <div class="dashboard-header">
      <span class="dashboard-title">汇总大屏</span>
      <el-tag size="small" effect="plain">{{ report.skill }}</el-tag>
      <span style="font-size:11px;color:var(--text-muted,#555);margin-left:4px">{{ formatTime(report.timestamp) }}</span>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-row">
      <div
        v-for="stat in modelStats"
        :key="stat.modelId"
        class="stat-card"
        :class="stat.passRate >= 1 ? 'status-all-pass' : stat.passed === 0 ? 'status-fail' : 'status-partial'"
      >
        <div class="stat-model">{{ stat.modelId }}</div>
        <div class="stat-pass">
          <span class="stat-num">{{ stat.passed }}/{{ stat.judged }}</span>
          <span class="stat-rate">{{ stat.judged > 0 ? Math.round(stat.passRate * 100) + '%' : '-' }}</span>
        </div>
        <div class="stat-label">PASS RATE</div>
        <div class="stat-meta">{{ stat.avgDur }}s 均耗时</div>
        <div v-if="stat.totalTok" class="stat-meta">{{ stat.totalTok }} tok</div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-row">
      <div ref="passRateChartEl" class="chart-box" />
      <div ref="durationChartEl" class="chart-box" />
    </div>

    <!-- 汇总对比表 -->
    <div class="section-title">用例对比</div>
    <el-table :data="tableRows" size="small" border style="width:100%" :row-class-name="rowClass">
      <el-table-column label="用例" width="180" fixed>
        <template #default="{ row }">
          <div>
            <span class="tc-id">{{ row.caseId }}</span>
            <span class="tc-title">{{ row.caseTitle }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column
        v-for="modelId in report.modelIds"
        :key="modelId"
        :label="modelId"
        min-width="130"
      >
        <template #default="{ row }">
          <CellResult :result="row.cells[modelId]" />
        </template>
      </el-table-column>
    </el-table>

    <!-- 回复详情 -->
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
          <span class="tc-instruction">{{ c.instruction }}</span>
        </template>
        <div class="reply-grid">
          <div v-for="modelId in report.modelIds" :key="modelId" class="reply-block">
            <div class="reply-model">{{ modelId }}</div>
            <ReplyBlock :result="getResult(c.id, modelId)" />
          </div>
        </div>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import type { EvalReport, CaseModelResult } from '../types'
import CellResult from './CellResult.vue'
import ReplyBlock from './ReplyBlock.vue'

const props = defineProps<{ report: EvalReport }>()

// 模型统计
const modelStats = computed(() => {
  return props.report.modelIds.map((modelId) => {
    const results = props.report.results.filter((r) => r.modelId === modelId)
    const judged = results.filter((r) => r.verdict !== 'DISPLAY')
    const passed = judged.filter((r) => r.verdict === 'PASS').length
    const totalMs = results.reduce((s, r) => s + r.call.durationMs, 0)
    const totalTok = results.reduce((s, r) => s + (r.call.totalTokens ?? 0), 0)
    return {
      modelId,
      passed,
      judged: judged.length,
      passRate: judged.length > 0 ? passed / judged.length : 0,
      avgDur: results.length > 0 ? (totalMs / results.length / 1000).toFixed(1) : '-',
      totalTok: totalTok > 0 ? totalTok : null,
    }
  })
})

// 对比表行数据
const tableRows = computed(() => {
  return props.report.cases.map((c) => {
    const cells: Record<string, CaseModelResult | undefined> = {}
    for (const modelId of props.report.modelIds) {
      cells[modelId] = props.report.results.find(
        (r) => r.caseId === c.id && r.modelId === modelId,
      )
    }
    return { caseId: c.id, caseTitle: c.title, cells }
  })
})

function getResult(caseId: string, modelId: string): CaseModelResult | undefined {
  return props.report.results.find((r) => r.caseId === caseId && r.modelId === modelId)
}

function rowClass({ row }: { row: { cells: Record<string, CaseModelResult | undefined> } }) {
  const hasFail = Object.values(row.cells).some((r) => r?.verdict === 'FAIL')
  return hasFail ? 'row-fail' : ''
}

function formatTime(iso: string) {
  return iso.replace('T', ' ').slice(0, 16)
}

// ECharts
const passRateChartEl = ref<HTMLElement | null>(null)
const durationChartEl = ref<HTMLElement | null>(null)
let passChart: echarts.ECharts | null = null
let durChart: echarts.ECharts | null = null

const SERIES_COLORS = ['#00c8d4', '#f5a623', '#3a82c4', '#e04a4a', '#3fc87a', '#8b5cf6']

const CHART_THEME = {
  textColor: 'var(--text-secondary, #888)',
  headingColor: 'var(--text-heading, #e0e0e0)',
  axisLineColor: 'rgba(255,255,255,0.10)',
  splitLineColor: 'rgba(255,255,255,0.06)',
  tooltipBg: 'var(--bg-card, #1a1d27)',
  tooltipBorder: 'rgba(0,200,212,0.4)',
  tooltipText: 'var(--text-primary, #d4d4d4)',
}

function initCharts() {
  if (!passRateChartEl.value || !durationChartEl.value) return

  const stats = modelStats.value

  // 通过率图
  passChart?.dispose()
  passChart = echarts.init(passRateChartEl.value, null, { renderer: 'canvas' })
  passChart.setOption({
    backgroundColor: 'transparent',
    title: {
      text: '判定通过率',
      textStyle: { color: CHART_THEME.headingColor, fontSize: 12 },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: CHART_THEME.tooltipBg,
      borderColor: CHART_THEME.tooltipBorder,
      textStyle: { color: CHART_THEME.tooltipText },
    },
    xAxis: {
      type: 'category',
      data: stats.map((s) => s.modelId),
      axisLabel: { color: CHART_THEME.textColor, fontSize: 11, rotate: 15 },
      axisLine: { lineStyle: { color: CHART_THEME.axisLineColor } },
      axisTick: { lineStyle: { color: CHART_THEME.axisLineColor } },
    },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { color: CHART_THEME.textColor, formatter: '{value}%' },
      axisLine: { lineStyle: { color: CHART_THEME.axisLineColor } },
      splitLine: { lineStyle: { color: CHART_THEME.splitLineColor } },
    },
    series: [{
      type: 'bar',
      data: stats.map((s) => Math.round(s.passRate * 100)),
      barMaxWidth: 40,
      itemStyle: {
        color: (p: { dataIndex: number }) => SERIES_COLORS[p.dataIndex % SERIES_COLORS.length],
        borderRadius: [2, 2, 0, 0],
      },
      label: { show: true, position: 'top', color: CHART_THEME.textColor, formatter: '{c}%' },
    }],
    grid: { top: 36, bottom: 40, left: 40, right: 10 },
  })

  // 平均耗时图
  durChart?.dispose()
  durChart = echarts.init(durationChartEl.value, null, { renderer: 'canvas' })
  durChart.setOption({
    backgroundColor: 'transparent',
    title: {
      text: '平均耗时（秒）',
      textStyle: { color: CHART_THEME.headingColor, fontSize: 12 },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: CHART_THEME.tooltipBg,
      borderColor: CHART_THEME.tooltipBorder,
      textStyle: { color: CHART_THEME.tooltipText },
    },
    xAxis: {
      type: 'category',
      data: stats.map((s) => s.modelId),
      axisLabel: { color: CHART_THEME.textColor, fontSize: 11, rotate: 15 },
      axisLine: { lineStyle: { color: CHART_THEME.axisLineColor } },
      axisTick: { lineStyle: { color: CHART_THEME.axisLineColor } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: CHART_THEME.textColor, formatter: '{value}s' },
      axisLine: { lineStyle: { color: CHART_THEME.axisLineColor } },
      splitLine: { lineStyle: { color: CHART_THEME.splitLineColor } },
    },
    series: [{
      type: 'bar',
      data: stats.map((s) => s.avgDur),
      barMaxWidth: 40,
      itemStyle: {
        color: (p: { dataIndex: number }) => SERIES_COLORS[p.dataIndex % SERIES_COLORS.length],
        borderRadius: [2, 2, 0, 0],
      },
      label: { show: true, position: 'top', color: CHART_THEME.textColor, formatter: '{c}s' },
    }],
    grid: { top: 36, bottom: 40, left: 44, right: 10 },
  })
}

onMounted(async () => { await nextTick(); initCharts() })
watch(() => props.report, async () => { await nextTick(); initCharts() })
</script>

<style scoped>
/* ── Dashboard wrapper ── */
.result-dashboard {
  /* fills zone-c which already has padding */
}

.dashboard-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
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

/* ── 统计卡片 ── */
.stat-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.stat-card {
  background: var(--bg-card, #1a1d27);
  border: 1px solid var(--border-card, #2a2d3e);
  border-radius: var(--radius-card, 8px);
  padding: 10px 14px;
  min-width: 120px;
  flex: 1;
  box-shadow: var(--shadow-card, 0 2px 8px rgba(0,0,0,0.3));
  border-top: 2px solid transparent;
  transition: border-color 0.15s;
}
.stat-card:hover {
  border-color: rgba(255,255,255,0.15);
}
.stat-card.status-all-pass  { border-top-color: var(--status-pass, #3fc87a); }
.stat-card.status-partial   { border-top-color: var(--warn-amber, #f5a623); }
.stat-card.status-fail      { border-top-color: var(--status-fail, #e04a4a); }

.stat-model {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm, 12px);
  color: var(--text-secondary, #888);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stat-pass {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.stat-num {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-2xl, 22px);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary, #d4d4d4);
}
.stat-rate {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm, 12px);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary, #888);
}
.stat-label {
  font-size: var(--fs-xs, 10px);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary, #888);
  margin-bottom: 4px;
}
.stat-meta {
  font-size: var(--fs-xs, 11px);
  color: var(--text-muted, #555);
  margin-top: 2px;
}

/* ── 图表 ── */
.chart-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}
.chart-box {
  flex: 1;
  height: 180px;
  background: transparent;
}

/* ── Section 标题 ── */
.section-title {
  font-size: var(--fs-sm, 12px);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary, #888);
  margin-bottom: 8px;
}

/* ── 表格内容 ── */
.tc-id {
  font-size: 11px;
  color: var(--accent-cyan, #00c8d4);
  font-family: var(--font-mono, monospace);
  margin-right: 6px;
}
.tc-title {
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
  margin-right: 8px;
}
.tc-instruction {
  font-size: 12px;
  color: var(--text-muted, #555);
}

/* ── 回复折叠区 ── */
.reply-collapse {
  background: var(--bg-root, #0a0c14);
}
.reply-grid {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 4px 0;
  border-left: 3px solid var(--border-panel, rgba(255,255,255,0.08));
  padding-left: 12px;
}
.reply-block {
  flex: 1;
  min-width: 200px;
}
.reply-model {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-xs, 11px);
  color: var(--text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
  font-weight: 600;
}
</style>


