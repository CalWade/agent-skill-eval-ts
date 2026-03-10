/**
 * 测试执行器
 *
 * 核心流程：加载 YAML → 逐条执行 → 判定 → 生成报告
 * 支持单轮和多轮两种模式。
 */

import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import type {
  TestSuite, TestCase, CaseResult, AppConfig, TraceAdapter,
} from './types.js';
import { callAgent } from './agent.js';
import { evaluateCriteria, autoDetectFailTags } from './judge.js';
import { getToolChain, hasRecovery } from './trace.js';
import { saveReport } from './report.js';

/**
 * 加载 YAML 测试套件
 *
 * 校验文件存在性和基本结构，失败时抛出明确错误。
 */
export function loadSuite(suitePath: string): TestSuite {
  let raw: string;
  try {
    raw = readFileSync(suitePath, 'utf-8');
  } catch {
    throw new Error(`找不到测试用例文件: ${suitePath}`);
  }

  const data = yaml.load(raw) as TestSuite;
  if (!data?.cases || data.cases.length === 0) {
    throw new Error(`${suitePath} 中没有测试用例（缺少 cases 字段）`);
  }

  return data;
}

/**
 * 执行单条用例（单轮模式）
 */
async function runSingleCase(
  testCase: TestCase,
  config: AppConfig,
  adapter: TraceAdapter | null,
): Promise<CaseResult> {
  const result = await callAgent(testCase.instruction, config, adapter);

  // 判定
  let judgments: Awaited<ReturnType<typeof evaluateCriteria>>;
  let verdict: 'PASS' | 'FAIL';
  let reason = '';

  if (!result.success) {
    verdict = 'FAIL';
    reason = `执行异常: ${result.error}`;
    judgments = [];
  } else {
    judgments = await evaluateCriteria(result, testCase.pass_criteria, config);
    const allPassed = judgments.every((j) => j.passed);
    verdict = allPassed ? 'PASS' : 'FAIL';
    reason = judgments
      .filter((j) => !j.passed)
      .map((j) => j.detail)
      .join('; ');
  }

  // 失败时自动检测 Fail Tag
  const autoFailTags = verdict === 'FAIL'
    ? autoDetectFailTags(result.output, result.error)
    : [];

  // Trace 摘要
  const traceSummary = result.trace
    ? {
        totalSteps: result.trace.totalSteps,
        toolChain: getToolChain(result.trace),
        hasRecovery: hasRecovery(result.trace),
      }
    : undefined;

  return {
    caseId: testCase.id,
    title: testCase.title,
    instruction: testCase.instruction,
    category: testCase.category ?? '',
    verdict,
    reason,
    durationMs: result.durationMs,
    tokenUsage: result.tokenUsage,
    output: result.output,
    judgments,
    autoFailTags,
    trace: traceSummary,
  };
}

/**
 * 执行多轮用例
 *
 * 按 steps 顺序执行，支持 extract 变量提取和 {{variable}} 模板替换。
 * 某步 FAIL 时跳过后续步骤。
 */
async function runMultiTurnCase(
  testCase: TestCase,
  config: AppConfig,
  adapter: TraceAdapter | null,
): Promise<CaseResult> {
  const steps = testCase.steps ?? [];
  const context: Record<string, string> = {};
  const allJudgments: CaseResult['judgments'] = [];
  let overallVerdict: 'PASS' | 'FAIL' = 'PASS';
  let failReason = '';
  let totalDurationMs = 0;
  let totalTokenUsage = 0;
  let lastOutput = '';

  for (const step of steps) {
    // 模板变量替换：{{varName}} → context[varName]
    let instruction = step.instruction;
    for (const [varName, varValue] of Object.entries(context)) {
      instruction = instruction.replaceAll(`{{${varName}}}`, varValue);
    }

    const result = await callAgent(instruction, config, adapter);
    totalDurationMs += result.durationMs;
    totalTokenUsage += result.tokenUsage;
    lastOutput = result.output;

    if (!result.success) {
      overallVerdict = 'FAIL';
      failReason = `步骤 ${step.id} 执行异常: ${result.error}`;
      break;
    }

    // 从回复中提取变量
    if (step.extract) {
      for (const [varName, pattern] of Object.entries(step.extract)) {
        const match = result.output.match(new RegExp(pattern));
        if (match) {
          context[varName] = match[0];
        }
      }
    }

    // 判定该步骤
    const stepJudgments = await evaluateCriteria(result, step.pass_criteria, config);
    allJudgments.push(...stepJudgments);

    const stepPassed = stepJudgments.every((j) => j.passed);
    if (!stepPassed) {
      overallVerdict = 'FAIL';
      failReason = `步骤 ${step.id} 判定失败: ${stepJudgments.filter((j) => !j.passed).map((j) => j.detail).join('; ')}`;
      break;
    }
  }

  return {
    caseId: testCase.id,
    title: testCase.title,
    instruction: testCase.steps?.map((s) => s.instruction).join(' → ') ?? '',
    category: testCase.category ?? '',
    verdict: overallVerdict,
    reason: failReason,
    durationMs: totalDurationMs,
    tokenUsage: totalTokenUsage,
    output: lastOutput,
    judgments: allJudgments,
    autoFailTags: overallVerdict === 'FAIL'
      ? autoDetectFailTags(lastOutput, failReason)
      : [],
  };
}

