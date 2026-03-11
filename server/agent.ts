/**
 * Agent API 调用
 *
 * 单次 HTTP 请求：发送 user message → 等待完整回复 → 返回 CallResult。
 * 支持 stream=false（默认）和 stream=true 两种模式，优先使用 non-stream
 * 以减少复杂度（平台 API 受限场景下更稳定）。
 */

import type { CallResult } from './types.js';

export interface AgentConfig {
  apiUrl: string;
  apiKey: string;
  /** 平台特有参数（如 instance_id），合并进请求 body */
  extraBody?: Record<string, unknown>;
  /** 超时毫秒数，默认 60000 */
  timeoutMs?: number;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * 向 Agent 发送单条消息，返回完整回复。
 * 每次调用都是全新的无状态请求（messages 只含当前 message）。
 */
export async function callAgent(
  message: string,
  config: AgentConfig,
): Promise<CallResult> {
  const timeoutMs = config.timeoutMs ?? 60_000;

  const messages: ChatMessage[] = [{ role: 'user', content: message }];

  const body: Record<string, unknown> = {
    messages,
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
    const durationMs = Date.now() - startMs;

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return failure(`HTTP ${response.status}: ${text.slice(0, 200)}`, durationMs);
    }

    const data = await response.json() as Record<string, unknown>;

    // 提取回复文本（兼容标准 OpenAI 格式）
    const output = extractContent(data);
    if (output === null) {
      return failure('无法从响应中提取回复内容', durationMs);
    }

    // 提取 token 用量（有则记，无则 null）
    const usage = data['usage'] as Record<string, number> | undefined;
    const promptTokens = usage?.['prompt_tokens'] ?? null;
    const completionTokens = usage?.['completion_tokens'] ?? null;
    const totalTokens =
      promptTokens !== null && completionTokens !== null
        ? promptTokens + completionTokens
        : (usage?.['total_tokens'] ?? null);

    // 提取 finish_reason
    const choices = data['choices'] as Array<Record<string, unknown>> | undefined;
    const finishReason = (choices?.[0]?.['finish_reason'] as string) ?? null;

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
  } catch (err) {
    clearTimeout(timer);
    const durationMs = Date.now() - startMs;

    if ((err as Error).name === 'AbortError') {
      return failure(`请求超时（${timeoutMs / 1000}s）`, durationMs);
    }
    return failure((err as Error).message, durationMs);
  }
}

function extractContent(data: Record<string, unknown>): string | null {
  // 标准 OpenAI: choices[0].message.content
  const choices = data['choices'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = choices[0]?.['message'] as Record<string, unknown> | undefined;
    if (typeof msg?.['content'] === 'string') {
      return msg['content'];
    }
  }
  // 部分平台直接返回 content 字段
  if (typeof data['content'] === 'string') {
    return data['content'];
  }
  return null;
}

function failure(error: string, durationMs: number): CallResult {
  return {
    success: false,
    output: '',
    durationMs,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    finishReason: 'error',
    error,
  };
}
