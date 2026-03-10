/**
 * Trace 工具函数
 *
 * 基于 AgentTrace 数据结构计算 D2（步骤效率）、D3（错误恢复率）、D5（上下文消耗）等指标。
 */

import type { AgentTrace } from './types.js';

/**
 * 获取本次执行中调用过的所有工具名（去重）
 */
export function getUniqueTools(trace: AgentTrace): string[] {
  return [...new Set(trace.toolCalls.map((tc) => tc.toolName))];
}

/**
 * 获取工具调用链（按执行顺序排列的工具名列表）
 */
export function getToolChain(trace: AgentTrace): string[] {
  return trace.toolCalls.map((tc) => tc.toolName);
}

/**
 * 获取所有出错的步骤
 */
export function getErrorSteps(trace: AgentTrace) {
  return trace.toolCalls.filter((tc) => tc.errorCode !== undefined);
}

/**
 * 判断是否发生了错误恢复
 *
 * 逻辑：存在出错步骤，且在最后一个出错步骤之后仍有成功步骤
 */
export function hasRecovery(trace: AgentTrace): boolean {
  const errors = getErrorSteps(trace);
  if (errors.length === 0) return false;

  const lastErrorIdx = Math.max(...errors.map((tc) => tc.stepIndex));
  return trace.toolCalls.some(
    (tc) => tc.stepIndex > lastErrorIdx && tc.errorCode === undefined,
  );
}

/**
 * 计算 D3 错误恢复率
 *
 * 对每个出错步骤，检查同名工具后续是否有成功调用。
 * 未触发错误时返回 null（D3 不适用）。
 */
export function calcD3(trace: AgentTrace): {
  score: number | null;
  errorsTotal: number;
  recovered: number;
} {
  const errors = getErrorSteps(trace);
  if (errors.length === 0) {
    return { score: null, errorsTotal: 0, recovered: 0 };
  }

  let recovered = 0;
  for (const err of errors) {
    const laterSuccess = trace.toolCalls.some(
      (tc) =>
        tc.stepIndex > err.stepIndex &&
        tc.toolName === err.toolName &&
        tc.errorCode === undefined,
    );
    if (laterSuccess) recovered++;
  }

  return {
    score: (recovered / errors.length) * 100,
    errorsTotal: errors.length,
    recovered,
  };
}

/**
 * 计算 D3 × D5 联动综合分
 *
 * D3 是前提条件，D5 是效率修正：
 *   combined = D3 × (0.6 + 0.4 × D5 / 100)
 *
 * 恢复失败（D3=0）→ 综合分=0，无论效率多高
 * 恢复成功（D3=100）→ 综合分在 60~100 之间，由步骤效率调节
 */
export function calcCombinedScore(
  d3Score: number,
  actualSteps: number,
  minSteps: number,
): number {
  const d5Score = Math.min(1, minSteps / Math.max(actualSteps, 1)) * 100;
  if (d3Score === 0) return 0;
  return d3Score * (0.6 + 0.4 * d5Score / 100);
}