/** 生成 round ID：round-YYYYMMDD-HHmm */
function makeRoundId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `round-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** sleep 辅助 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── 公共 API ──

export interface RunOptions {
  /** YAML 文件路径 */
  suitePath: string;
  /** 只跑指定用例 ID */
  caseId?: string;
  /** 只预览，不调 API */
  dryRun?: boolean;
  /** 只跑无副作用的用例 */
  safeOnly?: boolean;
}

/**
 * 运行测试套件
 *
 * 主入口。加载 YAML、过滤用例、逐条执行、生成报告。
 */
export async function runEval(
  options: RunOptions,
  config: AppConfig,
  adapter: TraceAdapter | null,
): Promise<void> {
  const suite = loadSuite(options.suitePath);
  let cases = suite.cases;

  // 按 ID 过滤
  if (options.caseId) {
    cases = cases.filter((c) => c.id === options.caseId);
    if (cases.length === 0) {
      throw new Error(`找不到用例 ${options.caseId}`);
    }
  }

  // 只跑无副作用的用例
  if (options.safeOnly) {
    cases = cases.filter((c) => (c.side_effect ?? 'none') === 'none');
    if (cases.length === 0) {
      console.log('没有 side_effect=none 的用例，跳过');
      return;
    }
  }

  const isMultiTurn = suite.mode === 'multi_turn';

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ${suite.skill} — ${cases.length} 条用例${isMultiTurn ? '（多轮模式）' : ''}`);
  console.log(`${'='.repeat(50)}`);

  // Dry-run：只打印用例信息
  if (options.dryRun) {
    for (const c of cases) {
      console.log(`\n  ${c.id}: ${c.title}`);
      console.log(`    指令: ${c.instruction}`);
      console.log(`    类型: ${c.category ?? '-'}`);
      console.log(`    副作用: ${c.side_effect ?? 'none'}`);
      console.log(`    判定条件: ${c.pass_criteria?.length ?? 0} 条`);
      if (c.steps) {
        console.log(`    步骤数: ${c.steps.length}`);
      }
    }
    return;
  }

  // ── 执行测试 ──

  const results: CaseResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    console.log(`\n[${i + 1}/${cases.length}] ${testCase.id}: ${testCase.title}`);
    console.log(`  指令: ${(testCase.instruction ?? '(多轮)').slice(0, 60)}...`);

    const result = (isMultiTurn && testCase.steps)
      ? await runMultiTurnCase(testCase, config, adapter)
      : await runSingleCase(testCase, config, adapter);

    results.push(result);

    // 打印结果
    const icon = result.verdict === 'PASS' ? '✅' : '❌';
    console.log(`  ${icon} ${result.verdict}`);
    if (result.reason) {
      console.log(`  原因: ${result.reason.slice(0, 80)}`);
    }
    if (result.trace) {
      console.log(`  步骤: ${result.trace.totalSteps} | 工具: ${result.trace.toolChain.join(' → ')}`);
    }

    // 请求间隔
    if (i < cases.length - 1) {
      await sleep(config.requestInterval * 1000);
    }
  }

  // ── 保存报告 ──

  const roundId = makeRoundId();
  const reportPath = saveReport(suite.skill, results, roundId, config);

  // 打印汇总
  const passed = results.filter((r) => r.verdict === 'PASS').length;
  const total = results.length;
  const rate = total > 0 ? ((passed / total) * 100).toFixed(0) : '0';
  const avgDur = total > 0
    ? (results.reduce((sum, r) => sum + r.durationMs, 0) / total / 1000).toFixed(1)
    : '0';

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ${suite.skill}: ${passed}/${total} (${rate}%)`);
  console.log(`  平均耗时: ${avgDur}s`);
  console.log(`  报告: ${reportPath}`);
  console.log(`${'='.repeat(50)}\n`);
}
