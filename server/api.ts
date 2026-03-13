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
 *   GET  /api/suites          列出 suites/ 下所有 YAML 文件
 *   GET  /api/suite?file=xxx  读取单个套件（自动补全 id/title/skill）
 *   POST /api/suite           保存套件（只写用户填写的字段）
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
import type { TestSuite, TestCase, CaseModelResult, EvalReport, ModelConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SUITES_DIR = join(ROOT, 'suites');
const RESULTS_DIR = join(ROOT, 'results');

const app = express();
app.use(cors());
app.use(express.json());

// ── GET /api/config ───────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  const env = readEnvFile();
  res.json({
    agentMode:        env['AGENT_MODE'] ?? 'cloud',
    // cloud
    agentApiUrl:      env['AGENT_API_URL'] ?? '',
    agentApiKey:      env['AGENT_API_KEY'] ?? '',
    agentInstanceId:  env['AGENT_INSTANCE_ID'] ?? '',
    agentExtraBody:   env['AGENT_EXTRA_BODY'] ?? '',
    switchWait:       env['SWITCH_WAIT'] ?? '2',
    // local
    localBaseUrl:     env['LOCAL_BASE_URL'] ?? 'http://127.0.0.1:18789',
    localToken:       env['LOCAL_TOKEN'] ?? '',
    // 通用
    requestInterval:  env['REQUEST_INTERVAL'] ?? '3',
    requestTimeout:   env['REQUEST_TIMEOUT'] ?? '60',
  });
});

// ── POST /api/config ──────────────────────────────────────────

app.post('/api/config', (req, res) => {
  const body = req.body as Record<string, string>;
  // 前端发什么就写什么，writeEnvFile 会与现有配置合并
  // 用显式映射避免前端字段名污染 .env
  const fieldMap: Record<string, string> = {
    agentMode:       'AGENT_MODE',
    agentApiUrl:     'AGENT_API_URL',
    agentApiKey:     'AGENT_API_KEY',
    agentInstanceId: 'AGENT_INSTANCE_ID',
    agentExtraBody:  'AGENT_EXTRA_BODY',
    switchWait:      'SWITCH_WAIT',
    localBaseUrl:    'LOCAL_BASE_URL',
    localToken:      'LOCAL_TOKEN',
    requestInterval: 'REQUEST_INTERVAL',
    requestTimeout:  'REQUEST_TIMEOUT',
  };
  const env: Record<string, string> = {};
  for (const [frontendKey, envKey] of Object.entries(fieldMap)) {
    if (frontendKey in body) env[envKey] = body[frontendKey] ?? '';
  }
  writeEnvFile(env);
  res.json({ ok: true });
});

// ── GET /api/models ───────────────────────────────────────────

app.get('/api/models', (_req, res) => {
  const file = readModelsFile();
  res.json({ models: getModels(), prefix: file.prefix, ids: file.ids, localModels: file.localModels ?? {} });
});

// ── POST /api/models ──────────────────────────────────────────

app.post('/api/models', (req, res) => {
  const { prefix, ids, localModels } = req.body as {
    prefix: string;
    ids: string[];
    localModels?: Record<string, string>;
  };
  if (!prefix || !Array.isArray(ids)) {
    res.status(400).json({ error: '格式错误，需要 prefix 和 ids 数组' });
    return;
  }
  saveModelsFile({ prefix, ids, localModels });
  res.json({ ok: true });
});

// ── GET /api/suites ───────────────────────────────────────────

app.get('/api/suites', (_req, res) => {
  if (!existsSync(SUITES_DIR)) { res.json([]); return; }
  const files: string[] = [];
  function walk(dir: string, base: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), base + entry.name + '/');
      else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))
        files.push(base + entry.name);
    }
  }
  walk(SUITES_DIR, '');
  res.json(files);
});

// ── GET /api/suite ────────────────────────────────────────────

/**
 * 从文件路径推断 skill 名称：去掉扩展名，取最后一段目录+文件名。
 * 例："feishu/smoke.yaml" → "feishu/smoke"
 */
function skillFromPath(file: string): string {
  return file.replace(/\.ya?ml$/, '');
}

/** 补全 TestCase 缺省字段，不修改原始 YAML 内容 */
function normalizeCases(cases: TestCase[]): TestCase[] {
  return cases.map((c, i) => ({
    ...c,
    id: c.id ?? String(i + 1),
    title: c.title ?? c.instruction.slice(0, 40),
  }));
}

app.get('/api/suite', (req, res) => {
  const file = req.query['file'] as string;
  if (!file) { res.status(400).json({ error: '缺少 file 参数' }); return; }
  const fullPath = join(SUITES_DIR, file);
  if (!existsSync(fullPath)) { res.status(404).json({ error: '文件不存在' }); return; }
  try {
    const raw = yaml.load(readFileSync(fullPath, 'utf-8')) as TestSuite;
    const suite: TestSuite = {
      ...raw,
      // skill 从路径推断，YAML 里有则优先用
      skill: raw.skill ?? skillFromPath(file),
      cases: normalizeCases(raw.cases ?? []),
    };
    res.json({ file, suite });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── POST /api/suite ───────────────────────────────────────────

app.post('/api/suite', (req, res) => {
  const { file, suite } = req.body as { file: string; suite: TestSuite };
  if (!file || !suite) { res.status(400).json({ error: '缺少 file 或 suite' }); return; }
  const fullPath = join(SUITES_DIR, file);
  mkdirSync(dirname(fullPath), { recursive: true });
  try {
    // 写入时剥离自动生成的字段，保持 YAML 简洁
    const skillFromFile = skillFromPath(file);
    const toWrite: TestSuite = {
      // skill 与路径一致则省略（避免冗余），不一致时保留
      ...(suite.skill && suite.skill !== skillFromFile ? { skill: suite.skill } : {}),
      ...(suite.description ? { description: suite.description } : {}),
      cases: suite.cases.map((c) => {
        const autoId = String((suite.cases.indexOf(c)) + 1);
        const autoTitle = c.instruction.slice(0, 40);
        const out: TestCase = { instruction: c.instruction };
        if (c.id && c.id !== autoId) out.id = c.id;
        if (c.title && c.title !== autoTitle) out.title = c.title;
        if (c.side_effect && c.side_effect !== 'none') out.side_effect = c.side_effect;
        if (c.pass_criteria?.length) out.pass_criteria = c.pass_criteria;
        return out;
      }),
    };
    writeFileSync(fullPath, yaml.dump(toWrite, { lineWidth: -1 }), 'utf-8');
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
        mode: config.mode,
        apiUrl: config.agentApiUrl,
        apiKey: config.agentApiKey,
        extraBody: config.agentExtraBody,
        localBaseUrl: config.localBaseUrl,
        localToken: config.localToken,
        timeoutMs: config.timeoutMs,
      },
      intervalMs: config.intervalMs,
      switchWaitMs: config.switchWaitMs,
      runId: Date.now().toString(36),
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
  const skillName = suite.skill ?? 'suite';
  const reportFile = `${skillName}-${ts}.json`;
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
