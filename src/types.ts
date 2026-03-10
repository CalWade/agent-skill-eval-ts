/**
 * agent-skill-eval 核心类型定义
 *
 * 所有数据结构的 Single Source of Truth。
 * YAML 测试用例、判定引擎、Trace 解析、报告生成共用这套类型。
 */

// ============================================================
// YAML 测试用例结构
// ============================================================

/** 副作用级别：决定用例能否在 CI 中高频运行 */
export type SideEffect = 'none' | 'read' | 'write';

/** 测试用例类别 */
export type CaseCategory = 'happy_path' | 'error_recovery' | 'edge_case';

/** 测试模式：单轮指令 or 多轮编排 */
export type TestMode = 'single_turn' | 'multi_turn';

/**
 * 判定条件 — 使用 discriminated union 确保每种类型的字段约束
 *
 * 三层递进判定（semantic_success）:
 *   关键词匹配（零成本）→ 正则匹配（低成本）→ LLM-as-Judge（高精度）
 */
export type PassCriteria =
  | { type: 'semantic_success'; description: string; keywords?: string[]; regex?: string }
  | { type: 'output_contains'; text: string }
  | { type: 'output_not_contains'; text: string }
  | { type: 'output_contains_any'; texts: string[] }
  | { type: 'output_matches_regex'; pattern: string }
  | { type: 'llm_judge'; criteria: string }
  | { type: 'duration_le'; value: number }
  | { type: 'step_count_le'; value: number }
  | { type: 'tool_used'; name: string };

/** 多轮测试中的单个步骤 */
export interface TestStep {
  id: string;
  instruction: string;
  /** 用正则从回复中提取变量，存入上下文供后续步骤引用 */
  extract?: Record<string, string>;
  pass_criteria: PassCriteria[];
}

/** 单条测试用例 */
export interface TestCase {
  id: string;
  title: string;
  instruction: string;
  category?: CaseCategory;
  side_effect?: SideEffect;
  preconditions?: string[];
  min_steps?: number;
  pass_criteria: PassCriteria[];
  /** 多轮模式下的步骤列表（与 instruction/pass_criteria 互斥） */
  steps?: TestStep[];
}

/** YAML 测试套件文件的顶层结构 */
export interface TestSuite {
  skill: string;
  description?: string;
  mode?: TestMode;
  cases: TestCase[];
}

// ============================================================
// Agent API 调用结果
// ============================================================

/** Agent API 调用后的原始结果 */
export interface AgentResult {
  success: boolean;
  output: string;
  durationMs: number;
  tokenUsage: number;
  finishReason: string;
  responseId: string;
  error: string | null;
  /** Trace 数据（仅 stream 模式下可用） */
  trace: AgentTrace | null;
}

// ============================================================
// Trace 数据结构（v0.3 打开黑盒）
// ============================================================

/** 单次工具调用记录 */
export interface ToolCall {
  stepIndex: number;
  toolName: string;
  arguments: Record<string, unknown>;
  result?: string;
  durationMs: number;
  /** 业务错误码（如飞书 99991672） */
  errorCode?: number;
}

/** 一次 Agent 执行的完整轨迹 */
export interface AgentTrace {
  toolCalls: ToolCall[];
  totalSteps: number;
  totalTokens: number;
  /** Agent 的推理过程（如果平台暴露） */
  thinkingContent: string;
}

// ============================================================
// 判定结果
// ============================================================

/** 单条判定的结果 */
export interface Judgment {
  type: string;
  passed: boolean;
  detail: string;
  /** LLM 裁判的推理过程（仅 llm_judge / semantic_success 第三层） */
  reasoning?: string;
}

/** 单条用例的最终判定 */
export interface CaseVerdict {
  verdict: 'PASS' | 'FAIL' | 'SKIP';
  reason: string;
  judgments: Judgment[];
  /** 半自动失败分类标签（F1-F7） */
  autoFailTags?: string[];
}

/** 单条用例的完整测试结果（判定 + 执行数据） */
export interface CaseResult {
  caseId: string;
  title: string;
  instruction: string;
  category: string;
  verdict: 'PASS' | 'FAIL' | 'SKIP';
  reason: string;
  durationMs: number;
  tokenUsage: number;
  output: string;
  judgments: Judgment[];
  autoFailTags: string[];
  /** Trace 摘要（仅 stream 模式） */
  trace?: {
    totalSteps: number;
    toolChain: string[];
    hasRecovery: boolean;
  };
}

// ============================================================
// 报告
// ============================================================

/** 测试报告的 JSON 结构 */
export interface EvalReport {
  suite: string;
  round: string;
  timestamp: string;
  config: {
    apiUrl: string;
    model: string;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    avgDurationMs: number;
  };
  results: CaseResult[];
}

// ============================================================
// Adapter 接口
// ============================================================

/** 平台 Trace 适配器接口 */
export interface TraceAdapter {
  /** 解析 SSE stream 响应，返回最终内容和 Trace */
  parseStream(response: Response): Promise<{ content: string; trace: AgentTrace }>;
  /** 解析非 stream JSON 响应，尽可能提取 Trace 信息 */
  parseResponse(data: Record<string, unknown>): { content: string; trace: AgentTrace | null };
}

// ============================================================
// 应用配置
// ============================================================

/** 应用配置结构 */
export interface AppConfig {
  /** Agent API 端点（必须兼容 OpenAI Chat Completions 格式） */
  agentApiUrl: string;
  /** Agent API Key */
  agentApiKey: string;
  /** 模型名称（可选） */
  agentModel: string;
  /** 平台特定的额外请求参数，JSON 格式（可选） */
  agentExtraBody: Record<string, unknown>;
  /** 请求间隔秒数，避免限频 */
  requestInterval: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** LLM 裁判 API 地址（可选） */
  judgeApiUrl: string;
  /** LLM 裁判 API Key（可选） */
  judgeApiKey: string;
  /** LLM 裁判模型名（可选） */
  judgeModel: string;
  /** Trace 适配器类型 */
  traceAdapter: 'none' | 'openai' | 'openclaw';
  /** 报告输出目录 */
  resultsDir: string;
}
