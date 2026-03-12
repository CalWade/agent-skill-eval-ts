<template>
  <div v-if="running" class="progress-bar-wrapper">
    <div class="progress-track">
      <div class="progress-fill" :style="{ width: progress + '%' }" />
    </div>
    <div class="progress-meta">
      <span class="progress-pct">{{ progress }}%</span>
      <span class="progress-elapsed">{{ elapsedStr }} ELAPSED</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, computed } from 'vue'

const props = defineProps<{
  progress: number
  running: boolean
}>()

// ── Elapsed timer ──────────────────────────────────────────────

const elapsedSec = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

function startTimer() {
  elapsedSec.value = 0
  timer = setInterval(() => { elapsedSec.value++ }, 1000)
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

watch(() => props.running, (val) => {
  if (val) startTimer()
  else stopTimer()
}, { immediate: true })

onUnmounted(stopTimer)

const elapsedStr = computed(() => {
  const h = Math.floor(elapsedSec.value / 3600)
  const m = Math.floor((elapsedSec.value % 3600) / 60)
  const s = elapsedSec.value % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
})
</script>

<style scoped>
.progress-bar-wrapper {
  flex-shrink: 0;
  padding: 8px 12px 10px;
  background: var(--bg-header);
  border-top: 1px solid var(--border-panel);
}

.progress-track {
  width: 100%;
  height: 4px;
  background: var(--bg-card);
  border-radius: var(--radius-none);
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: var(--warn-amber);
  border-radius: var(--radius-none);
  transition: width 0.4s ease-out;
  box-shadow: 0 0 8px rgba(245,166,35,0.5);
  position: relative;
}

/* Animated scanner line */
.progress-fill::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  width: 20px;
  height: 100%;
  background: linear-gradient(to right, transparent, rgba(255,255,255,0.4));
  animation: scan 1s linear infinite;
}

@keyframes scan {
  from { opacity: 1; }
  to   { opacity: 0.3; }
}

.progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 5px;
}

.progress-pct {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--warn-amber);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}

.progress-elapsed {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
}
</style>