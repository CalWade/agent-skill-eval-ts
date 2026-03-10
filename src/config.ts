/**
 * 配置加载与校验
 *
 * 从 .env 文件和环境变量中读取配置。
 * 必填项缺失时给出清晰的错误提示并退出。
 */

import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import type { AppConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 加载 .env 文件
 * 按优先级查找：项目根 > 当前工作目录
 */
function loadDotEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(__dirname, '..', '.env'),
  ];
  for (const filepath of candidates) {
    if (existsSync(filepath)) {
      loadEnv({ path: filepath });
      return;
    }
  }
}

/**
 * 安全解析 JSON 字符串，失败返回空对象
 */
function safeParseJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * 从环境变量构建完整配置
 */
export function loadConfig(): AppConfig {
  loadDotEnv();

  return {
    agentApiUrl: process.env.AGENT_API_URL ?? '',
    agentApiKey: process.env.AGENT_API_KEY ?? '',
    agentModel: process.env.AGENT_MODEL ?? '',
    agentExtraBody: safeParseJson(process.env.AGENT_EXTRA_BODY ?? '{}'),
    requestInterval: parseInt(process.env.REQUEST_INTERVAL ?? '3', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES ?? '2', 10),
    judgeApiUrl: process.env.JUDGE_API_URL ?? '',
    judgeApiKey: process.env.JUDGE_API_KEY ?? '',
    judgeModel: process.env.JUDGE_MODEL ?? '',
    traceAdapter: (process.env.TRACE_ADAPTER as AppConfig['traceAdapter']) ?? 'none',
    resultsDir: process.env.RESULTS_DIR ?? resolve(process.cwd(), 'results'),
  };
}

/**
 * 校验必填配置项，缺失时打印帮助信息并退出进程
 */
export function validateConfig(config: AppConfig): void {
  const errors: string[] = [];

  if (!config.agentApiUrl) {
    errors.push(
      'AGENT_API_URL 未设置\n' +
      '  说明: Agent 平台的 Chat Completions API 地址\n' +
      '  示例: https://api.openai.com/v1/chat/completions',
    );
  }

  if (!config.agentApiKey) {
    errors.push(
      'AGENT_API_KEY 未设置\n' +
      '  说明: Agent 平台的 API Key 或 Bearer Token',
    );
  }

  if (errors.length > 0) {
    console.error('❌ 配置检查失败:\n');
    for (const e of errors) {
      console.error(`  • ${e}\n`);
    }
    console.error('提示: 复制 .env.example 为 .env 并填入你的值');
    process.exit(1);
  }
}
