/**
 * 配置加载
 *
 * 从 .env 读取 Agent API 连接信息和运行参数。
 */

import 'dotenv/config';

export interface AppConfig {
  agentApiUrl: string;
  agentApiKey: string;
  /** 平台特有参数（如 instance_id），作为 extra_body 传入请求 */
  agentExtraBody: Record<string, unknown>;
  /** 用例间等待毫秒数，默认 3000 */
  intervalMs: number;
  /** 切换模型后等待毫秒数，默认 2000 */
  switchWaitMs: number;
  /** 单次请求超时毫秒数，默认 60000 */
  timeoutMs: number;
  /** 报告输出目录，默认 results */
  resultsDir: string;
}

export function loadConfig(): AppConfig {
  const apiUrl = process.env['AGENT_API_URL'];
  const apiKey = process.env['AGENT_API_KEY'];

  if (!apiUrl) throw new Error('缺少环境变量 AGENT_API_URL，请检查 .env 文件');
  if (!apiKey) throw new Error('缺少环境变量 AGENT_API_KEY，请检查 .env 文件');

  // 构建 extraBody：将所有 AGENT_EXTRA_* 环境变量收集进来
  const extraBody: Record<string, unknown> = {};
  const instanceId = process.env['AGENT_INSTANCE_ID'];
  if (instanceId) extraBody['instance_id'] = instanceId;

  // 支持 JSON 格式的额外参数
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
