// 与 server/types.ts 对应的前端类型定义

export type SideEffect = 'none' | 'read' | 'write'
export type Verdict = 'PASS' | 'FAIL' | 'DISPLAY'

export type PassCriteria =
  | { type: 'output_contains'; text: string }
  | { type: 'output_not_contains'; text: string }
  | { type: 'output_contains_any'; texts: string[] }

export interface TestStep {
  instruction: string
  pass_criteria?: PassCriteria[]
}

export interface TestCase {
  id?: string
  title?: string
  instruction?: string
  steps?: TestStep[]
  side_effect?: SideEffect
  pass_criteria?: PassCriteria[]
}

export interface TestSuite {
  skill?: string
  description?: string
  cases: TestCase[]
}

export type AgentMode = 'cloud' | 'local'

export interface ModelConfig {
  id: string
  switchCmd: string
  localModelId?: string
}

export interface CallResult {
  success: boolean
  output: string
  durationMs: number
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  finishReason: string | null
  error: string | null
}

export interface StepResult {
  stepIndex: number
  instruction: string
  call: CallResult
  verdict: Verdict
  failReasons: string[]
}

export interface CaseModelResult {
  caseId: string
  caseTitle: string
  modelId: string
  call: CallResult
  verdict: Verdict
  failReasons: string[]
  steps?: StepResult[]
}

export interface EvalReport {
  skill: string
  description: string
  timestamp: string
  modelIds: string[]
  cases: Array<{
    id: string
    title: string
    instruction: string
    sideEffect: SideEffect
    stepCount?: number
  }>
  results: CaseModelResult[]
}

// SSE 事件类型
export type SseEvent =
  | { type: 'start'; modelIds: string[]; caseCount: number }
  | { type: 'model_start'; modelId: string; index: number; total: number }
  | { type: 'switch'; modelId: string; cmd: string }
  | { type: 'switch_ok'; modelId: string; durationMs: number }
  | { type: 'switch_fail'; modelId: string; error: string }
  | { type: 'case_start'; modelId: string; caseId: string; caseTitle: string; index: number; total: number }
  | { type: 'case_result'; modelId: string; caseId: string; caseTitle: string; call: CallResult; verdict: Verdict; failReasons: string[] }
  | { type: 'model_done'; modelId: string }
  | { type: 'done'; report: EvalReport; reportFile: string }
  | { type: 'error'; message: string }
