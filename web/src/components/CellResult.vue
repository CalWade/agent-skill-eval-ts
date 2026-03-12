<template>
  <div v-if="!result" class="cell-empty">-</div>
  <div v-else class="cell">
    <span class="cell-verdict" :class="result.verdict.toLowerCase()">
      {{ verdictIcon }}
    </span>
    <span class="cell-dur">{{ (result.call.durationMs / 1000).toFixed(1) }}s</span>
    <span v-if="result.call.totalTokens" class="cell-tok">{{ result.call.totalTokens }}t</span>
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
.cell {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.cell-empty {
  color: var(--text-muted, #444);
}
.cell-verdict {
  font-size: 12px;
  font-family: var(--font-mono, monospace);
  padding: 2px 4px;
  border-radius: var(--radius-sm, 3px);
}
.cell-verdict.pass {
  color: var(--status-pass, #3fc87a);
  background: var(--status-pass-dim, rgba(63,200,122,0.12));
}
.cell-verdict.fail {
  color: var(--status-fail, #e04a4a);
  background: var(--status-fail-dim, rgba(224,74,74,0.12));
}
.cell-verdict.display {
  color: var(--status-skip, #6b7280);
  background: transparent;
}
.cell-dur {
  font-family: var(--font-mono, monospace);
  color: var(--text-secondary, #888);
  font-size: var(--fs-xs, 11px);
}
.cell-tok {
  font-family: var(--font-mono, monospace);
  color: var(--text-muted, #555);
  font-size: var(--fs-xs, 11px);
  font-variant-numeric: tabular-nums;
}
</style>
