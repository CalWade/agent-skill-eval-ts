<template>
  <div class="livelog-wrap">
  <el-card class="livelog-card">
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
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useConfirm } from '../composables/useConfirm'

interface LogEntry { id: number; text: string; type: 'info' | 'success' | 'error' | 'muted' }

const props = defineProps<{ logs: LogEntry[]; running: boolean }>()
const emit = defineEmits<{ clear: [] }>()

const confirm = useConfirm()

const logEl = ref<HTMLElement | null>(null)

watch(() => props.logs.length, async () => {
  await nextTick()
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
})

async function clear() {
  if (props.logs.length === 0) return
  try {
    await confirm({
      title: '清空日志',
      message: '确认清空当前所有日志？',
      confirmText: '清空',
    })
  } catch {
    return
  }
  emit('clear')
}
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

/* Wrapper fills Zone B */
.livelog-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Card fills wrapper */
:deep(.livelog-card) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: 0 !important;
  border-left: none !important;
  border-right: none !important;
  border-top: none !important;
}

:deep(.livelog-card .el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 10px 12px !important;
}

/* Log container */
.log-container {
  flex: 1;
  min-height: 0;
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
