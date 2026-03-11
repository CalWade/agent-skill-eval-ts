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
      <div v-for="r in result.failReasons" :key="r" class="fail-reason">⚠ {{ r }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CaseModelResult } from '../types'
defineProps<{ result?: CaseModelResult }>()
</script>

<style scoped>
.reply-empty { color: #444; font-size: 12px; }
.reply-wrap { background: #0a0c14; border-radius: 6px; padding: 8px 10px; }
.reply-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.verdict-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; font-weight: 600; }
.verdict-tag.pass { background: #14532d; color: #4ade80; }
.verdict-tag.fail { background: #450a0a; color: #f87171; }
.verdict-tag.display { background: #1e3a5f; color: #60a5fa; }
.meta-dur, .meta-tok { font-size: 11px; color: #555; }
.reply-text { font-size: 12px; color: #bbb; line-height: 1.6; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; }
.reply-error { font-size: 12px; color: #f87171; }
.fail-reasons { margin-top: 6px; }
.fail-reason { font-size: 11px; color: #fb923c; }
</style>
