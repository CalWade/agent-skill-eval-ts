/**
 * 核心类型定义
 */

// ── 模型配置 ──────────────────────────────────────────────────

/**
 * 平台内置模型配置。
 * 切换方式：向 Agent 发送 switchCmd 文本（如 "/model gpt-4o"），
 * 平台在同一 API 端点内完成模型切换，无需独立 API Key。
 */
export interface ModelConfig {
  /** 唯一标识，CLI --models 过滤用 */
  id: string;
  /** 切换指令原文，直接作为 user message 发送 */
  switchCmd: string;
}

// ── YAML 测试用例 ─────────────────────────────────────────────

export type SideEffect = 'none' | 'read' | 'write';

/** 判定条件（可选）。没有 pass_criteria 的用例只展示回复，不做自动判定。 */
export type PassCriteria =
  | { type: 'output_contains'; text: string }
  | { type: 'output_not_contains'; text: string }
  | { type: 'output_contains_any'; texts: string[] };

export interface TestCase {
  id: string;
  title: string;
  instruction: string;
  side_effect?: SideEffect;
  pass_criteria?: PassCriteria[];
}

export interface TestSuite {
  skill: string;
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

// ── 判定结果 ──────────────────────────────────────────────────

/**
 * - PASS: 有判定条件且全部通过
 * - FAIL: 有判定条件且至少一条未通过
 * - DISPLAY: 无判定条件，仅展示回复
 */
export type Verdict = 'PASS' | 'FAIL' | 'DISPLAY';

export interface CaseModelResult {
  caseId: string;
  caseTitle: string;
  modelId: string;
  call: CallResult;
  verdict: Verdict;
  /** verdict=FAIL 时列出未通过的判定描述 */
  failReasons: string[];
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
  }>;
  results: CaseModelResult[];
}
