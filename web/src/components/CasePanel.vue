<template>
  <div class="case-panel">
    <div class="panel-header">
      <span class="panel-title">测试用例</span>
      <span class="case-count">{{ suite.cases.length }} 条</span>
      <div style="flex:1" />
      <el-button size="small" type="primary" plain @click="addCase">+ 添加用例</el-button>
    </div>

    <div class="case-list" v-if="suite.cases.length > 0">
      <div
        v-for="(c, idx) in suite.cases"
        :key="c.id"
        class="case-card"
        :class="{ 'case-card-alt': idx % 2 === 1 }"
      >
        <div class="case-card-header">
          <span class="case-id">{{ c.id ?? String(idx + 1) }}</span>
          <el-tag size="small" :type="sideEffectTagType(c.side_effect)" effect="plain">
            {{ c.side_effect || 'none' }}
          </el-tag>
          <div style="flex:1" />
          <el-button size="small" text @click="editCase(idx)">编辑</el-button>
          <button class="delete-btn" @click="removeCase(idx)">删除</button>
        </div>

        <div class="case-title">{{ c.title ?? c.instruction.slice(0, 40) }}</div>

        <div class="case-instruction-box">
          <span class="case-instruction-label">指令</span>
          <div class="case-instruction">{{ c.instruction }}</div>
        </div>

        <div v-if="c.pass_criteria?.length" class="case-criteria-list">
          <span class="criteria-label">判定条件</span>
          <div v-for="(cr, ci) in c.pass_criteria" :key="ci" class="criteria-tag">
            <span class="criteria-type">{{ criteriaTypeLabel(cr.type) }}</span>
            <span class="criteria-value">{{ criteriaValue(cr) }}</span>
          </div>
        </div>

        <div v-else class="case-no-criteria">仅展示回复（无判定）</div>
      </div>
    </div>

    <div v-else class="case-empty">
      <span>暂无用例，点击右上角添加</span>
    </div>
  </div>

  <!-- 用例编辑对话框 -->
  <el-dialog v-model="dialogVisible" title="编辑用例" width="580px" align-center>
    <div class="dialog-inner">
      <el-form :model="editingCase" size="small" label-position="top">
        <el-row :gutter="8">
          <el-col :span="10">
            <el-form-item label="ID（可选）">
              <el-input v-model="editingCase.id" :placeholder="`省略则自动编号`" />
            </el-form-item>
          </el-col>
          <el-col :span="14">
            <el-form-item label="副作用">
              <el-select v-model="editingCase.side_effect" style="width:100%">
                <el-option value="none" label="none（无）" />
                <el-option value="read" label="read（只读）" />
                <el-option value="write" label="write（写入）" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="标题（可选）">
          <el-input v-model="editingCase.title" placeholder="省略则自动取指令前 40 字" />
        </el-form-item>
        <el-form-item label="指令（发给 Agent 的内容）">
          <el-input v-model="editingCase.instruction" type="textarea" :rows="4" />
        </el-form-item>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span class="dialog-hint">判定条件（可选，不填则只展示回复）</span>
          <el-button size="small" plain @click="addCriteria">+ 添加</el-button>
        </div>

        <div v-for="(cr, ci) in editingCase.pass_criteria" :key="ci" class="criteria-row">
          <el-select v-model="cr.type" size="small" style="width:160px;flex-shrink:0" @change="onCriteriaTypeChange(cr)">
            <el-option value="output_contains" label="包含文本" />
            <el-option value="output_not_contains" label="不包含文本" />
            <el-option value="output_contains_any" label="包含任意一个" />
          </el-select>

          <template v-if="cr.type === 'output_contains' || cr.type === 'output_not_contains'">
            <el-input v-model="(cr as any).text" size="small" placeholder="文本内容" style="flex:1" />
          </template>
          <template v-else-if="cr.type === 'output_contains_any'">
            <el-input
              :model-value="(cr as any).texts?.join(', ')"
              @update:model-value="(v: string) => { (cr as any).texts = v.split(',').map((s:string) => s.trim()).filter(Boolean) }"
              size="small" placeholder="用逗号分隔多个文本" style="flex:1"
            />
          </template>

          <el-button size="small" text type="danger" @click="removeCriteria(ci)">×</el-button>
        </div>
      </el-form>
    </div>
    <template #footer>
      <el-button size="small" @click="dialogVisible = false">取消</el-button>
      <el-button size="small" type="primary" @click="confirmEdit">确认</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { TestSuite, TestCase, PassCriteria } from '../types'

const props = defineProps<{ suite: TestSuite }>()
const emit = defineEmits<{ change: [] }>()

// ── Dialog ─────────────────────────────────────────────────────

const dialogVisible = ref(false)
let editingIdx = -1

const editingCase = ref<TestCase & { pass_criteria: PassCriteria[] }>({
  id: '', title: '', instruction: '', side_effect: 'none', pass_criteria: [],
})

