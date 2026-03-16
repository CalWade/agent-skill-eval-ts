/**
 * Trace 指标提取服务
 *
 * 职责：从 OpenClaw session JSONL 文件中解析执行路径指标。
 * 仅在 local 模式下有意义；cloud 模式无 session 文件，调用方不应调用。
 *
 * 数据来源：
 *   ~/.openclaw/agents/main/sessions/sessions.json
 *     → key 为 sessionKey（如 eval:runId:modelId:caseId）
 *     → value.sessionId 指向对应 .jsonl 文件名
 *   ~/.openclaw/agents/main/sessions/{sessionId}.jsonl
 *     → 每行一条 JSONL 记录，包含 type/message 等字段
 *
 * 解析规则：
 *   - assistant 消息（role=assistant）：每条计一轮 llmTurn
 *   - content 中 type=toolCall 的条目：累加 toolCalls，记录 name 到 sequence
 *   - toolResult 消息（role=toolResult）且 isError=true：累加 toolErrors
 *
 * Token 字段（usage）在 OpenClaw local 模式下全为 0，不提取。
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { TraceMetrics } from '../types.js';

const SESSIONS_DIR = join(homedir(), '.openclaw', 'agents', 'main', 'sessions');
const SESSIONS_INDEX = join(SESSIONS_DIR, 'sessions.json');

function log(msg: string) {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const ts = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  console.log(`[trace][${ts}] ${msg}`);
}

/** sessions.json 中单条 session 元数据的最小结构 */
interface SessionMeta {
  sessionId: string;
  sessionFile?: string;
}

/** JSONL 中 message 消息的最小结构 */
interface JMessage {
  role: 'user' | 'assistant' | 'toolResult';
  content?: unknown[];
  isError?: boolean;
  stopReason?: string;
}

/** JSONL 中单行记录的最小结构 */
interface JEntry {
  type: string;
  message?: JMessage;
}

/**
 * 从 sessions.json 读取索引，用 sessionKey 找到对应 JSONL 路径。
 * 返回 null 表示找不到（session 未记录或文件不存在）。
 */
function resolveJsonlPath(sessionKey: string): string | null {
  if (!existsSync(SESSIONS_INDEX)) {
    log(`sessions.json not found: ${SESSIONS_INDEX}`);
    return null;
  }

  let index: Record<string, SessionMeta>;
  try {
    index = JSON.parse(readFileSync(SESSIONS_INDEX, 'utf-8')) as Record<string, SessionMeta>;
  } catch (e) {
    log(`failed to parse sessions.json: ${(e as Error).message}`);
    return null;
  }

  const meta = index[sessionKey];
  if (!meta) {
    log(`sessionKey not found in index: ${sessionKey}`);
    return null;
  }

  // sessionFile 是绝对路径；sessionId 是 UUID
  const jsonlPath = meta.sessionFile ?? join(SESSIONS_DIR, `${meta.sessionId}.jsonl`);
  if (!existsSync(jsonlPath)) {
    log(`jsonl file not found: ${jsonlPath}`);
    return null;
  }

  return jsonlPath;
}

/**
 * 解析单个 JSONL 文件，提取 TraceMetrics。
 */
function parseJsonl(jsonlPath: string): TraceMetrics {
  const metrics: TraceMetrics = {
    llmTurns: 0,
    toolCalls: 0,
    toolCallSequence: [],
    toolErrors: 0,
  };

  let raw: string;
  try {
    raw = readFileSync(jsonlPath, 'utf-8');
  } catch (e) {
    log(`failed to read jsonl: ${(e as Error).message}`);
    return metrics;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry: JEntry;
    try {
      entry = JSON.parse(trimmed) as JEntry;
    } catch {
      continue;
    }

    if (entry.type !== 'message' || !entry.message) continue;

    const msg = entry.message;

    if (msg.role === 'assistant') {
      metrics.llmTurns++;
      for (const item of msg.content ?? []) {
        const c = item as Record<string, unknown>;
        if (c['type'] === 'toolCall') {
          metrics.toolCalls++;
          metrics.toolCallSequence.push((c['name'] as string) ?? '?');
        }
      }
    }

    if (msg.role === 'toolResult' && msg.isError === true) {
      metrics.toolErrors++;
    }
  }

  return metrics;
}

/**
 * 根据 sessionKey 提取该用例的 trace 指标。
 *
 * @param sessionKey  格式 eval:{runId}:{modelId}:{caseId}
 * @returns TraceMetrics，或 null（找不到 session 时）
 */
export function extractTrace(sessionKey: string): TraceMetrics | null {
  const jsonlPath = resolveJsonlPath(sessionKey);
  if (!jsonlPath) return null;

  log(`extracting trace for ${sessionKey} from ${jsonlPath}`);
  const metrics = parseJsonl(jsonlPath);
  log(`trace: turns=${metrics.llmTurns} tools=${metrics.toolCalls} errors=${metrics.toolErrors} seq=${JSON.stringify(metrics.toolCallSequence)}`);
  return metrics;
}
