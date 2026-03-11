<template>
  <el-card>
    <template #header>历史报告</template>
    <div v-if="reports.length === 0" style="color:#555;font-size:13px;text-align:center;padding:16px">
      暂无历史报告
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
.report-list { display: flex; flex-direction: column; gap: 4px; }
.report-item {
  padding: 8px 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid #2a2d3e; background: #0f1117;
  transition: all .15s;
}
.report-item:hover { border-color: #a78bfa44; }
.report-item.active { border-color: #a78bfa; background: #1a1430; }
.report-name { font-size: 12px; color: #888; font-family: monospace; }
</style>
