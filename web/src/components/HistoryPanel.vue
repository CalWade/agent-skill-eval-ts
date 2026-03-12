<template>
  <el-card>
    <template #header>历史报告</template>
    <div v-if="reports.length === 0" class="empty-state">
      NO HISTORY
    </div>
    <div class="report-list">
      <div
        v-for="file in reports"
        :key="file"
        class="report-item"
        :class="{ active: selected === file }"
        @click="load(file)"
      >
        <div class="report-name">{{ file }}</div>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getReports, getReport } from '../api'
import type { EvalReport } from '../types'

const emit = defineEmits<{ view: [EvalReport] }>()
const reports = ref<string[]>([])
const selected = ref('')

onMounted(async () => {
  reports.value = await getReports()
})

async function load(file: string) {
  selected.value = file
  try {
    const report = await getReport(file)
    emit('view', report)
  } catch (e) {
    ElMessage.error(String(e))
  }
}
</script>

<style scoped>
.empty-state {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm, 12px);
  color: var(--text-muted, #555);
  text-transform: uppercase;
  text-align: center;
  padding: 16px;
  letter-spacing: 0.08em;
}

.report-list {
  display: flex;
  flex-direction: column;
}

.report-item {
  padding: 8px 10px;
  cursor: pointer;
  background: transparent;
  border-bottom: 1px solid var(--border-base, #2a2d3e);
  border-left: 2px solid transparent;
  color: var(--text-secondary, #888);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.report-item:hover {
  background: rgba(0, 200, 212, 0.05);
  color: var(--text-primary, #e0e0e0);
  border-left: 2px solid var(--accent-cyan-dim, #4db6be);
}

.report-item.active {
  background: rgba(0, 200, 212, 0.08);
  border-left: 3px solid var(--accent-cyan, #00c8d4);
  color: var(--accent-cyan, #00c8d4);
}

.report-name {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm, 12px);
}
</style>
