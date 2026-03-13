/**
 * Agent API 调用
 *
 * 支持两种模式：
 * - cloud: 标准 OpenAI 兼容接口，messages 数组，switchCmd 消息切换模型
 * - local: OpenClaw gateway /v1/chat/completions，model 字段指定模型，
 *          x-openclaw-session-key header 隔离每次调用的上下文
 */

import type { AgentMode, CallResult } from './types.js';

export interface AgentConfig {
  mode?: AgentMode;
  // cloud 模式
  apiUrl: string;
  apiKey: string;
  /** cloud 模式：平台特有参数，合并进请求 body */
  extraBody?: Record<string, unknown>;
  // local 模式
  localBaseUrl?: string;
  localToken?: string;
  /** local 模式：OpenClaw model 字段值，格式 "providerId/modelId" */
  localModelId?: string;
  /** local 模式：session key，用于隔离上下文 */
  sessionKey?: string;
  /** 超时毫秒数，默认 60000 */
  timeoutMs?: number;
}

/**
 * 向 Agent 发送单条消息，返回完整回复。
 * 根据 config.mode 自动选择 cloud / local 实现。
 */
export async function callAgent(
  message: string,
  config: AgentConfig,
): Promise<CallResult> {
  if (config.mode === 'local') {
    return callAgentLocal(message, config);
  }
  return callAgentCloud(message, config);
}

// ── cloud 模式 ────────────────────────────────────────────────

async function callAgentCloud(message: string, config: AgentConfig): Promise<CallResult> {
  const timeoutMs = config.timeoutMs ?? 60_000;
  const body: Record<string, unknown> = {
    messages: [{ role: 'user', content: message }],
    stream: false,
    ...config.extraBody,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startMs = Date.now();

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);
    return parseOpenAIResponse(response, Date.now() - startMs, timeoutMs);
  } catch (err) {
    clearTimeout(timer);
    return catchError(err as Error, Date.now() - startMs, timeoutMs);
  }
}

// ── local 模式（OpenClaw gateway）────────────────────────────

async function callAgentLocal(message: string, config: AgentConfig): Promise<CallResult> {
  const timeoutMs = config.timeoutMs ?? 60_000;
  const baseUrl = config.localBaseUrl ?? 'http://127.0.0.1:18789';
  const url = `${baseUrl}/v1/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.localModelId ?? 'openclaw',
    messages: [{ role: 'user', content: message }],
    stream: false,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.localToken ?? ''}`,
    'x-openclaw-agent-id': 'main',
  };
  if (config.sessionKey) {
    headers['x-openclaw-session-key'] = config.sessionKey;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startMs = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);
    return parseOpenAIResponse(response, Date.now() - startMs, timeoutMs);
  } catch (err) {
    clearTimeout(timer);
    return catchError(err as Error, Date.now() - startMs, timeoutMs);
  }
}

// ── 公共解析逻辑 ──────────────────────────────────────────────

async function parseOpenAIResponse(
  response: Response,
  durationMs: number,
  timeoutMs: number,
): Promise<CallResult> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return failure(`HTTP ${response.status}: ${text.slice(0, 200)}`, durationMs);
  }

  const data = await response.json() as Record<string, unknown>;

  const output = extractContent(data);
  if (output === null) {
    return failure('无法从响应中提取回复内容', durationMs);
  }

  // OpenClaw local 模式 usage 全为 0，统一置 null 避免误导报告
  const usage = data['usage'] as Record<string, number> | undefined;
  const promptTokens = (usage?.['prompt_tokens'] ?? 0) > 0 ? usage!['prompt_tokens'] : null;
  const completionTokens = (usage?.['completion_tokens'] ?? 0) > 0 ? usage!['completion_tokens'] : null;
  const totalTokens =
    promptTokens !== null && completionTokens !== null
      ? promptTokens + completionTokens
      : (usage?.['total_tokens'] ?? 0) > 0 ? usage!['total_tokens'] : null;

  const choices = data['choices'] as Array<Record<string, unknown>> | undefined;
  const finishReason = (choices?.[0]?.['finish_reason'] as string) ?? null;

  void timeoutMs; // 仅供上层错误提示用，解析阶段不需要
  return {
    success: true,
    output,
    durationMs,
    promptTokens: promptTokens ?? null,
    completionTokens: completionTokens ?? null,
    totalTokens: totalTokens ?? null,
    finishReason,
    error: null,
  };
}

function extractContent(data: Record<string, unknown>): string | null {
  const choices = data['choices'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = choices[0]?.['message'] as Record<string, unknown> | undefined;
    if (typeof msg?.['content'] === 'string') return msg['content'];
  }
  if (typeof data['content'] === 'string') return data['content'];
  return null;
}

function failure(error: string, durationMs: number): CallResult {
  return {
    success: false, output: '', durationMs,
    promptTokens: null, completionTokens: null, totalTokens: null,
    finishReason: 'error', error,
  };
}

function catchError(err: Error, durationMs: number, timeoutMs: number): CallResult {
  if (err.name === 'AbortError') {
    return failure(`请求超时（${timeoutMs / 1000}s）`, durationMs);
  }
  return failure(err.message, durationMs);
}
