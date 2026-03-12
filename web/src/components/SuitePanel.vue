<template>
  <el-card>
    <template #header>测试配置</template>

    <!-- 模型勾选 -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span class="section-label" style="margin:0">选择模型</span>
      <el-button size="small" text @click="openModelEditor">编辑列表</el-button>
    </div>
    <div class="model-grid">
      <label
        v-for="m in models"
        :key="m.id"
        class="model-checkbox-label"
        :class="{ checked: selectedModelIds.includes(m.id) }"
      >
        <input
          type="checkbox"
          :value="m.id"
          v-model="selectedModelIds"
          class="model-checkbox-input"
        />
        {{ m.id }}
      </label>
    </div>

    <!-- 套件选择 -->
    <div class="section-label" style="margin-top:12px">测试套件</div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <el-select
        v-model="selectedFile"
        placeholder="选择已有文件"
        size="small"
        style="flex:1"
        @change="loadSuite"
      >
        <el-option v-for="f in suiteFiles" :key="f" :label="f" :value="f" />
      </el-select>
      <el-button size="small" @click="newSuite">新建</el-button>
    </div>

    <!-- Skill 名称 -->
    <el-form size="small" label-position="top" style="margin-bottom:8px">
      <el-form-item label="Skill 名称">
        <el-input v-model="suite.skill" placeholder="feishu-send-message" />
      </el-form-item>
      <el-form-item label="描述（可选）">
        <el-input v-model="suite.description" placeholder="..." />
      </el-form-item>
    </el-form>

    <!-- 用例列表 -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <span class="section-label" style="margin:0">测试用例（{{ suite.cases.length }}）</span>
      <el-button size="small" type="primary" plain @click="addCase">+ 添加用例</el-button>
    </div>

    <div class="case-list">
      <div
        v-for="(c, idx) in suite.cases"
        :key="c.id"
        class="case-item"
        :class="{ 'case-item-alt': idx % 2 === 1 }"
      >
        <div class="case-header">
          <span class="case-id">{{ c.id }}</span>
          <el-tag size="small" :type="sideEffectTagType(c.side_effect)">{{ c.side_effect || 'none' }}</el-tag>
          <div style="flex:1" />
          <el-button size="small" text @click="editCase(idx)">编辑</el-button>
          <button class="delete-btn" @click="removeCase(idx)">删除</button>
        </div>
        <div class="case-title">{{ c.title }}</div>
        <div class="case-instruction">{{ c.instruction }}</div>
        <div v-if="c.pass_criteria?.length" class="case-criteria">
          {{ c.pass_criteria.length }} 条判定
        </div>
      </div>
    </div>

    <el-button
      v-if="suite.cases.length > 0"
      size="small"
      style="width:100%;margin-top:8px"
      @click="saveSuiteToServer"
      :loading="saving"
    >保存套件</el-button>
  </el-card>

  <!-- 模型列表编辑对话框 -->
  <el-dialog v-model="modelDialogVisible" title="编辑模型列表" width="400px" align-center>
    <div class="dialog-inner">
      <div style="margin-bottom:14px">
        <div class="dialog-hint">
          切换指令前缀（实际发送：前缀 + 空格 + 模型名）
        </div>
        <el-input v-model="editingPrefix" size="small" placeholder="/model" />
      </div>
      <div class="dialog-hint" style="margin-bottom:6px">模型名列表</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
        <div
          v-for="(_, idx) in editingIds"
          :key="idx"
          style="display:flex;align-items:center;gap:6px"
        >
          <span class="dialog-index">{{ idx + 1 }}</span>
          <el-input v-model="editingIds[idx]" size="small" :placeholder="`模型名，如 gpt-4o`" style="flex:1" />
          <span class="dialog-preview">
            → {{ editingPrefix }} {{ editingIds[idx] || '...' }}
          </span>
          <el-button size="small" text type="danger" @click="removeModel(idx)">×</el-button>
        </div>
      </div>
      <el-button size="small" plain style="width:100%;margin-bottom:4px" @click="addModel">
        + 添加模型
      </el-button>
    </div>
    <template #footer>
      <el-button size="small" @click="modelDialogVisible = false">取消</el-button>
      <el-button size="small" type="primary" :loading="savingModels" @click="confirmModelEdit">
        保存
      </el-button>
    </template>
  </el-dialog>

  <!-- 用例编辑对话框 -->
  <el-dialog v-model="dialogVisible" title="编辑用例" width="560px" align-center>
    <div class="dialog-inner">
      <el-form :model="editingCase" size="small" label-position="top">
        <el-row :gutter="8">
          <el-col :span="10">
            <el-form-item label="ID">
              <el-input v-model="editingCase.id" placeholder="TC-01" />
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
        <el-form-item label="标题">
          <el-input v-model="editingCase.title" placeholder="测试用例名称" />
        </el-form-item>
        <el-form-item label="指令（发给 Agent 的内容）">
          <el-input v-model="editingCase.instruction" type="textarea" :rows="3" />
        </el-form-item>

        <!-- 判定条件 -->
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
import { ref, onMounted, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getModels, saveModels, getSuites, getSuite, saveSuite } from '../api'
import type { ModelConfig, TestSuite, TestCase, PassCriteria } from '../types'

