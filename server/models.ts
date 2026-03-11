/**
 * 平台内置模型列表（硬编码）
 *
 * 切换方式：向 Agent 发送 switchCmd 文本，平台在同一端点内切换模型。
 * 新增 / 删除模型：直接修改此数组，无需改动其他代码。
 */

import type { ModelConfig } from './types.js';

export const MODELS: ModelConfig[] = [
  { id: 'gpt-4o',             switchCmd: '/model gpt-4o' },
  { id: 'gpt-4o-mini',        switchCmd: '/model gpt-4o-mini' },
  { id: 'deepseek-v3',        switchCmd: '/model deepseek-v3' },
  { id: 'deepseek-r1',        switchCmd: '/model deepseek-r1' },
  { id: 'kimi-k2',            switchCmd: '/model kimi-k2' },
  { id: 'claude-3-5-sonnet',  switchCmd: '/model claude-3-5-sonnet' },
];

/** 按 id 列表过滤，保持原始顺序 */
export function filterModels(ids: string[]): ModelConfig[] {
  if (ids.length === 0) return MODELS;
  return ids
    .map((id) => MODELS.find((m) => m.id === id))
    .filter((m): m is ModelConfig => {
      if (!m) return false;
      return true;
    });
}

/** 列出所有可用模型 id */
export function listModelIds(): string[] {
  return MODELS.map((m) => m.id);
}
