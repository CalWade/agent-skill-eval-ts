/**
 * 模型列表管理
 *
 * 统一入口：读取 models.json（用户自定义）→ 回退到硬编码默认值。
 * 消除了 api.ts 和 models.ts 的双重模型获取逻辑。
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MODELS as DEFAULT_MODELS } from '../models.js';
import type { ModelConfig } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODELS_PATH = join(resolve(__dirname, '../..'), 'models.json');

export interface ModelsFile {
  prefix: string;
  ids: string[];
  /**
   * local 模式专用：id → OpenClaw model 字段值的映射
   * 格式 "providerId/modelId"，如 "custom-coding-dashscope-aliyuncs-com/qwen3.5-plus"
   */
  localModels?: Record<string, string>;
}

const DEFAULT_PREFIX = '/model';

/** 读取 models.json 原始数据（供前端编辑回显） */
export function readModelsFile(): ModelsFile {
  if (existsSync(MODELS_PATH)) {
    try {
      return JSON.parse(readFileSync(MODELS_PATH, 'utf-8')) as ModelsFile;
    } catch { /* 解析失败则回退 */ }
  }
  return { prefix: DEFAULT_PREFIX, ids: DEFAULT_MODELS.map((m) => m.id) };
}

/** 获取可执行的模型配置列表（供测试运行器使用） */
export function getModels(): ModelConfig[] {
  if (existsSync(MODELS_PATH)) {
    try {
      const file = JSON.parse(readFileSync(MODELS_PATH, 'utf-8')) as ModelsFile;
      return file.ids.map((id) => ({
        id,
        switchCmd: `${file.prefix} ${id}`,
        localModelId: file.localModels?.[id],
      }));
    } catch { /* 解析失败则回退 */ }
  }
  return DEFAULT_MODELS;
}

/** 按 id 列表过滤模型，保持原始顺序 */
export function filterModels(ids: string[]): ModelConfig[] {
  if (ids.length === 0) return getModels();
  const all = getModels();
  return ids
    .map((id) => all.find((m) => m.id === id))
    .filter((m): m is ModelConfig => !!m);
}

/** 保存模型列表到 models.json */
export function saveModelsFile(file: ModelsFile): void {
  const cleanIds = file.ids.map((id) => id.trim()).filter(Boolean);
  const clean: ModelsFile = {
    prefix: file.prefix.trim(),
    ids: cleanIds,
  };
  // 只保留有效 id 对应的 localModels 条目
  if (file.localModels) {
    const localModels: Record<string, string> = {};
    for (const id of cleanIds) {
      const v = file.localModels[id]?.trim();
      if (v) localModels[id] = v;
    }
    if (Object.keys(localModels).length > 0) clean.localModels = localModels;
  }
  writeFileSync(MODELS_PATH, JSON.stringify(clean, null, 2), 'utf-8');
}
