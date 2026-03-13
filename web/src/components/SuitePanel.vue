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
      <el-button size="small" @click="openFileDialog(false)">新建</el-button>
    </div>

    <!-- 当前文件名 + 重命名入口 -->
    <div v-if="selectedFile" style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <span class="file-path">{{ selectedFile }}</span>
      <el-button size="small" text style="padding:0 4px;flex-shrink:0" @click="openFileDialog(true)">重命名</el-button>
    </div>

    <!-- 套件信息 -->
    <el-form size="small" label-position="top" style="margin-bottom:4px">
      <el-form-item label="描述（可选）" style="margin-bottom:0">
        <el-input v-model="suite.description" placeholder="..." />
      </el-form-item>
    </el-form>

    <!-- 自动保存状态 -->
    <div v-if="selectedFile" class="save-status">
      <span v-if="saving" class="save-state saving">保存中…</span>
      <span v-else-if="saveError" class="save-state error">保存失败</span>
      <span v-else class="save-state saved">已自动保存</span>
    </div>
  </el-card>

  <!-- 新建 / 重命名文件对话框 -->
  <el-dialog v-model="fileDialogVisible" :title="fileDialogRename ? '重命名套件' : '新建套件'" width="400px" align-center>
    <div class="dialog-inner">
      <div class="dialog-hint" style="margin-bottom:6px">
        文件路径（相对 suites/ 目录，不含扩展名）
      </div>
      <el-input
        v-model="fileDialogPath"
        size="small"
        placeholder="如 feishu/smoke 或 wework/regression"
        class="input-mono"
        @keyup.enter="confirmFileDialog"
      />
      <div class="dialog-hint" style="margin-top:6px">
        保存为 <code>suites/{{ fileDialogPath || '...' }}.yaml</code>
      </div>
    </div>
    <template #footer>
      <el-button size="small" @click="fileDialogVisible = false">取消</el-button>
      <el-button size="small" type="primary" :disabled="!fileDialogPath.trim()" @click="confirmFileDialog">
        {{ fileDialogRename ? '重命名并保存' : '创建' }}
      </el-button>
    </template>
  </el-dialog>

  <!-- 模型列表编辑对话框 -->
  <el-dialog v-model="modelDialogVisible" title="编辑模型列表" width="500px" align-center>
    <div class="dialog-inner">
      <div style="margin-bottom:14px">
        <div class="dialog-hint">
          Cloud 模式切换指令前缀（实际发送：前缀 + 空格 + 模型名）
        </div>
        <el-input v-model="editingPrefix" size="small" placeholder="/model" />
      </div>
      <div class="dialog-hint" style="margin-bottom:6px">模型列表</div>
      <!-- 列 header -->
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;padding:0 2px">
        <span style="width:20px;flex-shrink:0" />
        <span class="col-label" style="flex:1">模型名</span>
        <span class="col-label" style="flex:1.2">Local ID（providerId/modelId）</span>
        <span style="width:28px;flex-shrink:0" />
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
        <div
          v-for="(_, idx) in editingIds"
          :key="idx"
          style="display:flex;align-items:center;gap:6px"
        >
          <span class="dialog-index">{{ idx + 1 }}</span>
          <el-input
            v-model="editingIds[idx]"
            size="small"
            placeholder="如 gpt-4o"
            style="flex:1"
          />
          <el-input
            v-model="editingLocalModels[editingIds[idx] ?? '']"
            size="small"
            placeholder="如 custom-dashscope/qwen3"
            style="flex:1.2"
            class="input-mono"
          />
          <el-button size="small" text type="danger" @click="removeModel(idx)">×</el-button>
        </div>
      </div>
      <div class="dialog-hint" style="margin-bottom:10px">
        Local 模式填写 OpenClaw 的 provider/modelId，如
        <code>custom-dashscope/qwen3.5-plus</code>，留空则不参与 local 测试。
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
const saveError = ref(false)

function emitPayload() {
  emit('run', { modelIds: selectedModelIds.value, suite: { ...suite } })
}

watch([selectedModelIds, () => suite.cases.length], emitPayload, { deep: true })

// 自动保存：suite 内容变化后 debounce 500ms 写入
let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  suite,
  () => {
    if (!selectedFile.value) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(autoSave, 500)
  },
  { deep: true },
)

async function autoSave() {
  if (!selectedFile.value) return
  saving.value = true
  saveError.value = false
  try {
    await saveSuite(selectedFile.value, { ...suite })
  } catch {
    saveError.value = true
  } finally {
    saving.value = false
  }
}

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



// ── 新建 / 重命名 文件对话框 ───────────────────────────────────
const fileDialogVisible = ref(false)
const fileDialogRename = ref(false)   // true = 重命名模式，false = 新建模式
const fileDialogPath = ref('')

function openFileDialog(rename: boolean) {
  fileDialogRename.value = rename
  // 重命名时预填当前路径（去掉 .yaml）
  fileDialogPath.value = rename ? selectedFile.value.replace(/\.ya?ml$/, '') : ''
  fileDialogVisible.value = true
}

async function confirmFileDialog() {
  const raw = fileDialogPath.value.trim()
  if (!raw) return
  // 规范化：去掉用户可能手打的 .yaml 后缀，再加回来
  const normalized = raw.replace(/\.ya?ml$/, '')
  const newFile = normalized + '.yaml'

  if (fileDialogRename.value) {
    // 重命名：把当前内容保存到新路径
    saving.value = true
    try {
      await saveSuite(newFile, { ...suite })
      suiteFiles.value = await getSuites()
      selectedFile.value = newFile
    } catch (e) {
      ElMessage.error(String(e))
    } finally {
      saving.value = false
    }
  } else {
    // 新建：清空内容，切换到新路径（不立即写文件，等用户添加用例后手动保存）
    selectedFile.value = newFile
    suite.skill = undefined
    suite.description = ''
    suite.cases = []
    // 如果文件已存在则加载
    if (suiteFiles.value.includes(newFile)) {
      await loadSuite()
    }
  }
  fileDialogVisible.value = false
}

// 模型列表编辑
const modelDialogVisible = ref(false)
const editingPrefix = ref('/model')
const editingIds = ref<string[]>([])
const editingLocalModels = ref<Record<string, string>>({})
const savingModels = ref(false)

async function openModelEditor() {
  const resp = await getModels()
  editingPrefix.value = resp.prefix
  editingIds.value = [...resp.ids]
  editingLocalModels.value = { ...resp.localModels }
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
    await saveModels(editingPrefix.value.trim(), validIds, editingLocalModels.value)
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
.col-label {
  font-size: 11px;
  color: var(--text-muted, #666);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.dialog-preview {
  font-size: 11px;
  color: var(--text-muted, #444);
  font-family: var(--font-mono, monospace);
  flex-shrink: 0;
}
.input-mono :deep(.el-input__inner) {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
}
.save-status {
  display: flex;
  justify-content: flex-end;
  padding: 2px 0 4px;
}
.save-state {
  font-size: 11px;
  letter-spacing: 0.03em;
}
.save-state.saving { color: var(--text-muted, #666); }
.save-state.saved   { color: var(--text-muted, #555); }
.save-state.error   { color: var(--status-fail, #f56c6c); }

.file-path {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-muted, #666);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
code {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  background: var(--bg-card, #1a1d2e);
  padding: 1px 4px;
  border-radius: 3px;
}
</style>


