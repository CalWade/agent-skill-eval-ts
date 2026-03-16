/**
 * 核心类型定义
 */

// ── 运行模式 ──────────────────────────────────────────────────

/**
 * cloud: 通过 OpenAI 兼容 API 测试，发送 switchCmd 消息切换模型
 * local: 通过本地 OpenClaw gateway 测试，用 model 字段 + sessionKey 隔离
 */
export type AgentMode = 'cloud' | 'local';

// ── 模型配置 ──────────────────────────────────────────────────

/**
 * 模型配置，云端和本地模式共用。
 *
 * cloud 模式：switchCmd 必填，通过发消息切换模型
 * local 模式：localModelId 必填（格式 "providerId/modelId"），switchCmd 忽略
 */
export interface ModelConfig {
  /** 唯一标识，CLI --models 过滤用 */
  id: string;
  /** cloud 模式：切换指令原文，直接作为 user message 发送 */
  switchCmd: string;
  /** local 模式：OpenClaw model 字段值，格式 "providerId/modelId" */
  localModelId?: string;
}

// ── YAML 测试用例 ─────────────────────────────────────────────

export type SideEffect = 'none' | 'read' | 'write';

/** 判定条件（可选）。没有 pass_criteria 的用例只展示回复，不做自动判定。 */
export type PassCriteria =
  | { type: 'output_contains'; text: string }
  | { type: 'output_not_contains'; text: string }
  | { type: 'output_contains_any'; texts: string[] };

/** 多步用例中的单个步骤 */
export interface TestStep {
  instruction: string;
  pass_criteria?: PassCriteria[];
}

export interface TestCase {
  /** 可选。省略时按数组下标自动生成（"1", "2", ...） */
  id?: string;
  /** 可选。省略时取 instruction / 第一步 instruction 前 40 字作为显示名 */
  title?: string;
  /** 单步用例必填；steps 存在时可省略（取第一步 instruction） */
  instruction?: string;
  /** 多步用例：steps 内共享同一 sessionKey，形成连续对话 */
  steps?: TestStep[];
  side_effect?: SideEffect;
  /** 单步用例的判定条件；steps 存在时忽略，改用每步自身的 pass_criteria */
  pass_criteria?: PassCriteria[];
}

export interface TestSuite {
  /** 可选。省略时从文件路径推断（去掉目录和扩展名） */
  skill?: string;
  description?: string;
  cases: TestCase[];
}

// ── 单次 API 调用结果 ──────────────────────────────────────────

export interface CallResult {
  success: boolean;
  /** 回复原文。失败时为空字符串 */
  output: string;
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  finishReason: string | null;
  error: string | null;
}

// ── Trace 指标（仅 local 模式）────────────────────────────────

/**
 * 从 OpenClaw session JSONL 解析出的执行路径指标。
 * 仅 local 模式下填充，cloud 模式不存在。
 */
export interface TraceMetrics {
  /** LLM 被调用的轮次（每条 assistant 消息算一轮） */
  llmTurns: number;
  /** 工具调用总次数 */
  toolCalls: number;
  /** 工具调用顺序，如 ["read", "gateway", "read"] */
  toolCallSequence: string[];
  /** toolResult.isError=true 的次数 */
  toolErrors: number;
}

// ── 判定结果 ──────────────────────────────────────────────────

/**
 * - PASS: 有判定条件且全部通过
 * - FAIL: 有判定条件且至少一条未通过
 * - DISPLAY: 无判定条件，仅展示回复
 */
export type Verdict = 'PASS' | 'FAIL' | 'DISPLAY';

/** 多步用例中单个步骤的执行结果 */
export interface StepResult {
  stepIndex: number;
  instruction: string;
  call: CallResult;
  verdict: Verdict;
  failReasons: string[];
}

export interface CaseModelResult {
  caseId: string;
  caseTitle: string;
  modelId: string;
  /** 单步用例的调用结果；多步用例取最后一步（保持向后兼容） */
  call: CallResult;
  verdict: Verdict;
  /** verdict=FAIL 时列出未通过的判定描述，多步时带 [步骤N] 前缀 */
  failReasons: string[];
  /** 多步用例时填充，单步用例不存在 */
  steps?: StepResult[];
  /** local 模式下从 session JSONL 解析的执行路径指标；cloud 模式不存在 */
  trace?: TraceMetrics;
}

// ── 报告 ──────────────────────────────────────────────────────

export interface EvalReport {
  skill: string;
  description: string;
  timestamp: string;
  /** 实际参与测试的模型 id 列表（按执行顺序） */
  modelIds: string[];
  cases: Array<{
    id: string;
    title: string;
    instruction: string;
    sideEffect: SideEffect;
    /** 多步用例的步骤数，单步用例不存在 */
    stepCount?: number;
  }>;
  results: CaseModelResult[];
}
