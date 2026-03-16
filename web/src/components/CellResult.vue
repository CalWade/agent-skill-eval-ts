<template>
  <div v-if="!result" class="cell-empty">-</div>
  <div v-else class="cell">

    <!-- 主行：verdict + 耗时 -->
    <div class="cell-main">
      <span class="cell-verdict" :class="result.verdict.toLowerCase()">
        {{ verdictIcon }}
      </span>
      <span class="cell-dur">{{ (result.call.durationMs / 1000).toFixed(1) }}s</span>
      <span v-if="result.call.totalTokens" class="cell-tok">{{ result.call.totalTokens }}t</span>
    </div>

    <!-- Trace 指标行 -->
    <div v-if="result.trace" class="cell-trace-row">
      <span class="cell-trace-pill">{{ result.trace.llmTurns }} 轮</span>
      <span class="cell-trace-pill">{{ result.trace.toolCalls }} 工具</span>
      <span v-if="result.trace.toolErrors > 0" class="cell-trace-pill cell-trace-err">
        {{ result.trace.toolErrors }} 报错
      </span>
    </div>

    <!-- 工具调用序列 -->
    <div v-if="result.trace?.toolCallSequence?.length" class="cell-seq">
      <span
        v-for="(name, i) in result.trace.toolCallSequence"
        :key="i"
        class="cell-seq-chip"
      >{{ name }}</span>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CaseModelResult } from '../types'

const props = defineProps<{ result?: CaseModelResult }>()

const verdictIcon = computed(() => {
  if (!props.result) return '-'
  if (props.result.verdict === 'PASS') return '✔'
  if (props.result.verdict === 'FAIL') return '✘'
  return '—'
})
</script>

<style scoped>
.cell-empty {
  color: var(--text-muted);
  font-size: var(--fs-xs);
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 0;
}

/* ── 主行 ── */
.cell-main {
  display: flex;
  align-items: center;
  gap: 5px;
}

.cell-verdict {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  font-weight: 700;
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}
.cell-verdict.pass    { color: var(--status-pass); background: rgba(63,200,122,0.12); }
.cell-verdict.fail    { color: var(--status-fail); background: rgba(224,74,74,0.12); }
.cell-verdict.display { color: var(--text-muted);  background: transparent; border: 1px dashed var(--text-muted); }

.cell-dur {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.cell-tok {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* ── Trace 指标行 ── */
.cell-trace-row {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.cell-trace-pill {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-secondary);
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-sm);
  padding: 0 5px;
  line-height: 18px;
}

.cell-trace-err {
  color: var(--status-fail);
  background: rgba(224,74,74,0.08);
  border-color: rgba(224,74,74,0.25);
}

/* ── 工具调用序列 ── */
.cell-seq {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.cell-seq-chip {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent-cyan);
  background: rgba(0,200,212,0.07);
  border: 1px solid rgba(0,200,212,0.18);
  border-radius: var(--radius-sm);
  padding: 0 4px;
  line-height: 16px;
  white-space: nowrap;
}
</style>
