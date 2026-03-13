/**
 * 测试执行核心服务
 *
 * 消除 api.ts（SSE 路由）与 runner.ts（CLI）之间的逻辑重复。
 * 通过回调接口解耦进度输出，调用方决定输出到 SSE 还是 stdout。
 *
 * local 模式行为：
 * - 跳过 switchCmd（不发切换消息）
 * - 每次调用携带独立 sessionKey：eval:{runId}:{modelId}:{caseId}
 *   保证模型间、用例间、测试批次间上下文完全隔离
 */

import { callAgent, type AgentConfig } from '../agent.js';
import { judge } from '../judge.js';
import type { ModelConfig, TestCase, TestSuite, CaseModelResult, EvalReport } from '../types.js';

export interface RunConfig {
  agent: AgentConfig;
  intervalMs: number;
  /** cloud 模式专用，local 模式忽略 */
  switchWaitMs: number;
  /** local 模式专用：本次测试批次唯一 ID，用于构造 sessionKey */
  runId?: string;
}

/** 进度回调接口，调用方按需实现（SSE / stdout / 无输出） */
export interface RunCallbacks {
  onModelStart?: (modelId: string, index: number, total: number) => void;
  onSwitch?: (modelId: string, cmd: string) => void;
  onSwitchOk?: (modelId: string, durationMs: number) => void;
  onSwitchFail?: (modelId: string, error: string) => void;
  onCaseStart?: (modelId: string, caseId: string, caseTitle: string, index: number, total: number) => void;
  onCaseResult?: (result: CaseModelResult) => void;
  onModelDone?: (modelId: string) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 核心执行引擎：串行多模型 × 用例。
 * 返回所有结果，同时通过回调实时通知进度。
 *
 * cloud 模式：发 switchCmd 消息切换模型，等待 switchWaitMs
 * local 模式：跳过切换步骤，每个用例携带独立 sessionKey 隔离上下文
 */
export async function executeRun(
  models: ModelConfig[],
  cases: TestCase[],
  config: RunConfig,
  callbacks: RunCallbacks = {},
): Promise<CaseModelResult[]> {
  const allResults: CaseModelResult[] = [];
  const isLocal = config.agent.mode === 'local';
  const runId = config.runId ?? Date.now().toString(36);

  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    callbacks.onModelStart?.(model.id, mi, models.length);

    if (isLocal) {
      // local 模式：无需切换，直接运行用例
      callbacks.onSwitchOk?.(model.id, 0);
    } else {
      // cloud 模式：发送 switchCmd 消息切换模型
      callbacks.onSwitch?.(model.id, model.switchCmd);
      const switchResult = await callAgent(model.switchCmd, config.agent);

      if (!switchResult.success) {
        callbacks.onSwitchFail?.(model.id, switchResult.error ?? '未知错误');
        for (const c of cases) {
          const r: CaseModelResult = {
            caseId: c.id, caseTitle: c.title, modelId: model.id,
            call: switchResult, verdict: 'FAIL',
            failReasons: [`模型切换失败: ${switchResult.error ?? '未知错误'}`],
          };
          allResults.push(r);
          callbacks.onCaseResult?.(r);
        }
        continue;
      }

      callbacks.onSwitchOk?.(model.id, switchResult.durationMs);
      if (config.switchWaitMs > 0) await sleep(config.switchWaitMs);
    }

    for (let ci = 0; ci < cases.length; ci++) {
      const c = cases[ci];
      callbacks.onCaseStart?.(model.id, c.id, c.title, ci, cases.length);

      // local 模式：每次调用注入独立 sessionKey + localModelId
      const agentConfig = isLocal
        ? {
            ...config.agent,
            localModelId: model.localModelId,
            sessionKey: `eval:${runId}:${model.id}:${c.id}`,
          }
        : config.agent;

      const callResult = await callAgent(c.instruction, agentConfig);
      const { verdict, failReasons } = judge(callResult.output, c.pass_criteria);

      const r: CaseModelResult = {
        caseId: c.id, caseTitle: c.title, modelId: model.id,
        call: callResult, verdict, failReasons,
      };
      allResults.push(r);
      callbacks.onCaseResult?.(r);

      if (ci < cases.length - 1 && config.intervalMs > 0) await sleep(config.intervalMs);
    }

    callbacks.onModelDone?.(model.id);
    if (mi < models.length - 1 && config.intervalMs > 0) await sleep(config.intervalMs);
  }

  return allResults;
}

/** 根据用例列表和结果列表构建最终报告结构 */
export function buildReport(
  suite: TestSuite,
  models: ModelConfig[],
  results: CaseModelResult[],
): EvalReport {
  return {
    skill: suite.skill,
    description: suite.description ?? '',
    timestamp: new Date().toISOString(),
    modelIds: models.map((m) => m.id),
    cases: suite.cases.map((c) => ({
      id: c.id, title: c.title,
      instruction: c.instruction,
      sideEffect: c.side_effect ?? 'none',
    })),
    results,
  };
}
