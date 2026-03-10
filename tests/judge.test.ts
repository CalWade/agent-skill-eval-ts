/**
 * 判定引擎单元测试
 *
 * 重点测试否定上下文感知和各判定类型的基本行为。
 */

import { describe, it, expect } from 'vitest';
import { evaluateCriteria, autoDetectFailTags } from '../src/judge.js';
import type { AgentResult, PassCriteria, AppConfig } from '../src/types.js';

/** 构造最小 AgentResult 用于测试 */
function makeResult(output: string): AgentResult {
  return {
    success: true,
    output,
    durationMs: 1000,
    tokenUsage: 100,
    finishReason: 'stop',
    responseId: '',
    error: null,
    trace: null,
  };
}

/** 最小配置（不配置裁判 LLM） */
const config: AppConfig = {
  agentApiUrl: '',
  agentApiKey: '',
  agentModel: '',
  agentExtraBody: {},
  requestInterval: 0,
  maxRetries: 0,
  judgeApiUrl: '',
  judgeApiKey: '',
  judgeModel: '',
  traceAdapter: 'none',
  resultsDir: '',
};

describe('否定上下文感知', () => {
  const criteria: PassCriteria[] = [{
    type: 'semantic_success',
    description: '消息成功发送',
    keywords: ['成功', '已发送', '发送成功'],
  }];

  it('正面上下文中的关键词应该命中', async () => {
    const result = makeResult('消息已成功发送给韦贺文');
    const judgments = await evaluateCriteria(result, criteria, config);
    expect(judgments[0].passed).toBe(true);
  });

  it('否定上下文中的关键词不应该命中', async () => {
    const result = makeResult('很抱歉，给黄威健发消息失败了，系统提示没有权限，但测试文档创建成功。');
    const judgments = await evaluateCriteria(result, criteria, config);
    // "成功"出现在"失败"之后的另一个子句中，但"发送成功"和"已发送"都没出现
    // "成功"前30字符内有"失败"，应该被否定上下文过滤掉
    // 注意：这取决于"成功"距离"失败"的字符距离
    expect(judgments[0].passed).toBe(false);
  });

  it('独立的成功表述应该命中', async () => {
    const result = makeResult('✅ 消息已发送，message_id: msg_xxx');
    const judgments = await evaluateCriteria(result, criteria, config);
    expect(judgments[0].passed).toBe(true);
  });
});

describe('output_contains', () => {
  it('包含目标文本时 PASS', async () => {
    const result = makeResult('返回 open_id: ou_abc123');
    const criteria: PassCriteria[] = [{ type: 'output_contains', text: 'ou_' }];
    const judgments = await evaluateCriteria(result, criteria, config);
    expect(judgments[0].passed).toBe(true);
  });

  it('不包含目标文本时 FAIL', async () => {
    const result = makeResult('未找到该用户');
    const criteria: PassCriteria[] = [{ type: 'output_contains', text: 'ou_' }];
    const judgments = await evaluateCriteria(result, criteria, config);
    expect(judgments[0].passed).toBe(false);
  });
});

describe('output_not_contains', () => {
  it('不包含时 PASS', async () => {
    const result = makeResult('用户未找到');
    const criteria: PassCriteria[] = [{ type: 'output_not_contains', text: 'ou_fake' }];
    const judgments = await evaluateCriteria(result, criteria, config);
    expect(judgments[0].passed).toBe(true);
  });
});

describe('output_contains_any', () => {
  it('包含任一时 PASS', async () => {
    const result = makeResult('任务已完成');
    const criteria: PassCriteria[] = [
      { type: 'output_contains_any', texts: ['成功', '完成', 'done'] },
    ];
    const judgments = await evaluateCriteria(result, criteria, config);
    expect(judgments[0].passed).toBe(true);
  });
});

describe('output_matches_regex', () => {
  it('正则匹配时 PASS', async () => {
    const result = makeResult('消息发送完成，耗时 2s');
    const criteria: PassCriteria[] = [
      { type: 'output_matches_regex', pattern: '(发送|消息).*(完成|成功)' },
    ];
    const judgments = await evaluateCriteria(result, criteria, config);
    expect(judgments[0].passed).toBe(true);
  });
});

describe('duration_le', () => {
  it('耗时在阈值内 PASS', async () => {
    const result = makeResult('ok');
    result.durationMs = 5000;
    const criteria: PassCriteria[] = [{ type: 'duration_le', value: 10 }];
    const judgments = await evaluateCriteria(result, criteria, config);
    expect(judgments[0].passed).toBe(true);
  });

  it('耗时超过阈值 FAIL', async () => {
    const result = makeResult('ok');
    result.durationMs = 35000;
    const criteria: PassCriteria[] = [{ type: 'duration_le', value: 30 }];
    const judgments = await evaluateCriteria(result, criteria, config);
    expect(judgments[0].passed).toBe(false);
  });
});

describe('autoDetectFailTags', () => {
  it('检测到权限错误码时标记 F3', () => {
    const tags = autoDetectFailTags('错误码 99991672，权限不足', null);
    expect(tags).toContain('F3');
  });

  it('检测到超时时标记 F5', () => {
    const tags = autoDetectFailTags('', 'timeout');
    expect(tags).toContain('F5');
  });

  it('无特征时返回空数组', () => {
    const tags = autoDetectFailTags('正常回复', null);
    expect(tags).toEqual([]);
  });
});
