<template>
  <el-card style="flex:1">
    <template #header>
      <div class="log-header">
        <span class="log-title">[LIVE LOG]</span>
        <el-tag v-if="running" class="running-tag" size="small" effect="plain">RUNNING...</el-tag>
        <div style="flex:1" />
        <el-button size="small" text @click="clear">清空</el-button>
      </div>
    </template>
    <div ref="logEl" class="log-container">
      <div
        v-for="log in logs"
        :key="log.id"
        class="log-line"
        :class="log.type"
      >{{ log.text }}</div>
      <div v-if="logs.length === 0" class="log-empty">AWAITING TEST...</div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

interface LogEntry { id: number; text: string; type: 'info' | 'success' | 'error' | 'muted' }

const props = defineProps<{ logs: LogEntry[]; running: boolean }>()
const emit = defineEmits<{ clear: [] }>()

const logEl = ref<HTMLElement | null>(null)

watch(() => props.logs.length, async () => {
  await nextTick()
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
})

function clear() { emit('clear') }
</script>

<style scoped>
/* Header bar */
.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
}

.log-title {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--accent-cyan);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* Running tag - amber mono */
.running-tag {
  font-family: var(--font-mono) !important;
  font-size: var(--fs-xs) !important;
  font-weight: 700 !important;
  color: var(--warn-amber) !important;
  border-color: var(--warn-amber-dim) !important;
  background: rgba(245,166,35,0.08) !important;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Log container */
.log-container {
  height: 360px;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  line-height: 1.7;
  background: var(--bg-root);
  border-radius: var(--radius-base);
  padding: 10px 12px;
  /* Custom scrollbar */
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.12) var(--bg-root);
}

.log-container::-webkit-scrollbar { width: 6px; }
.log-container::-webkit-scrollbar-track { background: var(--bg-root); }
.log-container::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.12);
  border-radius: 3px;
}
.log-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.22);
}

/* Log lines */
.log-line { white-space: pre-wrap; word-break: break-all; }
.log-line.info    { color: var(--text-mono); }
.log-line.success { color: var(--status-pass); }
.log-line.error   { color: var(--status-fail); }
.log-line.muted   { color: var(--text-muted); }

/* Empty state */
.log-empty {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
</style>
