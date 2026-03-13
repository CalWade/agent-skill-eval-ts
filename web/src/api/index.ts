import type { ModelConfig, TestSuite, EvalReport, SseEvent } from '../types'

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

// 配置
export const getConfig = () => get<Record<string, string>>('/config')
export const saveConfig = (data: Record<string, string>) => post<{ ok: boolean }>('/config', data)

// OpenClaw 本地可用模型（从 openclaw.json 读取）
export const getLocalModels = () =>
  get<{ id: string; name: string }[]>('/localModels')

// 模型
export const getModels = () =>
  get<{ models: ModelConfig[]; prefix: string; ids: string[]; localModels: Record<string, string> }>('/models')
export const saveModels = (prefix: string, ids: string[], localModels?: Record<string, string>) =>
  post<{ ok: boolean }>('/models', { prefix, ids, localModels })

// 测试套件
export const getSuites = () => get<string[]>('/suites')
export const getSuite = (file: string) =>
  get<{ file: string; suite: TestSuite }>(`/suite?file=${encodeURIComponent(file)}`)
export const saveSuite = (file: string, suite: TestSuite) =>
  post<{ ok: boolean }>('/suite', { file, suite })

// 历史报告
export const getReports = () => get<string[]>('/reports')
export const getReport = (file: string) =>
  get<EvalReport>(`/report?file=${encodeURIComponent(file)}`)

// 启动测试（SSE）
export function startRun(
  modelIds: string[],
  suite: TestSuite,
  onEvent: (e: SseEvent) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  let aborted = false

  fetch(BASE + '/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelIds, suite }),
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      onError('请求失败')
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      if (aborted) break
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const lines = part.split('\n')
        let event = ''
        let data = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) event = line.slice(7)
          if (line.startsWith('data: ')) data = line.slice(6)
        }
        if (!event || !data) continue
        try {
          const parsed = JSON.parse(data)
          onEvent({ type: event, ...parsed } as SseEvent)
          if (event === 'done') onDone()
          if (event === 'error') onError(parsed.message)
        } catch { /* ignore parse error */ }
      }
    }
  }).catch((e) => onError(String(e)))

  return () => { aborted = true }
}
