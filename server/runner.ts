/**
 * 多模型串行执行器
 *
 * 流程：
 *   对每个模型：
 *     1. 新建会话（conversation_id 置空）
 *     2. 发送 switchCmd 切换模型，等待确认
 *     3. 逐条执行用例（单轮无状态）
 *     4. 打印该模型小结
 *   所有模型跑完后返回完整结果列表。
 */

import { callAgent, type AgentConfig } from './agent.js';
import { judge } from './judge.js';
import { printModelHeader, printCaseResult, printModelSummary } from './report.js';
import type { ModelConfig, TestCase, CaseModelResult } from './types.js';

export interface RunnerConfig {
  agent: AgentConfig;
  /** 用例间等待毫秒数（防限频） */
  intervalMs: number;
  /** 切换模型后等待毫秒数（等平台确认切换） */
  switchWaitMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 对单个模型跑完所有用例。
 * 返回该模型所有用例的结果列表。
 */
async function runModel(
  model: ModelConfig,
  cases: TestCase[],
  config: RunnerConfig,
  modelIndex: number,
  totalModels: number,
): Promise<CaseModelResult[]> {
  printModelHeader(model.id, modelIndex, totalModels);

  // 切换模型：发送 switchCmd，等待平台确认，不记入测试结果
  process.stdout.write(`  切换模型: ${model.switchCmd} ... `);
  const switchResult = await callAgent(model.switchCmd, config.agent);
  if (switchResult.success) {
    process.stdout.write(`OK（${(switchResult.durationMs / 1000).toFixed(1)}s）\n`);
  } else {
    process.stdout.write(`失败: ${switchResult.error ?? '未知错误'}\n`);
    // 切换失败时，该模型所有用例标记为 FAIL
    return cases.map((c) => ({
      caseId: c.id,
      caseTitle: c.title,
      modelId: model.id,
      call: switchResult,
      verdict: 'FAIL' as const,
      failReasons: [`模型切换失败: ${switchResult.error ?? '未知错误'}`],
    }));
  }

  // 切换后等待
  if (config.switchWaitMs > 0) {
    await sleep(config.switchWaitMs);
  }

  const results: CaseModelResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const callResult = await callAgent(testCase.instruction, config.agent);
    const { verdict, failReasons } = judge(callResult.output, testCase.pass_criteria);

    const caseResult: CaseModelResult = {
      caseId: testCase.id,
      caseTitle: testCase.title,
      modelId: model.id,
      call: callResult,
      verdict,
      failReasons,
    };

    results.push(caseResult);
    printCaseResult(testCase, caseResult);

    // 用例间等待（最后一条不等）
    if (i < cases.length - 1 && config.intervalMs > 0) {
      await sleep(config.intervalMs);
    }
  }

  printModelSummary(model.id, results);
  return results;
}

/**
 * 主执行入口。
 * 依次对每个模型跑完所有用例，返回全量结果。
 */
export async function runAll(
  models: ModelConfig[],
  cases: TestCase[],
  config: RunnerConfig,
): Promise<CaseModelResult[]> {
  const allResults: CaseModelResult[] = [];

  for (let i = 0; i < models.length; i++) {
    const modelResults = await runModel(models[i], cases, config, i + 1, models.length);
    allResults.push(...modelResults);

    // 模型间等待（最后一个不等）
    if (i < models.length - 1 && config.intervalMs > 0) {
      await sleep(config.intervalMs);
    }
  }

  return allResults;
}
