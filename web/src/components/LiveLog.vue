<template>
  <el-card style="flex:1">
    <template #header>
      <div style="display:flex;align-items:center;gap:8px">
        <span>实时日志</span>
        <el-tag v-if="running" type="warning" size="small" effect="plain">运行中...</el-tag>
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
      <div v-if="logs.length === 0" class="log-empty">等待测试启动...</div>
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
.log-container {
  height: 360px; overflow-y: auto; font-family: 'JetBrains Mono', 'Menlo', monospace;
  font-size: 12px; line-height: 1.7; background: #0a0c14; border-radius: 6px;
  padding: 10px 12px;
}
.log-line { white-space: pre-wrap; word-break: break-all; }
.log-line.info { color: #c0c0c0; }
.log-line.success { color: #4ade80; }
.log-line.error { color: #f87171; }
.log-line.muted { color: #555; }
.log-empty { color: #444; font-style: italic; }
</style>