const emit = defineEmits<{ run: [{ modelIds: string[]; suite: TestSuite }] }>()

// 模型
const models = ref<ModelConfig[]>([])
const selectedModelIds = ref<string[]>([])

// 套件
const suiteFiles = ref<string[]>([])
const selectedFile = ref('')
const suite = reactive<TestSuite>({ skill: '', description: '', cases: [] })
const saving = ref(false)

function emitPayload() {
  emit('run', { modelIds: selectedModelIds.value, suite: { ...suite } })
}

watch([selectedModelIds, () => suite.skill, () => suite.cases.length], emitPayload, { deep: true })

onMounted(async () => {
  const resp = await getModels()
  models.value = resp.models
  selectedModelIds.value = models.value.slice(0, 2).map((m) => m.id)
  suiteFiles.value = await getSuites()
  if (suiteFiles.value.length > 0) {
    selectedFile.value = suiteFiles.value[0] ?? ''
    await loadSuite()
  }
  emitPayload()
})

async function loadSuite() {
  if (!selectedFile.value) return
  try {
    const { suite: s } = await getSuite(selectedFile.value)
    suite.skill = s.skill
    suite.description = s.description ?? ''
    suite.cases = s.cases
  } catch (e) {
    ElMessage.error(String(e))
  }
}

function newSuite() {
  selectedFile.value = ''
  suite.skill = ''
  suite.description = ''
  suite.cases = []
}

async function saveSuiteToServer() {
  if (!selectedFile.value) {
    const name = suite.skill || 'new-suite'
    selectedFile.value = `${name}/suite.yaml`
  }
  saving.value = true
  try {
    await saveSuite(selectedFile.value, { ...suite })
    suiteFiles.value = await getSuites()
    ElMessage.success('套件已保存')
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    saving.value = false
  }
}

// 模型列表编辑
const modelDialogVisible = ref(false)
const editingPrefix = ref('/model')
const editingIds = ref<string[]>([])
const savingModels = ref(false)

async function openModelEditor() {
  const resp = await getModels()
  editingPrefix.value = resp.prefix
  editingIds.value = [...resp.ids]
  modelDialogVisible.value = true
}

function addModel() {
  editingIds.value.push('')
}

function removeModel(idx: number) {
  editingIds.value.splice(idx, 1)
}

async function confirmModelEdit() {
  const validIds = editingIds.value.map((id) => id.trim()).filter(Boolean)
  if (validIds.length === 0) {
    ElMessage.warning('至少保留一个模型')
    return
  }
  if (!editingPrefix.value.trim()) {
    ElMessage.warning('切换指令前缀不能为空')
    return
  }
  savingModels.value = true
  try {
    await saveModels(editingPrefix.value.trim(), validIds)
    const resp = await getModels()
    models.value = resp.models
    const idSet = new Set(validIds)
    selectedModelIds.value = selectedModelIds.value.filter((id) => idSet.has(id))
    modelDialogVisible.value = false
    ElMessage.success('模型列表已保存')
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    savingModels.value = false
  }
}

// 用例编辑
const dialogVisible = ref(false)
let editingIdx = -1

const editingCase = ref<TestCase & { pass_criteria: PassCriteria[] }>({
  id: '', title: '', instruction: '', side_effect: 'none', pass_criteria: [],
})

