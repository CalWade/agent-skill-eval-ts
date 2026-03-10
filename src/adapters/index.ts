/**
 * Trace 适配器注册中心
 *
 * 根据配置中的 TRACE_ADAPTER 值返回对应的适配器实例。
 * 新增平台支持时只需：1. 新建 adapter 文件  2. 在此注册
 */

import type { TraceAdapter } from '../types.js';
import { OpenAIAdapter } from './openai.js';

/**
 * 根据适配器名称获取实例
 *
 * @param name - 适配器类型：'openai' | 'openclaw' | 'none'
 * @returns 适配器实例，'none' 时返回 null（退化为纯结果断言模式）
 */
export function getAdapter(name: string): TraceAdapter | null {
  switch (name) {
    case 'openai':
      return new OpenAIAdapter();
    // TODO: case 'openclaw': return new OpenClawAdapter();
    case 'none':
    default:
      return null;
  }
}
