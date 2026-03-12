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

    <el-button
      size="small"
      style="width:100%;margin-top:2px"
      @click="saveSuiteToServer"
      :loading="saving"
      :disabled="suite.cases.length === 0"
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
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getModels, saveModels, getSuites, getSuite, saveSuite } from '../api'
import type { ModelConfig, TestSuite } from '../types'

const emit = defineEmits<{ run: [{ modelIds: string[]; suite: TestSuite }] }>()

// 暴露 suite 供父组件（App.vue）传给 CasePanel
const suite = reactive<TestSuite>({ skill: '', description: '', cases: [] })
defineExpose({ suite })

// 模型
const models = ref<ModelConfig[]>([])
const selectedModelIds = ref<string[]>([])

// 套件
const suiteFiles = ref<string[]>([])
const selectedFile = ref('')
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
</script>

<style scoped>
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
.model-checkbox-label.checked { color: var(--accent-cyan, #00c8d4); }
.model-checkbox-input {
  accent-color: var(--accent-cyan, #00c8d4);
  cursor: pointer;
}

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