function addCase() {
  editingIdx = -1
  editingCase.value = {
    id: '', title: '', instruction: '', side_effect: 'none', pass_criteria: [],
  }
  dialogVisible.value = true
}

function editCase(idx: number) {
  editingIdx = idx
  const c = props.suite.cases[idx]
  if (!c) return
  editingCase.value = {
    id: c.id ?? '',
    title: c.title ?? '',
    instruction: c.instruction ?? '',
    side_effect: c.side_effect ?? 'none',
    pass_criteria: JSON.parse(JSON.stringify(c.pass_criteria ?? [])),
  }
  dialogVisible.value = true
}

function removeCase(idx: number) {
  props.suite.cases.splice(idx, 1)
  emit('change')
}

function confirmEdit() {
  const c: TestCase = { instruction: editingCase.value.instruction }
  if (editingCase.value.id) c.id = editingCase.value.id
  if (editingCase.value.title) c.title = editingCase.value.title
  if (editingCase.value.side_effect && editingCase.value.side_effect !== 'none')
    c.side_effect = editingCase.value.side_effect
  if (editingCase.value.pass_criteria.length > 0) {
    c.pass_criteria = editingCase.value.pass_criteria
  }
  if (editingIdx === -1) {
    props.suite.cases.push(c)
  } else {
    props.suite.cases[editingIdx] = c
  }
  emit('change')
  dialogVisible.value = false
}

function addCriteria() {
  editingCase.value.pass_criteria.push({ type: 'output_contains', text: '' } as PassCriteria)
}

function removeCriteria(idx: number) {
  editingCase.value.pass_criteria.splice(idx, 1)
}

function onCriteriaTypeChange(cr: Record<string, unknown>) {
  if (cr['type'] === 'output_contains' || cr['type'] === 'output_not_contains') {
    cr['text'] = cr['text'] ?? ''
    delete cr['texts']
  } else if (cr['type'] === 'output_contains_any') {
    cr['texts'] = cr['texts'] ?? []
    delete cr['text']
  }
}

// ── Helpers ────────────────────────────────────────────────────

function sideEffectTagType(se?: string): 'success' | 'warning' | 'danger' | '' {
  if (se === 'read') return 'warning'
  if (se === 'write') return 'danger'
  return 'success'
}

function criteriaTypeLabel(type: string) {
  const map: Record<string, string> = {
    output_contains: '包含',
    output_not_contains: '不包含',
    output_contains_any: '包含任意',
  }
  return map[type] ?? type
}

function criteriaValue(cr: PassCriteria) {
  const r = cr as Record<string, unknown>
  if (r['text']) return String(r['text'])
  if (Array.isArray(r['texts'])) return (r['texts'] as string[]).join(' / ')
  return ''
}
</script>

<style scoped>
/* ── Panel wrapper ─────────────────────────────────────────── */
.case-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Panel header ──────────────────────────────────────────── */
.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-panel);
  flex-shrink: 0;
  background: var(--bg-panel);
}

.panel-title {
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--accent-cyan);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.case-count {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--text-muted);
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
}

/* ── Case list ─────────────────────────────────────────────── */
.case-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── Case card ─────────────────────────────────────────────── */
.case-card {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-card);
  padding: 12px 14px;
  border-left: 3px solid transparent;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.case-card:hover {
  border-left-color: var(--accent-cyan);
  box-shadow: 0 0 0 1px rgba(0, 200, 212, 0.12);
}

.case-card-alt {
  background: var(--bg-table-row-alt, rgba(255,255,255,0.02));
}

.case-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.case-id {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--accent-cyan);
  font-weight: 600;
}

.case-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

/* ── Instruction block ─────────────────────────────────────── */
.case-instruction-box {
  background: var(--bg-root);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-base);
  padding: 8px 10px;
  margin-bottom: 8px;
}

.case-instruction-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  display: block;
  margin-bottom: 4px;
}

.case-instruction {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Criteria ──────────────────────────────────────────────── */
.case-criteria-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.criteria-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.criteria-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 200, 212, 0.07);
  border: 1px solid rgba(0, 200, 212, 0.2);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
}

.criteria-type {
  font-size: 11px;
  color: var(--accent-cyan);
  font-weight: 600;
}

.criteria-value {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.case-no-criteria {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}

/* ── Empty state ───────────────────────────────────────────── */
.case-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-muted);
  opacity: 0.5;
}

/* ── Delete btn ────────────────────────────────────────────── */
.delete-btn {
  background: transparent;
  border: none;
  padding: 2px 6px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.15s;
}

.delete-btn:hover { color: var(--status-fail, #f56c6c); }

/* ── Criteria row (dialog) ─────────────────────────────────── */
.criteria-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

/* ── Dialog ────────────────────────────────────────────────── */
.dialog-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
</style>
