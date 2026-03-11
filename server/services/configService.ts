/**
 * 配置读写服务
 *
 * 统一 .env 文件的读写入口，消除 api.ts 手动解析与 config.ts dotenv 加载的双重配置层。
 * - readEnvFile()  / writeEnvFile()：供 API 端点读写 .env 文件
 * - loadConfig()：供测试执行器加载运行时参数（复用自 config.ts）
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(resolve(__dirname, '../..'), '.env');

// ── .env 文件读写（供 REST API 使用）─────────────────────────

/** 读取 .env 文件，返回键值对 */
export function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const result: Record<string, string> = {};
  for (const line of readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

/** 将键值对写入 .env 文件，并同步更新 process.env */
export function writeEnvFile(data: Record<string, string>): void {
  writeFileSync(ENV_PATH, Object.entries(data).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', 'utf-8');
  for (const [k, v] of Object.entries(data)) process.env[k] = v;
}

// ── 运行时配置加载（供测试执行器使用）────────────────────────

export interface AppConfig {
  agentApiUrl: string;
  agentApiKey: string;
  agentExtraBody: Record<string, unknown>;
  intervalMs: number;
  switchWaitMs: number;
  timeoutMs: number;
  /** 报告输出目录，CLI 模式使用，默认 results */
  resultsDir: string;
}

/**
 * 从 process.env 加载运行时配置。
 * 调用前需保证 .env 已加载（通过 dotenv 或 writeEnvFile 同步 process.env）。
 */
export function loadConfig(): AppConfig {
  const apiUrl = process.env['AGENT_API_URL'];
  const apiKey = process.env['AGENT_API_KEY'];

  if (!apiUrl) throw new Error('缺少环境变量 AGENT_API_URL，请在 API 配置面板保存配置');
  if (!apiKey) throw new Error('缺少环境变量 AGENT_API_KEY，请在 API 配置面板保存配置');

  const extraBody: Record<string, unknown> = {};
  const instanceId = process.env['AGENT_INSTANCE_ID'];
  if (instanceId) extraBody['instance_id'] = instanceId;

  const extraBodyJson = process.env['AGENT_EXTRA_BODY'];
  if (extraBodyJson) {
    try {
      Object.assign(extraBody, JSON.parse(extraBodyJson));
    } catch {
      console.warn('警告：AGENT_EXTRA_BODY 不是合法 JSON，已忽略');
    }
  }

  return {
    agentApiUrl: apiUrl,
    agentApiKey: apiKey,
    agentExtraBody: extraBody,
    intervalMs: parseIntEnv('REQUEST_INTERVAL', 3) * 1000,
    switchWaitMs: parseIntEnv('SWITCH_WAIT', 2) * 1000,
    timeoutMs: parseIntEnv('REQUEST_TIMEOUT', 60) * 1000,
    resultsDir: process.env['RESULTS_DIR'] ?? 'results',
  };
}

function parseIntEnv(key: string, defaultVal: number): number {
  const val = process.env[key];
  if (!val) return defaultVal;
  const n = parseInt(val, 10);
  return isNaN(n) ? defaultVal : n;
}
