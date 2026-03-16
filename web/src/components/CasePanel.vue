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
        :key="idx"
        class="case-card"
        :class="{ editing: editingIdx === idx }"
      >
        <!-- ── 展示态 ── -->
        <template v-if="editingIdx !== idx">
          <div class="case-card-header">
            <span class="case-id">{{ c.id ?? String(idx + 1) }}</span>
            <el-tag size="small" :type="sideEffectTagType(c.side_effect)" effect="plain">
              {{ c.side_effect || 'none' }}
            </el-tag>
            <el-tag v-if="c.steps?.length" size="small" effect="plain" style="margin-left:2px">
              {{ c.steps.length }} 步
            </el-tag>
            <div style="flex:1" />
            <el-button size="small" text @click="startEdit(idx)">编辑</el-button>
            <button class="delete-btn" @click="removeCase(idx)">删除</button>
          </div>

          <div class="case-title">{{ c.title ?? firstInstruction(c).slice(0, 40) }}</div>

          <!-- 多步展示 -->
          <template v-if="c.steps?.length">
            <div v-for="(step, si) in c.steps" :key="si" class="case-step-box">
              <span class="case-step-label">步骤 {{ si + 1 }}</span>
              <div class="case-instruction">{{ step.instruction }}</div>
              <div v-if="step.pass_criteria?.length" class="case-criteria-list" style="margin-top:4px">
                <div v-for="(cr, ci) in step.pass_criteria" :key="ci" class="criteria-tag">
                  <span class="criteria-type">{{ criteriaTypeLabel(cr.type) }}</span>
                  <span class="criteria-value">{{ criteriaValue(cr) }}</span>
                </div>
              </div>
              <div v-else class="case-no-criteria">仅展示回复</div>
            </div>
          </template>

          <!-- 单步展示 -->
          <template v-else>
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
          </template>
        </template>

        <!-- ── 编辑态（内联） ── -->
        <template v-else>
          <div class="edit-header">
            <span class="edit-label">编辑用例</span>
            <div style="flex:1" />
            <el-button size="small" @click="cancelEdit">取消</el-button>
            <el-button size="small" type="primary" @click="confirmEdit">确认</el-button>
          </div>

          <div class="edit-body">
            <!-- ID + 副作用 -->
            <div class="edit-row">
              <div class="edit-field" style="flex:0 0 120px">
                <label class="edit-field-label">ID（可选）</label>
                <el-input v-model="editing.id" size="small" placeholder="省略则自动编号" />
              </div>
              <div class="edit-field" style="flex:0 0 160px">
                <label class="edit-field-label">副作用</label>
                <el-select v-model="editing.side_effect" size="small" style="width:100%">
                  <el-option value="none" label="none（无）" />
                  <el-option value="read" label="read（只读）" />
                  <el-option value="write" label="write（写入）" />
                </el-select>
              </div>
              <div class="edit-field" style="flex:1">
                <label class="edit-field-label">标题（可选）</label>
                <el-input v-model="editing.title" size="small" placeholder="省略则自动取指令前 40 字" />
              </div>
            </div>

            <!-- 多步开关 -->
            <div class="edit-switch-row">
              <el-switch v-model="editing.isMultiStep" @change="onMultiStepToggle" />
              <span class="edit-switch-label">多步对话模式（步骤间共享对话上下文）</span>
            </div>

            <!-- 单步内容 -->
            <template v-if="!editing.isMultiStep">
              <div class="edit-field">
                <label class="edit-field-label">指令（发给 Agent 的内容）</label>
                <el-input v-model="editing.instruction" type="textarea" :rows="3" size="small" />
              </div>
              <div class="edit-criteria-header">
                <span class="edit-criteria-hint">判定条件（可选，不填则只展示回复）</span>
                <el-button size="small" plain @click="addCriteria(-1)">+ 添加</el-button>
              </div>
              <div v-for="(cr, ci) in editing.pass_criteria" :key="ci" class="criteria-row">
                <el-select v-model="cr.type" size="small" style="width:140px;flex-shrink:0" @change="onCriteriaTypeChange(cr)">
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
                    size="small" placeholder="逗号分隔多个文本" style="flex:1"
                  />
                </template>
                <el-button size="small" text type="danger" @click="removeCriteria(-1, ci)">×</el-button>
              </div>
            </template>

            <!-- 多步内容 -->
            <template v-else>
              <div v-for="(step, si) in editing.steps" :key="si" class="step-block">
                <div class="step-block-header">
                  <span class="step-index">步骤 {{ si + 1 }}</span>
                  <el-button size="small" text type="danger" :disabled="editing.steps.length <= 1" @click="removeStep(si)">删除步骤</el-button>
                </div>
                <el-input v-model="step.instruction" type="textarea" :rows="2" placeholder="发给 Agent 的指令" size="small" style="margin-bottom:6px" />
                <div class="edit-criteria-header">
                  <span class="edit-criteria-hint">判定条件（可选）</span>
                  <el-button size="small" plain @click="addCriteria(si)">+ 添加</el-button>
                </div>
                <div v-for="(cr, ci) in (step.pass_criteria ?? [])" :key="ci" class="criteria-row">
                  <el-select v-model="cr.type" size="small" style="width:140px;flex-shrink:0" @change="onCriteriaTypeChange(cr)">
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
                      size="small" placeholder="逗号分隔多个文本" style="flex:1"
                    />
                  </template>
                  <el-button size="small" text type="danger" @click="removeCriteria(si, ci)">×</el-button>
                </div>
              </div>
              <el-button size="small" plain style="width:100%;margin-top:4px" @click="addStep">+ 添加步骤</el-button>
            </template>
          </div>
        </template>
      </div>
    </div>

    <div v-else class="case-empty">
      <span>暂无用例，点击右上角添加</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useConfirm } from '../composables/useConfirm'
