<template>
  <el-card>
    <template #header>API 配置</template>
    <el-form :model="form" size="small" label-position="top">
      <el-form-item label="Agent API URL">
        <el-input v-model="form.agentApiUrl" placeholder="https://..." />
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="form.agentApiKey" type="password" show-password placeholder="sk-..." />
      </el-form-item>
      <el-form-item label="Instance ID（可选）">
        <el-input v-model="form.agentInstanceId" placeholder="平台特有参数" />
      </el-form-item>
      <el-row :gutter="8">
        <el-col :span="8">
          <el-form-item label="请求间隔（秒）">
            <el-input v-model="form.requestInterval" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="切换等待（秒）">
            <el-input v-model="form.switchWait" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="超时（秒）">
            <el-input v-model="form.requestTimeout" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-button size="small" type="primary" :loading="saving" @click="save" style="width:100%">
        保存配置
      </el-button>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getConfig, saveConfig } from '../api'

const form = ref({
  agentApiUrl: '',
  agentApiKey: '',
  agentInstanceId: '',
  requestInterval: '3',
  switchWait: '2',
  requestTimeout: '60',
})
const saving = ref(false)

onMounted(async () => {
  try {
    const config = await getConfig()
    Object.assign(form.value, config)
  } catch { /* 首次启动 .env 不存在，忽略 */ }
})

async function save() {
  saving.value = true
  try {
    await saveConfig({ ...form.value })
    ElMessage.success('配置已保存')
  } catch (e) {
    ElMessage.error(String(e))
  } finally {
    saving.value = false
  }
}
</script>
