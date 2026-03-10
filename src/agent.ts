/**
 * Agent API 调用层
 *
 * 向任何兼容 OpenAI Chat Completions 格式的 Agent 平台发送请求。
 * 支持两种模式：
 *   - simple 模式（stream=false）：等待完整响应，兼容所有平台
 *   - stream 模式（stream=true）：通过 SSE 逐步接收，配合 TraceAdapter 解析工具调用链
 *
 * 内置自动重试：429 限频和 5xx 服务端错误时按退避策略重试。
 */

import type { AgentResult, AppConfig, TraceAdapter } from './types.js';

/**
 * 调用 Agent API
 *
 * @param instruction - 用户指令
 * @param config - 应用配置
 * @param adapter - Trace 适配器（传入则使用 stream 模式）
 * @param timeout - 请求超时毫秒数（默认 5 分钟）
 */
export async function callAgent(
  instruction: string,
  config: AppConfig,
  adapter: TraceAdapter | null = null,
  timeout = 300_000,
): Promise<AgentResult> {
  const startTime = Date.now();
  const useStream = adapter !== null;

  // 构建请求体
  const body: Record<string, unknown> = {
    messages: [{ role: 'user', content: instruction }],
    stream: useStream,
    ...config.agentExtraBody,
  };
  if (config.agentModel) {
    body.model = config.agentModel;
  }
  // stream 模式下请求 token 用量
  if (useStream) {
    body.stream_options = { include_usage: true };
  }

  // 重试循环
  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      const resp = await fetch(config.agentApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.agentApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      // 认证失败：不重试
      if (resp.status === 401) {
        return errorResult(
          '认证失败 (401)，请检查 AGENT_API_KEY',
          Date.now() - startTime,
        );
      }

      // 限频：退避重试
      if (resp.status === 429) {
        if (attempt <= config.maxRetries) {
          const wait = 10_000 * attempt;
          console.warn(`  ⚠️  限频 (429)，${wait / 1000}s 后重试 (${attempt}/${config.maxRetries})...`);
          await sleep(wait);
          continue;
        }
        return errorResult(`限频 (429)，已重试 ${config.maxRetries} 次`, Date.now() - startTime);
      }

      // 服务端错误：退避重试
      if (resp.status >= 500) {
        if (attempt <= config.maxRetries) {
          const wait = 5_000 * attempt;
          console.warn(`  ⚠️  服务端错误 (${resp.status})，${wait / 1000}s 后重试...`);
          await sleep(wait);
          continue;
        }
        return errorResult(`服务端错误 (${resp.status})`, Date.now() - startTime);
      }

      if (!resp.ok) {
        return errorResult(`HTTP ${resp.status}: ${resp.statusText}`, Date.now() - startTime);
      }

      // ── 解析响应 ──

      if (useStream && adapter) {
        // Stream 模式：交给 adapter 解析 SSE
        const { content, trace } = await adapter.parseStream(resp);
        if (!content) {
          return errorResult('Stream 响应内容为空', Date.now() - startTime);
        }
        return {
          success: true,
          output: content,
          durationMs: Date.now() - startTime,
          tokenUsage: trace.totalTokens || estimateTokens(content),
          finishReason: 'stop',
          responseId: '',
          error: null,
          trace,
        };
      } else {
        // Simple 模式：解析 JSON
        const data = await resp.json() as Record<string, unknown>;
        return parseSimpleResponse(data, Date.now() - startTime, adapter);
      }

    } catch (err) {
      // 超时
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        return errorResult(`请求超时 (${timeout / 1000}s)`, Date.now() - startTime);
      }

      // 网络错误：重试
      if (attempt <= config.maxRetries) {
        console.warn('  ⚠️  连接失败，5s 后重试...');
        await sleep(5_000);
        continue;
      }

      return errorResult(
        `请求失败: ${err instanceof Error ? err.message : String(err)}`,
        Date.now() - startTime,
      );
    }
  }

  // 理论上不会到这里，但 TS 要求有返回值
  return errorResult('未知错误', Date.now() - startTime);
}

/**
 * 解析非 stream 模式的 JSON 响应
 */
function parseSimpleResponse(
  data: Record<string, unknown>,
  durationMs: number,
  adapter: TraceAdapter | null,
): AgentResult {
  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  if (!choices || choices.length === 0) {
    return errorResult('响应中没有 choices', durationMs);
  }

  const message = choices[0].message as Record<string, unknown> | undefined;
  const content = (message?.content as string) ?? '';
  const finishReason = (choices[0].finish_reason as string) ?? 'unknown';

  if (!content) {
    return errorResult('响应 content 为空', durationMs);
  }

  const usage = data.usage as Record<string, number> | undefined;
  const tokenUsage = usage?.total_tokens ?? estimateTokens(content);

  // 尝试用 adapter 提取 Trace（非 stream 模式下的有限信息）
  let trace = null;
  if (adapter) {
    const parsed = adapter.parseResponse(data);
    trace = parsed.trace;
  }

  return {
    success: true,
    output: content,
    durationMs,
    tokenUsage,
    finishReason,
    responseId: (data.id as string) ?? '',
    error: null,
    trace,
  };
}

/** 构造错误结果 */
function errorResult(error: string, durationMs: number): AgentResult {
  return {
    success: false,
    output: '',
    durationMs,
    tokenUsage: 0,
    finishReason: 'error',
    responseId: '',
    error,
    trace: null,
  };
}

/** 粗略估算 token 数（中英文混合按字符数 / 2） */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/** Promise 化的 sleep */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