import type { TestSuite, TestCase, TestStep, PassCriteria } from '../types'

const props = defineProps<{ suite: TestSuite }>()
const emit = defineEmits<{ change: [] }>()

const confirm = useConfirm()

// ── 编辑状态 ────────────────────────────────────────────────────

const editingIdx = ref<number | null>(null)

interface EditingCase {
  id: string
  title: string
  instruction: string
  side_effect: 'none' | 'read' | 'write'
  pass_criteria: PassCriteria[]
  isMultiStep: boolean
  steps: (TestStep & { pass_criteria: PassCriteria[] })[]
}

const editing = ref<EditingCase>(makeEmpty())

function makeEmpty(): EditingCase {
  return { id: '', title: '', instruction: '', side_effect: 'none', pass_criteria: [], isMultiStep: false, steps: [makeEmptyStep()] }
}

function makeEmptyStep(): EditingCase['steps'][0] {
  return { instruction: '', pass_criteria: [] }
}

function startEdit(idx: number) {
  const c = props.suite.cases[idx]
  if (!c) return
  const isMultiStep = Array.isArray(c.steps) && c.steps.length > 0
  editing.value = {
    id: c.id ?? '',
    title: c.title ?? '',
    instruction: c.instruction ?? '',
    side_effect: c.side_effect ?? 'none',
    pass_criteria: JSON.parse(JSON.stringify(c.pass_criteria ?? [])),
    isMultiStep,
    steps: isMultiStep
      ? JSON.parse(JSON.stringify(c.steps!.map((s) => ({ ...s, pass_criteria: s.pass_criteria ?? [] }))))
      : [makeEmptyStep()],
  }
  editingIdx.value = idx
}

function cancelEdit() {
  editingIdx.value = null
}

function confirmEdit() {
  const idx = editingIdx.value
  if (idx === null) return
  const e = editing.value
  const c: TestCase = {}
  if (e.id) c.id = e.id
  if (e.title) c.title = e.title
  if (e.side_effect && e.side_effect !== 'none') c.side_effect = e.side_effect

  if (e.isMultiStep) {
    c.steps = e.steps.map((s) => {
      const step: TestStep = { instruction: s.instruction }
      if (s.pass_criteria.length > 0) step.pass_criteria = s.pass_criteria
      return step
    })
  } else {
    c.instruction = e.instruction
    if (e.pass_criteria.length > 0) c.pass_criteria = e.pass_criteria
  }

  if (idx === -1) {
    props.suite.cases.push(c)
  } else {
    props.suite.cases[idx] = c
  }
  editingIdx.value = null
  emit('change')
}

function addCase() {
  editing.value = makeEmpty()
  // 先 push 一个占位，再进入编辑态
  props.suite.cases.push({ instruction: '' })
  editingIdx.value = props.suite.cases.length - 1
}

async function removeCase(idx: number) {
  const c = props.suite.cases[idx]
  const label = c?.title || firstInstruction(c ?? {}).slice(0, 30) || `用例 ${idx + 1}`
  try {
    await confirm({
      title: '删除用例',
      message: `确认删除「${label}」？此操作不可撤销。`,
      confirmText: '删除',
    })
  } catch {
    return
  }
  if (editingIdx.value === idx) editingIdx.value = null
  props.suite.cases.splice(idx, 1)
  emit('change')
}

