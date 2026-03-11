/**
 * Express API 服务器
 *
 * 职责：路由注册 + 请求/响应处理。
 * 业务逻辑委托给 services/ 层，此文件不包含执行逻辑。
 *
 * REST 端点：
 *   GET  /api/config          读取当前配置
 *   POST /api/config          保存配置（写入 .env）
 *   GET  /api/models          返回模型列表
 *   POST /api/models          保存模型列表
 *   GET  /api/suites          列出 examples/ 下所有 YAML 文件
 *   GET  /api/suite?file=xxx  读取单个套件的用例
 *   POST /api/suite           保存套件（写回 YAML 文件）
 *   POST /api/run             启动测试，SSE 推送进度
 *   GET  /api/reports         列出历史报告
 *   GET  /api/report?file=xxx 读取单个报告
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { readEnvFile, writeEnvFile, loadConfig } from './services/configService.js';
import { readModelsFile, getModels, saveModelsFile } from './services/modelService.js';
import { executeRun, buildReport } from './services/runService.js';
import type { TestSuite, CaseModelResult, EvalReport, ModelConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EXAMPLES_DIR = join(ROOT, 'examples');
const RESULTS_DIR = join(ROOT, 'results');

const app = express();
app.use(cors());
app.use(express.json());

// ── GET /api/config ───────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  const env = readEnvFile();
  res.json({
    agentApiUrl:      env['AGENT_API_URL'] ?? '',
    agentApiKey:      env['AGENT_API_KEY'] ?? '',
    agentInstanceId:  env['AGENT_INSTANCE_ID'] ?? '',
    agentExtraBody:   env['AGENT_EXTRA_BODY'] ?? '',
    requestInterval:  env['REQUEST_INTERVAL'] ?? '3',
    switchWait:       env['SWITCH_WAIT'] ?? '2',
    requestTimeout:   env['REQUEST_TIMEOUT'] ?? '60',
  });
});

// ── POST /api/config ──────────────────────────────────────────

app.post('/api/config', (req, res) => {
  const body = req.body as Record<string, string>;
  const env: Record<string, string> = {};
  if (body['agentApiUrl'])     env['AGENT_API_URL'] = body['agentApiUrl'];
  if (body['agentApiKey'])     env['AGENT_API_KEY'] = body['agentApiKey'];
  if (body['agentInstanceId']) env['AGENT_INSTANCE_ID'] = body['agentInstanceId'];
  if (body['agentExtraBody'])  env['AGENT_EXTRA_BODY'] = body['agentExtraBody'];
  if (body['requestInterval']) env['REQUEST_INTERVAL'] = body['requestInterval'];
  if (body['switchWait'])      env['SWITCH_WAIT'] = body['switchWait'];
  if (body['requestTimeout'])  env['REQUEST_TIMEOUT'] = body['requestTimeout'];
  writeEnvFile(env);
  res.json({ ok: true });
});

// ── GET /api/models ───────────────────────────────────────────

app.get('/api/models', (_req, res) => {
  const file = readModelsFile();
  res.json({ models: getModels(), prefix: file.prefix, ids: file.ids });
});

// ── POST /api/models ──────────────────────────────────────────

app.post('/api/models', (req, res) => {
  const { prefix, ids } = req.body as { prefix: string; ids: string[] };
  if (!prefix || !Array.isArray(ids)) {
    res.status(400).json({ error: '格式错误，需要 prefix 和 ids 数组' });
    return;
  }
  saveModelsFile({ prefix, ids });
  res.json({ ok: true });
});

// ── GET /api/suites ───────────────────────────────────────────

app.get('/api/suites', (_req, res) => {
  if (!existsSync(EXAMPLES_DIR)) { res.json([]); return; }
  const files: string[] = [];
  function walk(dir: string, base: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), base + entry.name + '/');
      else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))
        files.push(base + entry.name);
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
    const suite = yaml.load(readFileSync(fullPath, 'utf-8')) as TestSuite;
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
  const { modelIds, suite } = req.body as { modelIds: string[]; suite: TestSuite };

  if (!modelIds?.length || !suite?.cases?.length) {
    res.status(400).json({ error: '缺少 modelIds 或 suite.cases' });
    return;
  }

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

  const selectedModels: ModelConfig[] = modelIds
    .map((id) => getModels().find((m) => m.id === id))
    .filter((m): m is ModelConfig => !!m);

  send('start', { modelIds: selectedModels.map((m) => m.id), caseCount: suite.cases.length });

  const results: CaseModelResult[] = await executeRun(
    selectedModels,
    suite.cases,
    {
      agent: {
        apiUrl: config.agentApiUrl,
        apiKey: config.agentApiKey,
        extraBody: config.agentExtraBody,
        timeoutMs: config.timeoutMs,
      },
      intervalMs: config.intervalMs,
      switchWaitMs: config.switchWaitMs,
    },
    {
      onModelStart: (modelId, index, total) => send('model_start', { modelId, index, total }),
      onSwitch:     (modelId, cmd)          => send('switch', { modelId, cmd }),
      onSwitchOk:   (modelId, durationMs)   => send('switch_ok', { modelId, durationMs }),
      onSwitchFail: (modelId, error)        => send('switch_fail', { modelId, error }),
      onCaseStart:  (modelId, caseId, caseTitle, index, total) =>
        send('case_result', { modelId, caseId, caseTitle, index, total }),
      onCaseResult: (r) => send('case_result', r),
      onModelDone:  (modelId) => send('model_done', { modelId }),
    },
  );

  const report = buildReport(suite, selectedModels, results);

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
  const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json')).sort().reverse();
  res.json(files);
});

// ── GET /api/report ───────────────────────────────────────────

app.get('/api/report', (req, res) => {
  const file = req.query['file'] as string;
  if (!file) { res.status(400).json({ error: '缺少 file 参数' }); return; }
  const fullPath = join(RESULTS_DIR, file);
  if (!existsSync(fullPath)) { res.status(404).json({ error: '文件不存在' }); return; }
  try {
    res.json(JSON.parse(readFileSync(fullPath, 'utf-8')) as EvalReport);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── 启动 ──────────────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
app.listen(PORT, () => console.log(`API 服务器运行在 http://localhost:${PORT}`));
