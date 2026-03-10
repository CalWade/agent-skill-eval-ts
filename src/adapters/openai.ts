/**
 * OpenAI 兼容格式的 Trace 适配器
 *
 * 解析标准 OpenAI Chat Completions 响应格式。
 * - 非 stream 模式：从 message.tool_calls 提取工具调用记录
 * - stream 模式：从 SSE 事件流中逐步拼装 Trace
 */

import { createParser, type EventSourceMessage } from 'eventsource-parser';
import type { TraceAdapter, AgentTrace, ToolCall } from '../types.js';

/** OpenAI choices[0].message 中的 tool_call 结构 */
interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** OpenAI Chat Completions 非 stream 响应结构 */
interface OpenAIChatResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string;
  }>;
  usage?: {
    total_tokens?: number;
  };
}

/** OpenAI SSE stream 中的 delta 结构 */
interface OpenAIStreamDelta {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    total_tokens?: number;
  };
}

export class OpenAIAdapter implements TraceAdapter {
  /**
   * 解析 SSE stream 响应
   *
   * OpenAI 的 stream 格式：每行 `data: {...}`，最后一行 `data: [DONE]`。
   * tool_calls 通过 delta 增量拼装。
   */
  async parseStream(response: Response): Promise<{ content: string; trace: AgentTrace }> {
    const toolCalls: ToolCall[] = [];
    const pendingTools = new Map<number, { name: string; args: string }>();
    let content = '';
    let totalTokens = 0;
    let stepIndex = 0;

    return new Promise((resolve, reject) => {
      const parser = createParser({
        onEvent(event: EventSourceMessage) {
          if (event.data === '[DONE]') {
            // stream 结束，把尚未结算的 tool_calls 收尾
            for (const [, tool] of pendingTools) {
              toolCalls.push({
                stepIndex: stepIndex++,
                toolName: tool.name,
                arguments: safeParseArgs(tool.args),
                durationMs: 0,
              });
            }

            resolve({
              content,
              trace: {
                toolCalls,
                totalSteps: toolCalls.length,
                totalTokens,
                thinkingContent: '',
              },
            });
            return;
          }

          try {
            const chunk = JSON.parse(event.data) as OpenAIStreamDelta;
            const delta = chunk.choices?.[0]?.delta;

            // 拼接文本内容
            if (delta?.content) {
              content += delta.content;
            }

            // 拼接 tool_calls（增量式）
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!pendingTools.has(tc.index)) {
                  pendingTools.set(tc.index, { name: '', args: '' });
                }
                const pending = pendingTools.get(tc.index)!;
                if (tc.function?.name) pending.name += tc.function.name;
                if (tc.function?.arguments) pending.args += tc.function.arguments;
              }
            }

            // 记录 token 用量
            if (chunk.usage?.total_tokens) {
              totalTokens = chunk.usage.total_tokens;
            }
          } catch {
            // 跳过无法解析的 chunk
          }
        },
      });

      // 读取 response body stream
      const reader = response.body?.getReader();
      if (!reader) {
        reject(new Error('Response body 不可读'));
        return;
      }

      const decoder = new TextDecoder();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            parser.feed(decoder.decode(value, { stream: true }));
          }
          // 确保最后的数据被处理
          parser.feed('');
        } catch (err) {
          reject(err);
        }
      })();
    });
  }

  /**
   * 解析非 stream JSON 响应
   *
   * 从 message.tool_calls 中提取工具调用记录。
   * 如果没有 tool_calls，返回 null trace（退化为纯结果断言）。
   */
  parseResponse(data: Record<string, unknown>): { content: string; trace: AgentTrace | null } {
    const resp = data as unknown as OpenAIChatResponse;
    const message = resp.choices?.[0]?.message;
    const content = message?.content ?? '';
    const rawToolCalls = message?.tool_calls;
    const totalTokens = resp.usage?.total_tokens ?? 0;

    if (!rawToolCalls || rawToolCalls.length === 0) {
      return { content, trace: null };
    }

    const toolCalls: ToolCall[] = rawToolCalls.map((tc, idx) => ({
      stepIndex: idx,
      toolName: tc.function.name,
      arguments: safeParseArgs(tc.function.arguments),
      durationMs: 0,
    }));

    return {
      content,
      trace: {
        toolCalls,
        totalSteps: toolCalls.length,
        totalTokens,
        thinkingContent: '',
      },
    };
  }
}

/** 安全解析 JSON 参数字符串 */
function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}