// ── 多步 ────────────────────────────────────────────────────────

function onMultiStepToggle(val: boolean) {
  if (val && editing.value.steps.length === 0) {
    editing.value.steps = [makeEmptyStep()]
  }
}

function addStep() {
  editing.value.steps.push(makeEmptyStep())
}

function removeStep(si: number) {
  editing.value.steps.splice(si, 1)
}

// ── 判定条件 ────────────────────────────────────────────────────

function addCriteria(stepIdx: number) {
  const newCr: PassCriteria = { type: 'output_contains', text: '' }
  if (stepIdx === -1) {
    editing.value.pass_criteria.push(newCr)
  } else {
    editing.value.steps[stepIdx].pass_criteria.push(newCr)
  }
}

function removeCriteria(stepIdx: number, ci: number) {
  if (stepIdx === -1) {
    editing.value.pass_criteria.splice(ci, 1)
  } else {
    editing.value.steps[stepIdx].pass_criteria.splice(ci, 1)
  }
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

// ── Helpers ──────────────────────────────────────────────────────

function firstInstruction(c: Partial<TestCase>): string {
  return c.steps?.[0]?.instruction ?? c.instruction ?? ''
}

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
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ── Case card ─────────────────────────────────────────────── */
.case-card {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-card);
  padding: 10px 12px;
  border-left: 3px solid transparent;
  transition: border-color var(--transition-base), box-shadow var(--transition-base);
}

.case-card:hover:not(.editing) {
  border-left-color: var(--accent-cyan);
  box-shadow: 0 0 0 1px rgba(0, 200, 212, 0.10);
}

.case-card.editing {
  border-left-color: var(--warn-amber);
  border-color: var(--warn-amber-dim);
  background: var(--bg-card-raised);
  box-shadow: 0 0 0 1px rgba(245, 166, 35, 0.12);
}

/* ── Card header (view mode) ───────────────────────────────── */
.case-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}

.case-id {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  color: var(--accent-cyan);
  font-weight: 600;
}

.case-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

/* ── Instruction block ─────────────────────────────────────── */
.case-instruction-box {
  background: var(--bg-root);
  border: 1px solid var(--border-base);
  border-radius: var(--radius-base);
  padding: 6px 10px;
  margin-bottom: 6px;
}

.case-instruction-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  display: block;
  margin-bottom: 3px;
}

.case-instruction {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Step box (view mode) ──────────────────────────────────── */
.case-step-box {
  background: var(--bg-root);
  border: 1px solid var(--border-base);
  border-left: 2px solid var(--accent-cyan);
  border-radius: var(--radius-base);
  padding: 6px 10px;
  margin-bottom: 5px;
}

.case-step-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent-cyan);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  display: block;
  margin-bottom: 3px;
  font-weight: 600;
}

/* ── Criteria ──────────────────────────────────────────────── */
.case-criteria-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
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
  border: 1px solid rgba(0, 200, 212, 0.18);
  border-radius: var(--radius-sm);
  padding: 2px 7px;
}

.criteria-type {
  font-size: 10px;
  color: var(--accent-cyan);
  font-weight: 600;
}

.criteria-value {
  font-size: 11px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  max-width: 180px;
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
  transition: color var(--transition-fast);
}
.delete-btn:hover { color: var(--status-fail); }

/* ── Edit header ────────────────────────────────────────────── */
.edit-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(245, 166, 35, 0.2);
}

.edit-label {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--warn-amber);
  text-transform: uppercase;
  letter-spacing: 0.10em;
}

/* ── Edit body ─────────────────────────────────────────────── */
.edit-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.edit-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.edit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.edit-field-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}

/* ── Multi-step switch ─────────────────────────────────────── */
.edit-switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--border-base);
  border-bottom: 1px solid var(--border-base);
}

.edit-switch-label {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ── Criteria row (edit mode) ──────────────────────────────── */
.edit-criteria-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.edit-criteria-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.criteria-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Step block (edit mode) ─────────────────────────────────── */
.step-block {
  background: var(--bg-root);
  border: 1px solid var(--border-base);
  border-left: 3px solid var(--accent-cyan);
  border-radius: var(--radius-base);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.step-index {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent-cyan);
  font-weight: 700;
  letter-spacing: 0.04em;
}
</style>
