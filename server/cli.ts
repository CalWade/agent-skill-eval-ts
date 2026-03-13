/**
 * CLI 入口
 *
 * 用法:
 *   pnpm eval --suite <path>            跑全部模型
 *   pnpm eval --suite <path> --models gpt-4o,deepseek-v3
 *   pnpm eval --suite <path> --safe-only
 *   pnpm eval --suite <path> --dry-run
 *   pnpm eval --suite <path> --interval 5
 *   pnpm eval --list-models
 *
 * 示例:
 *   pnpm eval --suite suites/feishu/smoke.yaml
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';
import { loadConfig } from './services/configService.js';
import { getModels, filterModels } from './services/modelService.js';
import { runAll } from './runner.js';
import { printSuiteHeader, printFinalSummary, saveReport } from './report.js';
import type { TestSuite, EvalReport } from './types.js';

// ── 参数解析 ──────────────────────────────────────────────────

interface CliArgs {
  suite: string | null;
  models: string[];
  safeOnly: boolean;
  dryRun: boolean;
  intervalMs: number | null;
  listModels: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    suite: null,
    models: [],
    safeOnly: false,
    dryRun: false,
    intervalMs: null,
    listModels: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--suite' && argv[i + 1]) {
      args.suite = argv[++i];
    } else if (a === '--models' && argv[i + 1]) {
      args.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--safe-only') {
      args.safeOnly = true;
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--interval' && argv[i + 1]) {
      args.intervalMs = parseInt(argv[++i], 10) * 1000;
    } else if (a === '--list-models') {
      args.listModels = true;
    }
  }

  return args;
}

// ── 加载测试套件 ──────────────────────────────────────────────

function loadSuite(suitePath: string): TestSuite {
  let raw: string;
  try {
    raw = readFileSync(resolve(suitePath), 'utf-8');
  } catch {
    throw new Error(`找不到测试用例文件: ${suitePath}`);
  }

  const data = yaml.load(raw) as TestSuite;
  if (!data?.cases || data.cases.length === 0) {
    throw new Error(`${suitePath} 中没有测试用例（缺少 cases 字段）`);
  }
  return data;
}

// ── 主流程 ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // --list-models：列出所有可用模型后退出
  if (args.listModels) {
    console.log('可用模型:');
    for (const m of getModels()) {
      console.log(`  ${m.id.padEnd(24)} switchCmd: ${m.switchCmd}`);
    }
    return;
  }

  if (!args.suite) {
    console.error('错误: 必须指定 --suite <path>');
    console.error('用法: pnpm eval --suite suites/feishu/smoke.yaml');
    process.exit(1);
  }

  // 加载配置
  const appConfig = loadConfig();

  // 加载测试套件
  const suite = loadSuite(args.suite);

  // 过滤用例
  let cases = suite.cases;
  if (args.safeOnly) {
    cases = cases.filter((c) => (c.side_effect ?? 'none') === 'none');
    if (cases.length === 0) {
      console.log('没有 side_effect=none 的用例，退出');
      return;
    }
  }

  // 确定要跑的模型
  const models = filterModels(args.models);
  if (models.length === 0) {
    console.error('错误: 没有匹配的模型。使用 --list-models 查看可用模型');
    process.exit(1);
  }

  // 未知 model id 警告
  if (args.models.length > 0) {
    const knownIds = new Set(getModels().map((m) => m.id));
    for (const id of args.models) {
      if (!knownIds.has(id)) {
        console.warn(`警告: 未知模型 "${id}"，已跳过`);
      }
    }
  }

  // Dry-run：只打印用例列表
  if (args.dryRun) {
    console.log(`\n[dry-run] ${suite.skill ?? args.suite} — ${cases.length} 条用例`);
    console.log(`模型: ${models.map((m) => m.id).join(', ')}\n`);
    cases.forEach((c, i) => {
      const id = c.id ?? String(i + 1);
      const title = c.title ?? c.instruction.slice(0, 40);
      const hasCriteria = (c.pass_criteria?.length ?? 0) > 0;
      console.log(
        `  ${id.padEnd(12)} ${title.padEnd(24)} ` +
        `副作用: ${(c.side_effect ?? 'none').padEnd(6)} ` +
        `判定: ${hasCriteria ? c.pass_criteria!.length + '条' : '无（展示用）'}`,
      );
    });
    return;
  }

  printSuiteHeader(suite.skill ?? args.suite ?? 'suite', cases.length, models.map((m) => m.id));

  // 执行测试
  const intervalMs = args.intervalMs ?? appConfig.intervalMs;
  const results = await runAll(models, cases, {
    agent: {
      mode: appConfig.mode,
      apiUrl: appConfig.agentApiUrl,
      apiKey: appConfig.agentApiKey,
      extraBody: appConfig.agentExtraBody,
      localBaseUrl: appConfig.localBaseUrl,
      localToken: appConfig.localToken,
      timeoutMs: appConfig.timeoutMs,
    },
    intervalMs,
    switchWaitMs: appConfig.switchWaitMs,
    runId: Date.now().toString(36),
  });

  // 构建报告
  const _d = new Date();
  const _p = (n: number, l = 2) => String(n).padStart(l, '0');
  const timestamp = `${_d.getFullYear()}-${_p(_d.getMonth()+1)}-${_p(_d.getDate())}T${_p(_d.getHours())}:${_p(_d.getMinutes())}:${_p(_d.getSeconds())}+08:00`;
  const report: EvalReport = {
    skill: suite.skill ?? args.suite ?? 'unknown',
    description: suite.description ?? '',
    timestamp,
    modelIds: models.map((m) => m.id),
    cases: cases.map((c, i) => ({
      id: c.id ?? String(i + 1),
      title: c.title ?? c.instruction.slice(0, 40),
      instruction: c.instruction,
      sideEffect: c.side_effect ?? 'none',
    })),
    results,
  };

  printFinalSummary(report);
  saveReport(report, appConfig.resultsDir);
}

main().catch((err) => {
  console.error('致命错误:', (err as Error).message);
  process.exit(1);
});
