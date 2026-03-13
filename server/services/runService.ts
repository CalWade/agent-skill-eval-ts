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
import { getDefaultModel, switchModel, backupWorkspace, restoreWorkspace, resetFromBackup } from './openclawService.js';
import type { ModelConfig, TestCase, TestSuite, CaseModelResult, EvalReport } from '../types.js';

function localTimeStr() {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function log(msg: string) {
  console.log(`[run][${localTimeStr()}] ${msg}`);
}

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
/** 补全 TestCase 缺省字段，保证执行层 id/title 始终是字符串 */
type NormalizedCase = Omit<TestCase, 'id' | 'title'> & { id: string; title: string };

function normalizeCases(cases: TestCase[]): NormalizedCase[] {
  return cases.map((c, i) => ({
    ...c,
    id: c.id ?? String(i + 1),
    title: c.title ?? c.instruction.slice(0, 40),
  }));
}

export async function executeRun(
  models: ModelConfig[],
  rawCases: TestCase[],
  config: RunConfig,
  callbacks: RunCallbacks = {},
): Promise<CaseModelResult[]> {
  const cases = normalizeCases(rawCases);
  const allResults: CaseModelResult[] = [];
  const isLocal = config.agent.mode === 'local';
  const runId = config.runId ?? Date.now().toString(36);

  log(`executeRun start  mode=${isLocal ? 'local' : 'cloud'}  models=${models.length}  cases=${cases.length}  runId=${runId}`);

  // local 模式：记录初始默认模型，测试结束后恢复
  let originalModel = '';
  if (isLocal) {
    try {
      originalModel = await getDefaultModel();
      log(`original model: ${originalModel}`);
    } catch (err) {
      log(`warn: failed to read current model: ${(err as Error).message}`);
    }
  }

  // 第一个模型开始前备份一次 workspace（作为所有模型还原的基准）
  let initialBackupDir = '';
  if (isLocal) {
    try {
      initialBackupDir = backupWorkspace(`${runId}-init`);
      log(`initial workspace backed up`);
    } catch (err) {
      log(`warn: workspace backup failed: ${(err as Error).message}`);
    }
  }

  try {
  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    log(`model [${mi + 1}/${models.length}] ${model.id}`);
    callbacks.onModelStart?.(model.id, mi, models.length);

    if (isLocal) {
      // 每个模型测试前还原到初始 workspace 快照（所有模型从同一起点出发）
      if (initialBackupDir) {
        try {
          resetFromBackup(initialBackupDir);
          log(`workspace reset for model [${mi + 1}/${models.length}]`);
        } catch (err) {
          log(`warn: workspace reset failed: ${(err as Error).message}`);
        }
      }

      // 切换 OpenClaw 默认模型
      if (model.id.includes('/')) {
        const switchStart = Date.now();
        try {
          await switchModel(model.id);
          callbacks.onSwitchOk?.(model.id, Date.now() - switchStart);
        } catch (err) {
          const msg = (err as Error).message;
          log(`model ${model.id}: switch FAILED: ${msg}`);
          callbacks.onSwitchFail?.(model.id, msg);
          for (const c of cases) {
            const r: CaseModelResult = {
              caseId: c.id, caseTitle: c.title, modelId: model.id,
              call: { success: false, output: '', durationMs: 0, promptTokens: null, completionTokens: null, totalTokens: null, finishReason: 'error', error: msg },
              verdict: 'FAIL', failReasons: [`模型切换失败: ${msg}`],
            };
            allResults.push(r);
            callbacks.onCaseResult?.(r);
          }
          continue;
        }
      } else {
        log(`model ${model.id}: no provider/modelId format, using current default`);
        callbacks.onSwitchOk?.(model.id, 0);
      }
    } else {
      // cloud 模式：发送 switchCmd 消息切换模型
      log(`model ${model.id}: sending switchCmd: ${model.switchCmd}`);
      callbacks.onSwitch?.(model.id, model.switchCmd);
      const switchResult = await callAgent(model.switchCmd, config.agent);

      if (!switchResult.success) {
        log(`model ${model.id}: switchCmd FAILED: ${switchResult.error}`);
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

      log(`model ${model.id}: switchCmd OK (${switchResult.durationMs}ms), waiting ${config.switchWaitMs}ms`);
      callbacks.onSwitchOk?.(model.id, switchResult.durationMs);
      if (config.switchWaitMs > 0) await sleep(config.switchWaitMs);
    }

    for (let ci = 0; ci < cases.length; ci++) {
      const c = cases[ci];
      log(`  case [${ci + 1}/${cases.length}] id=${c.id}  "${c.title}"`);
      callbacks.onCaseStart?.(model.id, c.id, c.title, ci, cases.length);

      // local 模式：注入独立 sessionKey
      const agentConfig = isLocal
        ? { ...config.agent, sessionKey: `eval:${runId}:${model.id}:${c.id}` }
        : config.agent;

      const callResult = await callAgent(c.instruction, agentConfig);
      const { verdict, failReasons } = judge(callResult.output, c.pass_criteria);

      log(`  case ${c.id}: verdict=${verdict}  duration=${callResult.durationMs}ms${!callResult.success ? `  error=${callResult.error}` : ''}${failReasons.length ? `  failReasons=${JSON.stringify(failReasons)}` : ''}`);

      const r: CaseModelResult = {
        caseId: c.id, caseTitle: c.title, modelId: model.id,
        call: callResult, verdict, failReasons,
      };
      allResults.push(r);
      callbacks.onCaseResult?.(r);

      if (ci < cases.length - 1 && config.intervalMs > 0) {
        log(`  waiting intervalMs=${config.intervalMs}ms before next case`);
        await sleep(config.intervalMs);
      }
    }

    log(`model ${model.id}: done`);
    callbacks.onModelDone?.(model.id);
    if (mi < models.length - 1 && config.intervalMs > 0) {
      log(`waiting intervalMs=${config.intervalMs}ms before next model`);
      await sleep(config.intervalMs);
    }
  }

  log(`executeRun done  total results=${allResults.length}`);

  } finally {
    if (isLocal) {
      // 恢复原始默认模型
      if (originalModel) {
        try {
          await switchModel(originalModel);
          log(`restored model to ${originalModel}`);
        } catch (err) {
          log(`warn: failed to restore model: ${(err as Error).message}`);
        }
      }
      // 还原 workspace 到测试前状态，并清理备份
      if (initialBackupDir) {
        try {
          restoreWorkspace(initialBackupDir);
          log(`workspace restored to pre-test state`);
        } catch (err) {
          log(`warn: workspace restore failed: ${(err as Error).message}`);
        }
      }
    }
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
    skill: suite.skill ?? '',
    description: suite.description ?? '',
    timestamp: (() => {
      const d = new Date();
      const pad = (n: number, len = 2) => String(n).padStart(len, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`;
    })(),
    modelIds: models.map((m) => m.id),
    cases: suite.cases.map((c, i) => ({
      id: c.id ?? String(i + 1),
      title: c.title ?? c.instruction.slice(0, 40),
      instruction: c.instruction,
      sideEffect: c.side_effect ?? 'none',
    })),
    results,
  };
}
