/**
 * Express API 服务器
 *
 * REST 端点：
 *   GET  /api/config          读取当前配置
 *   POST /api/config          保存配置（写入 .env）
 *   GET  /api/models          返回模型列表
 *   GET  /api/suites          列出 examples/ 下所有 YAML 文件
 *   GET  /api/suite?file=xxx  读取单个套件的用例
 *   POST /api/suite           保存套件（增删改用例后写回）
 *   POST /api/run             启动测试，SSE 推送进度
 *   GET  /api/reports         列出历史报告
 *   GET  /api/report?file=xxx 读取单个报告
 */

import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { MODELS as DEFAULT_MODELS } from './models.js';
import { loadConfig } from './config.js';
import { callAgent } from './agent.js';
import { judge } from './judge.js';
import type { TestSuite, TestCase, CaseModelResult, EvalReport, ModelConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV_PATH = join(ROOT, '.env');
const EXAMPLES_DIR = join(ROOT, 'examples');
const RESULTS_DIR = join(ROOT, 'results');
const MODELS_PATH = join(ROOT, 'models.json');

interface ModelsFile {
  prefix: string;
  ids: string[];
}

const DEFAULT_PREFIX = '/model';

/** 运行时模型列表：优先读 models.json，否则用硬编码默认值 */
function getModels(): ModelConfig[] {
  if (existsSync(MODELS_PATH)) {
    try {
      const file = JSON.parse(readFileSync(MODELS_PATH, 'utf-8')) as ModelsFile;
      return file.ids.map((id) => ({ id, switchCmd: `${file.prefix} ${id}` }));
    } catch { /* 解析失败则回退 */ }
  }
  return DEFAULT_MODELS;
}

/** 读取前缀和 id 列表（供前端编辑用） */
function getModelsFile(): ModelsFile {
  if (existsSync(MODELS_PATH)) {
    try {
      return JSON.parse(readFileSync(MODELS_PATH, 'utf-8')) as ModelsFile;
    } catch { /* ignore */ }
  }
  return { prefix: DEFAULT_PREFIX, ids: DEFAULT_MODELS.map((m) => m.id) };
}

const app = express();
app.use(cors());
app.use(express.json());

// ── 工具函数 ──────────────────────────────────────────────────

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};
  const lines = readFileSync(ENV_PATH, 'utf-8').split('\n');
  const result: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    result[key] = val;
  }
  return result;
}

function writeEnv(data: Record<string, string>): void {
  const lines = Object.entries(data).map(([k, v]) => `${k}=${v}`);
  writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── GET /api/config ───────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  const env = readEnv();
  res.json({
    agentApiUrl: env['AGENT_API_URL'] ?? '',
    agentApiKey: env['AGENT_API_KEY'] ?? '',
    agentInstanceId: env['AGENT_INSTANCE_ID'] ?? '',
    agentExtraBody: env['AGENT_EXTRA_BODY'] ?? '',
    requestInterval: env['REQUEST_INTERVAL'] ?? '3',
    switchWait: env['SWITCH_WAIT'] ?? '2',
    requestTimeout: env['REQUEST_TIMEOUT'] ?? '60',
  });
});

// ── POST /api/config ──────────────────────────────────────────

app.post('/api/config', (req, res) => {
  const body = req.body as Record<string, string>;
  const env: Record<string, string> = {};
  if (body['agentApiUrl'])      env['AGENT_API_URL'] = body['agentApiUrl'];
  if (body['agentApiKey'])      env['AGENT_API_KEY'] = body['agentApiKey'];
  if (body['agentInstanceId'])  env['AGENT_INSTANCE_ID'] = body['agentInstanceId'];
  if (body['agentExtraBody'])   env['AGENT_EXTRA_BODY'] = body['agentExtraBody'];
  if (body['requestInterval'])  env['REQUEST_INTERVAL'] = body['requestInterval'];
  if (body['switchWait'])       env['SWITCH_WAIT'] = body['switchWait'];
  if (body['requestTimeout'])   env['REQUEST_TIMEOUT'] = body['requestTimeout'];
  writeEnv(env);
  // 重新加载环境变量到 process.env
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  res.json({ ok: true });
});

// ── GET /api/models ───────────────────────────────────────────
// 返回两部分：供勾选的 ModelConfig 列表，以及供编辑的 prefix + ids

app.get('/api/models', (_req, res) => {
  const file = getModelsFile();
  res.json({ models: getModels(), prefix: file.prefix, ids: file.ids });
});

// ── POST /api/models ──────────────────────────────────────────

app.post('/api/models', (req, res) => {
  const { prefix, ids } = req.body as { prefix: string; ids: string[] };
  if (!prefix || !Array.isArray(ids)) {
    res.status(400).json({ error: '格式错误，需要 prefix 和 ids 数组' });
    return;
  }
  const file: ModelsFile = {
    prefix: prefix.trim(),
    ids: ids.map((id) => id.trim()).filter(Boolean),
  };
  writeFileSync(MODELS_PATH, JSON.stringify(file, null, 2), 'utf-8');
  res.json({ ok: true });
});

// ── GET /api/suites ───────────────────────────────────────────

app.get('/api/suites', (_req, res) => {
  if (!existsSync(EXAMPLES_DIR)) {
    res.json([]);
    return;
  }
  const files: string[] = [];
  function walk(dir: string, base: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), base + entry.name + '/');
      } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
        files.push(base + entry.name);
      }
    }
  }
  walk(EXAMPLES_DIR, '');
  res.json(files);
});

