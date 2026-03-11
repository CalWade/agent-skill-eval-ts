/**
 * CLI 模式执行器
 *
 * 调用 runService.executeRun()，通过回调将进度输出到 stdout（report.ts 格式化）。
 * 不包含任何执行逻辑，只做 stdout 适配。
 */

import { executeRun, type RunConfig } from './services/runService.js';
import { printModelHeader, printCaseResult, printModelSummary } from './report.js';
import type { ModelConfig, TestCase, CaseModelResult } from './types.js';

export { RunConfig };

/** CLI 入口：跑完所有模型所有用例，返回全量结果 */
export async function runAll(
  models: ModelConfig[],
  cases: TestCase[],
  config: RunConfig,
): Promise<CaseModelResult[]> {
  // 预建 caseId → TestCase 映射，供 onCaseResult 回调查原始 instruction
  const caseMap = new Map<string, TestCase>(cases.map((c) => [c.id, c]));
  // 每个模型的结果暂存，用于打印小结
  const modelResultsMap = new Map<string, CaseModelResult[]>();
  for (const m of models) modelResultsMap.set(m.id, []);

  return executeRun(models, cases, config, {
    onModelStart: (modelId, index, total) => {
      printModelHeader(modelId, index + 1, total);
      process.stdout.write(`  切换模型: `);
    },
    onSwitch: (_modelId, cmd) => {
      process.stdout.write(`${cmd} ... `);
    },
    onSwitchOk: (_modelId, durationMs) => {
      process.stdout.write(`OK（${(durationMs / 1000).toFixed(1)}s）\n`);
    },
    onSwitchFail: (_modelId, error) => {
      process.stdout.write(`失败: ${error}\n`);
    },
    onCaseResult: (r) => {
      const c = caseMap.get(r.caseId) ?? { id: r.caseId, title: r.caseTitle, instruction: '' };
      printCaseResult(c, r);
      modelResultsMap.get(r.modelId)?.push(r);
    },
    onModelDone: (modelId) => {
      const results = modelResultsMap.get(modelId) ?? [];
      printModelSummary(modelId, results);
    },
  });
}
