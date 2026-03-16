<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div v-if="state?.visible" class="confirm-overlay" @mousedown.self="cancel">
        <div class="confirm-panel" role="dialog" :aria-modal="true">
          <!-- 顶部警告条 -->
          <div class="confirm-stripe" />

          <!-- 头部 -->
          <div class="confirm-header">
            <span class="confirm-icon">⚠</span>
            <span class="confirm-title">{{ state.options.title }}</span>
          </div>

          <!-- 消息 -->
          <div class="confirm-body">
            <p class="confirm-message">{{ state.options.message }}</p>
          </div>

          <!-- 操作区 -->
          <div class="confirm-footer">
            <button class="confirm-btn cancel" @click="cancel">
              {{ state.options.cancelText ?? '取消' }}
            </button>
            <button class="confirm-btn danger" @click="confirm">
              {{ state.options.confirmText ?? '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { _confirmState } from '../composables/useConfirm'

const state = _confirmState

function confirm() {
  state.value?.resolve(true)
}

function cancel() {
  state.value?.resolve(false)
}
</script>

<style scoped>
/* ── Overlay ───────────────────────────────────────────────── */
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}

/* ── Panel ─────────────────────────────────────────────────── */
.confirm-panel {
  width: 360px;
  background: var(--bg-card-raised, #1c2128);
  border: 1px solid var(--border-strong, rgba(255,255,255,0.20));
  border-top: none;
  border-radius: var(--radius-card, 4px);
  box-shadow:
    0 0 0 1px rgba(224, 74, 74, 0.20),
    0 8px 32px rgba(0, 0, 0, 0.7),
    0 2px 8px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ── 顶部红色警告条 ─────────────────────────────────────────── */
.confirm-stripe {
  height: 3px;
  background: var(--status-fail, #e04a4a);
  flex-shrink: 0;
}

/* ── Header ────────────────────────────────────────────────── */
.confirm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border-base, rgba(255,255,255,0.07));
}

.confirm-icon {
  font-size: 14px;
  color: var(--status-fail, #e04a4a);
  flex-shrink: 0;
  line-height: 1;
}

.confirm-title {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm, 12px);
  font-weight: 700;
  color: var(--text-heading, #e8edf2);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* ── Body ──────────────────────────────────────────────────── */
.confirm-body {
  padding: 16px 20px;
}

.confirm-message {
  font-size: var(--fs-base, 13px);
  color: var(--text-secondary, #7e8fa0);
  line-height: 1.6;
}

/* ── Footer ────────────────────────────────────────────────── */
.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border-base, rgba(255,255,255,0.07));
  background: var(--bg-card, #1c2026);
}

/* ── Buttons ───────────────────────────────────────────────── */
.confirm-btn {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-xs, 11px);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 7px 18px;
  border-radius: var(--radius-base, 3px);
  border: 1px solid;
  cursor: pointer;
  transition:
    background var(--transition-fast, 120ms ease-out),
    color var(--transition-fast, 120ms ease-out),
    border-color var(--transition-fast, 120ms ease-out),
    filter var(--transition-fast, 120ms ease-out);
}

.confirm-btn.cancel {
  background: transparent;
  color: var(--text-secondary, #7e8fa0);
  border-color: var(--border-base, rgba(255,255,255,0.07));
}

.confirm-btn.cancel:hover {
  color: var(--text-primary, #d4dce6);
  border-color: var(--border-strong, rgba(255,255,255,0.20));
  background: rgba(255, 255, 255, 0.04);
}

.confirm-btn.danger {
  background: var(--status-fail, #e04a4a);
  color: #fff;
  border-color: var(--status-fail, #e04a4a);
  box-shadow: 0 1px 0 rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08);
}

.confirm-btn.danger:hover {
  filter: brightness(1.12);
}

.confirm-btn.danger:active {
  filter: brightness(0.88);
  transform: translateY(1px);
}

/* ── Transition ────────────────────────────────────────────── */
.confirm-fade-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.confirm-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