// ── GET /api/suite ────────────────────────────────────────────

app.get('/api/suite', (req, res) => {
  const file = req.query['file'] as string;
  if (!file) { res.status(400).json({ error: '缺少 file 参数' }); return; }
  const fullPath = join(EXAMPLES_DIR, file);
  if (!existsSync(fullPath)) { res.status(404).json({ error: '文件不存在' }); return; }
  try {
    const raw = readFileSync(fullPath, 'utf-8');
    const suite = yaml.load(raw) as TestSuite;
    res.json({ file, suite });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── POST /api/suite ───────────────────────────────────────────

app.post('/api/suite', (req, res) => {
  const { file, suite } = req.body as { file: string; suite: TestSuite };
  if (!file || !suite) { res.status(400).json({ error: '缺少 file 或 suite' }); return; }
  const fullPath = join(EXAMPLES_DIR, file);
  mkdirSync(dirname(fullPath), { recursive: true });
  try {
    writeFileSync(fullPath, yaml.dump(suite, { lineWidth: -1 }), 'utf-8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── POST /api/run（SSE）───────────────────────────────────────

app.post('/api/run', async (req, res) => {
  const { modelIds, suite } = req.body as {
    modelIds: string[];
    suite: TestSuite;
  };

  if (!modelIds?.length || !suite?.cases?.length) {
    res.status(400).json({ error: '缺少 modelIds 或 suite.cases' });
    return;
  }

  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function send(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch (e) {
    send('error', { message: (e as Error).message });
    res.end();
    return;
  }

  const agentConfig = {
    apiUrl: config.agentApiUrl,
    apiKey: config.agentApiKey,
    extraBody: config.agentExtraBody,
    timeoutMs: config.timeoutMs,
  };

  const selectedModels: ModelConfig[] = modelIds
    .map((id) => getModels().find((m) => m.id === id))
    .filter((m): m is ModelConfig => !!m);

  const allResults: CaseModelResult[] = [];

  send('start', {
    modelIds: selectedModels.map((m) => m.id),
    caseCount: suite.cases.length,
  });

  for (let mi = 0; mi < selectedModels.length; mi++) {
    const model = selectedModels[mi];
    send('model_start', { modelId: model.id, index: mi, total: selectedModels.length });

    // 切换模型
    send('switch', { modelId: model.id, cmd: model.switchCmd });
    const switchResult = await callAgent(model.switchCmd, agentConfig);
    if (!switchResult.success) {
      send('switch_fail', { modelId: model.id, error: switchResult.error });
      // 该模型所有用例标记失败
      for (const c of suite.cases) {
        const r: CaseModelResult = {
          caseId: c.id, caseTitle: c.title, modelId: model.id,
          call: switchResult, verdict: 'FAIL',
          failReasons: [`模型切换失败: ${switchResult.error}`],
        };
        allResults.push(r);
        send('case_result', r);
      }
      continue;
    }
    send('switch_ok', { modelId: model.id, durationMs: switchResult.durationMs });

    if (config.switchWaitMs > 0) await sleep(config.switchWaitMs);

    for (let ci = 0; ci < suite.cases.length; ci++) {
      const c = suite.cases[ci];
      send('case_start', { modelId: model.id, caseId: c.id, caseTitle: c.title, index: ci, total: suite.cases.length });

      const callResult = await callAgent(c.instruction, agentConfig);
      const { verdict, failReasons } = judge(callResult.output, c.pass_criteria);

      const r: CaseModelResult = {
        caseId: c.id, caseTitle: c.title, modelId: model.id,
        call: callResult, verdict, failReasons,
      };
      allResults.push(r);
      send('case_result', r);

      if (ci < suite.cases.length - 1 && config.intervalMs > 0) {
        await sleep(config.intervalMs);
      }
    }

    send('model_done', { modelId: model.id });
    if (mi < selectedModels.length - 1 && config.intervalMs > 0) {
      await sleep(config.intervalMs);
    }
  }

  // 构建最终报告
  const report: EvalReport = {
    skill: suite.skill,
    description: suite.description ?? '',
    timestamp: new Date().toISOString(),
    modelIds: selectedModels.map((m) => m.id),
    cases: suite.cases.map((c) => ({
      id: c.id, title: c.title,
      instruction: c.instruction,
      sideEffect: c.side_effect ?? 'none',
    })),
    results: allResults,
  };

  // 保存报告文件
  mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = report.timestamp.replace(/[:.]/g, '-').replace('T', '_').slice(0, 16);
  const reportFile = `${suite.skill}-${ts}.json`;
  writeFileSync(join(RESULTS_DIR, reportFile), JSON.stringify(report, null, 2), 'utf-8');

  send('done', { report, reportFile });
  res.end();
});

// ── GET /api/reports ──────────────────────────────────────────

app.get('/api/reports', (_req, res) => {
  if (!existsSync(RESULTS_DIR)) { res.json([]); return; }
  const files = readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
  res.json(files);
});

// ── GET /api/report ───────────────────────────────────────────

app.get('/api/report', (req, res) => {
  const file = req.query['file'] as string;
  if (!file) { res.status(400).json({ error: '缺少 file 参数' }); return; }
  const fullPath = join(RESULTS_DIR, file);
  if (!existsSync(fullPath)) { res.status(404).json({ error: '文件不存在' }); return; }
  try {
    const data = JSON.parse(readFileSync(fullPath, 'utf-8')) as EvalReport;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── 启动 ──────────────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
app.listen(PORT, () => {
  console.log(`API 服务器运行在 http://localhost:${PORT}`);
});
