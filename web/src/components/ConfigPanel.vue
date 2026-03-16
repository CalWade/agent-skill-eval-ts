<template>
  <el-card>
    <template #header>API 配置</template>
    <el-form :model="form" size="small" label-position="top">

      <!-- 模式切换 -->
      <el-form-item label="运行模式">
        <el-radio-group v-model="form.agentMode" style="width:100%">
          <el-radio-button value="cloud" style="flex:1">Cloud</el-radio-button>
          <el-radio-button value="local" style="flex:1">Local (OpenClaw)</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <!-- Cloud 模式字段 -->
      <template v-if="form.agentMode === 'cloud'">
        <el-form-item label="Agent API URL">
          <el-input v-model="form.agentApiUrl" placeholder="https://..." class="input-mono" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="form.agentApiKey" type="password" show-password placeholder="sk-..." class="input-mono" />
        </el-form-item>
        <el-form-item label="Instance ID（可选）">
          <el-input v-model="form.agentInstanceId" placeholder="平台特有参数" />
        </el-form-item>
        <el-form-item label="切换等待（秒）">
          <el-input v-model="form.switchWait" />
        </el-form-item>
      </template>

      <!-- Local 模式字段 -->
      <template v-else>
        <el-form-item label="Gateway URL">
          <el-input v-model="form.localBaseUrl" placeholder="http://127.0.0.1:18789" class="input-mono" />
        </el-form-item>
        <el-form-item label="Gateway Token">
          <el-input v-model="form.localToken" type="password" show-password placeholder="token..." class="input-mono" />
        </el-form-item>
      </template>

      <!-- 通用字段 -->
      <el-row :gutter="8">
        <el-col :span="12">
          <el-form-item label="请求间隔（秒）">
            <el-input v-model="form.requestInterval" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="超时（秒）">
            <el-input v-model="form.requestTimeout" />
          </el-form-item>
        </el-col>
      </el-row>

      <div style="display:flex;align-items:center;gap:6px">
        <el-button size="small" type="primary" :loading="saving" @click="save" style="flex:1">
          保存配置
        </el-button>
        <span v-if="dirty && !saving" class="unsaved-dot" title="有未保存的修改">●</span>
      </div>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { getConfig, saveConfig } from '../api'

const form = ref({
  agentMode: 'cloud' as 'cloud' | 'local',
  // cloud
  agentApiUrl: '',
  agentApiKey: '',
  agentInstanceId: '',
  switchWait: '2',
  // local
  localBaseUrl: 'http://127.0.0.1:18789',
  localToken: '',
  // 通用
  requestInterval: '3',
  requestTimeout: '60',
})
const saving = ref(false)
const dirty = ref(false)
let loaded = false

onMounted(async () => {
  try {
    const config = await getConfig()
    Object.assign(form.value, config)
  } catch { /* 首次启动 .env 不存在，忽略 */ }
  // 等 watch 回调跳过本次赋值后，再开启 dirty 追踪和自动保存
  await nextTick()
  loaded = true
})

watch(form, () => { if (loaded) dirty.value = true }, { deep: true })

// 切换模式时自动保存，避免跑测试时模式不匹配
watch(() => form.value.agentMode, () => { if (loaded) save() })

async function save() {
  saving.value = true
  try {
    // 始终发送完整表单，后端合并写入，避免切换模式后另一模式的字段被清空
    await saveConfig({
      agentMode:       form.value.agentMode,
      agentApiUrl:     form.value.agentApiUrl,
      agentApiKey:     form.value.agentApiKey,
      agentInstanceId: form.value.agentInstanceId,
      switchWait:      form.value.switchWait,
      localBaseUrl:    form.value.localBaseUrl,
      localToken:      form.value.localToken,
      requestInterval: form.value.requestInterval,
      requestTimeout:  form.value.requestTimeout,
    })
    dirty.value = false
    ElMessage.success('配置已保存')
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.unsaved-dot {
  color: var(--warn-amber, #f5a623);
  font-size: 10px;
  line-height: 1;
  flex-shrink: 0;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

:deep(.input-mono .el-input__inner) {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  letter-spacing: 0.02em;
}
:deep(.el-radio-button) { flex: 1; }
:deep(.el-radio-button__inner) { width: 100%; text-align: center; }
</style>