function addCase() {
  editingIdx = -1
  editingCase.value = {
    id: `TC-${String(suite.cases.length + 1).padStart(2, '0')}`,
    title: '', instruction: '', side_effect: 'none', pass_criteria: [],
  }
  dialogVisible.value = true
}

function editCase(idx: number) {
  editingIdx = idx
  const c = suite.cases[idx]
  if (!c) return
  editingCase.value = {
    ...c,
    id: c.id ?? '',
    title: c.title ?? '',
    instruction: c.instruction ?? '',
    pass_criteria: JSON.parse(JSON.stringify(c.pass_criteria ?? [])),
  }
  dialogVisible.value = true
}

function removeCase(idx: number) {
  suite.cases.splice(idx, 1)
}

function confirmEdit() {
  const c: TestCase = {
    id: editingCase.value.id,
    title: editingCase.value.title,
    instruction: editingCase.value.instruction,
    side_effect: editingCase.value.side_effect,
  }
  if (editingCase.value.pass_criteria.length > 0) {
    c.pass_criteria = editingCase.value.pass_criteria
  }
  if (editingIdx === -1) {
    suite.cases.push(c)
  } else {
    suite.cases[editingIdx] = c
  }
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

function sideEffectTagType(se?: string): 'success' | 'warning' | 'danger' | '' {
  if (se === 'read') return 'warning'
  if (se === 'write') return 'danger'
  return 'success'
}
</script>

<style scoped>
/* ── section-label ── */
.section-label {
  font-size: var(--fs-sm, 12px);
  color: var(--text-secondary, #888);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.section-label::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 12px;
  background: var(--accent-cyan, #00c8d4);
  border-radius: 2px;
  flex-shrink: 0;
}

/* ── model checkbox grid ── */
.model-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  background: var(--bg-card, #0f1117);
  border: 1px solid var(--border-card, #2a2d3e);
  border-radius: var(--radius-card, 8px);
  padding: 8px 10px;
}
.model-checkbox-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm, 12px);
  color: var(--text-secondary, #888);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.15s;
  user-select: none;
}
.model-checkbox-label.checked {
  color: var(--accent-cyan, #00c8d4);
}
.model-checkbox-input {
  accent-color: var(--accent-cyan, #00c8d4);
  cursor: pointer;
}

/* ── case list ── */
.case-list {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow-y: auto;
}
.case-item {
  background: var(--bg-table-row, #0f1117);
  padding: 8px 10px;
  cursor: default;
  border-left: 2px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}
.case-item-alt {
  background: var(--bg-table-row-alt, #111318);
}
.case-item:hover {
  background: rgba(0, 200, 212, 0.05);
  border-left: 2px solid var(--accent-cyan, #00c8d4);
}
.case-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.case-id {
  font-size: 11px;
  color: var(--accent-cyan, #00c8d4);
  font-family: var(--font-mono, monospace);
}
.case-title {
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
}
.case-instruction {
  font-size: 12px;
  color: var(--text-muted, #888);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.case-criteria {
  font-size: 11px;
  color: var(--accent-cyan-dim, #60a5fa);
  margin-top: 3px;
}

/* ── delete button ── */
.delete-btn {
  background: transparent;
  border: none;
  padding: 2px 6px;
  font-size: 12px;
  color: var(--text-muted, #555);
  cursor: pointer;
  border-radius: 4px;
  transition: color 0.15s;
}
.delete-btn:hover {
  color: var(--status-fail, #f56c6c);
}

/* ── criteria row ── */
.criteria-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

/* ── dialog inner ── */
.dialog-hint {
  font-size: 12px;
  color: var(--text-muted, #888);
  margin-bottom: 4px;
}
.dialog-index {
  font-size: 12px;
  color: var(--text-secondary, #555);
  width: 20px;
  text-align: right;
  flex-shrink: 0;
}
.dialog-preview {
  font-size: 11px;
  color: var(--text-muted, #444);
  font-family: var(--font-mono, monospace);
  flex-shrink: 0;
}
</style>

<!-- Dialog background override (non-scoped) -->
<style>
.el-dialog {
  background: var(--bg-card-raised, #161920) !important;
}
.el-dialog__title {
  text-transform: uppercase;
  color: var(--text-heading, #e0e0e0) !important;
  letter-spacing: 0.06em;
}
</style>
