<template>
  <div v-if="!result" class="reply-empty">无数据</div>
  <div v-else class="reply-wrap">
    <div class="reply-meta">
      <span :class="['verdict-tag', result.verdict.toLowerCase()]">{{ result.verdict }}</span>
      <span class="meta-dur">{{ (result.call.durationMs / 1000).toFixed(1) }}s</span>
      <span v-if="result.call.totalTokens" class="meta-tok">{{ result.call.totalTokens }} tok</span>
    </div>
    <div v-if="!result.call.success" class="reply-error">{{ result.call.error }}</div>
    <div v-else class="reply-text">{{ result.call.output }}</div>
    <div v-if="result.failReasons.length" class="fail-reasons">
      <div v-for="r in result.failReasons" :key="r" class="fail-reason">▸ {{ r }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CaseModelResult } from '../types'
defineProps<{ result?: CaseModelResult }>()
</script>

<style scoped>
.reply-empty {
  color: var(--text-muted, #444);
  font-size: 12px;
}
.reply-wrap {
  border-radius: 6px;
  padding: 8px 10px;
}
.reply-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.verdict-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-sm, 3px);
  font-weight: 600;
  font-family: var(--font-mono, monospace);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.verdict-tag.pass {
  background: var(--status-pass-dim, rgba(63,200,122,0.12));
  color: var(--status-pass, #3fc87a);
}
.verdict-tag.fail {
  background: var(--status-fail-dim, rgba(224,74,74,0.12));
  color: var(--status-fail, #e04a4a);
}
.verdict-tag.display {
  background: transparent;
  color: var(--status-skip, #6b7280);
  border: 1px dashed var(--status-skip, #6b7280);
}
.meta-dur {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-xs, 11px);
  color: var(--text-secondary, #888);
}
.meta-tok {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-xs, 11px);
  color: var(--text-muted, #555);
  font-variant-numeric: tabular-nums;
}
.reply-text {
  background: var(--bg-root, #0a0c14);
  border: 1px solid var(--border-base, rgba(255,255,255,0.08));
  border-left: 3px solid var(--accent-cyan-dim, rgba(0,200,212,0.3));
  border-radius: 4px;
  padding: 8px 10px;
  font-size: var(--fs-sm, 12px);
  color: var(--text-primary, #d4d4d4);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}
.reply-error {
  font-size: 12px;
  color: var(--status-fail, #e04a4a);
  background: rgba(224,74,74,0.06);
  border-left: 3px solid var(--status-fail, #e04a4a);
  padding: 6px 10px;
  border-radius: 4px;
}
.fail-reasons {
  margin-top: 6px;
  background: rgba(224,74,74,0.06);
  border-left: 3px solid var(--status-fail, #e04a4a);
  border-radius: 4px;
  padding: 6px 10px;
}
.fail-reason {
  font-size: 11px;
  color: var(--status-fail, #e04a4a);
  line-height: 1.6;
}
</style>
