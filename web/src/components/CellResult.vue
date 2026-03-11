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
  if (props.result.verdict === 'PASS') return '✅'
  if (props.result.verdict === 'FAIL') return '❌'
  return '📋'
})
</script>

<style scoped>
.cell { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.cell-empty { color: #444; }
.cell-verdict { font-size: 14px; }
.cell-dur { color: #888; }
.cell-tok { color: #555; font-size: 11px; }
</style>
