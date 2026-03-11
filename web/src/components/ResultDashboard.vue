<template>
  <el-card>
    <template #header>
      <div style="display:flex;align-items:center;gap:8px">
        <span>汇总大屏</span>
        <el-tag size="small" effect="plain">{{ report.skill }}</el-tag>
        <span style="font-size:11px;color:#555;margin-left:4px">{{ formatTime(report.timestamp) }}</span>
      </div>
    </template>

    <!-- 统计卡片 -->
    <div class="stat-row">
      <div v-for="stat in modelStats" :key="stat.modelId" class="stat-card">
        <div class="stat-model">{{ stat.modelId }}</div>
        <div class="stat-pass" :class="stat.passRate >= 1 ? 'all-pass' : 'partial'">
          {{ stat.passed }}/{{ stat.judged }}
          <span class="stat-rate">{{ stat.judged > 0 ? Math.round(stat.passRate * 100) + '%' : '-' }}</span>
        </div>
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
    <el-collapse>
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
  </el-card>
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

const DARK = {
  bg: '#0f1117', textColor: '#888',
  colors: ['#a78bfa', '#60a5fa', '#4ade80', '#fb923c', '#f472b6'],
}

function initCharts() {
  if (!passRateChartEl.value || !durationChartEl.value) return

  const stats = modelStats.value

  // 通过率图
  passChart?.dispose()
  passChart = echarts.init(passRateChartEl.value, null, { renderer: 'canvas' })
  passChart.setOption({
    backgroundColor: DARK.bg,
    title: { text: '判定通过率', textStyle: { color: DARK.textColor, fontSize: 12 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: stats.map((s) => s.modelId), axisLabel: { color: DARK.textColor, fontSize: 11, rotate: 15 } },
    yAxis: { type: 'value', max: 100, axisLabel: { color: DARK.textColor, formatter: '{value}%' } },
    series: [{
      type: 'bar', data: stats.map((s) => Math.round(s.passRate * 100)),
      itemStyle: { color: (p: { dataIndex: number }) => DARK.colors[p.dataIndex % DARK.colors.length] },
      label: { show: true, position: 'top', color: '#ccc', formatter: '{c}%' },
    }],
    grid: { top: 36, bottom: 40, left: 40, right: 10 },
  })

  // 平均耗时图
  durChart?.dispose()
  durChart = echarts.init(durationChartEl.value, null, { renderer: 'canvas' })
  durChart.setOption({
    backgroundColor: DARK.bg,
    title: { text: '平均耗时（秒）', textStyle: { color: DARK.textColor, fontSize: 12 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: stats.map((s) => s.modelId), axisLabel: { color: DARK.textColor, fontSize: 11, rotate: 15 } },
    yAxis: { type: 'value', axisLabel: { color: DARK.textColor, formatter: '{value}s' } },
    series: [{
      type: 'bar', data: stats.map((s) => s.avgDur),
      itemStyle: { color: (p: { dataIndex: number }) => DARK.colors[p.dataIndex % DARK.colors.length] },
      label: { show: true, position: 'top', color: '#ccc', formatter: '{c}s' },
    }],
    grid: { top: 36, bottom: 40, left: 44, right: 10 },
  })
}

onMounted(async () => { await nextTick(); initCharts() })
watch(() => props.report, async () => { await nextTick(); initCharts() })
</script>

<style scoped>
.stat-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.stat-card {
  background: #0f1117; border: 1px solid #2a2d3e; border-radius: 8px;
  padding: 10px 14px; min-width: 120px; flex: 1;
}
.stat-model { font-size: 11px; color: #888; margin-bottom: 4px; }
.stat-pass { font-size: 20px; font-weight: 700; }
.stat-pass.all-pass { color: #4ade80; }
.stat-pass.partial { color: #fb923c; }
.stat-rate { font-size: 13px; margin-left: 4px; }
.stat-meta { font-size: 11px; color: #555; margin-top: 2px; }

.chart-row { display: flex; gap: 12px; margin-bottom: 16px; }
.chart-box { flex: 1; height: 180px; }

.section-title { font-size: 12px; color: #888; margin-bottom: 8px; }

.tc-id { font-size: 11px; color: #a78bfa; font-family: monospace; margin-right: 6px; }
.tc-title { font-size: 13px; color: #e0e0e0; margin-right: 8px; }
.tc-instruction { font-size: 12px; color: #555; }

.reply-grid { display: flex; gap: 12px; flex-wrap: wrap; padding: 4px 0; }
.reply-block { flex: 1; min-width: 200px; }
.reply-model { font-size: 11px; color: #a78bfa; margin-bottom: 4px; font-weight: 600; }
</style>

<style>
.el-table { --el-table-bg-color: #1a1d27; --el-table-tr-bg-color: #1a1d27; --el-table-header-bg-color: #0f1117; --el-table-border-color: #2a2d3e; --el-table-text-color: #ccc; --el-table-header-text-color: #888; }
.row-fail td { background: #2a1a1a !important; }
</style>
