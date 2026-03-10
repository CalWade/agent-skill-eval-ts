/**
 * Trace 工具函数单元测试
 */

import { describe, it, expect } from 'vitest';
import { getUniqueTools, getToolChain, hasRecovery, calcD3, calcCombinedScore } from '../src/trace.js';
import type { AgentTrace } from '../src/types.js';

function makeTrace(calls: Array<{ name: string; errorCode?: number }>): AgentTrace {
  return {
    toolCalls: calls.map((c, i) => ({
      stepIndex: i,
      toolName: c.name,
      arguments: {},
      durationMs: 100,
      errorCode: c.errorCode,
    })),
    totalSteps: calls.length,
    totalTokens: 0,
    thinkingContent: '',
  };
}

describe('getUniqueTools', () => {
  it('去重返回工具名', () => {
    const trace = makeTrace([
      { name: 'get_token' },
      { name: 'send_message' },
      { name: 'get_token' },
    ]);
    expect(getUniqueTools(trace)).toEqual(['get_token', 'send_message']);
  });
});

describe('getToolChain', () => {
  it('按顺序返回调用链', () => {
    const trace = makeTrace([
      { name: 'get_token' },
      { name: 'search_contact' },
      { name: 'send_message' },
    ]);
    expect(getToolChain(trace)).toEqual(['get_token', 'search_contact', 'send_message']);
  });
});

describe('hasRecovery', () => {
  it('无错误时返回 false', () => {
    const trace = makeTrace([{ name: 'send_message' }]);
    expect(hasRecovery(trace)).toBe(false);
  });

  it('有错误且后续有成功时返回 true', () => {
    const trace = makeTrace([
      { name: 'send_message', errorCode: 99991672 },
      { name: 'setup_permission' },
      { name: 'send_message' },
    ]);
    expect(hasRecovery(trace)).toBe(true);
  });

  it('有错误但后续无成功时返回 false', () => {
    const trace = makeTrace([
      { name: 'send_message' },
      { name: 'send_message', errorCode: 500 },
    ]);
    expect(hasRecovery(trace)).toBe(false);
  });
});

describe('calcD3', () => {
  it('无错误时返回 null score', () => {
    const trace = makeTrace([{ name: 'send_message' }]);
    expect(calcD3(trace).score).toBeNull();
  });

  it('全部恢复时返回 100', () => {
    const trace = makeTrace([
      { name: 'send_message', errorCode: 403 },
      { name: 'send_message' },
    ]);
    expect(calcD3(trace).score).toBe(100);
  });

  it('部分恢复时返回比例', () => {
    const trace = makeTrace([
      { name: 'send_message', errorCode: 403 },
      { name: 'create_doc', errorCode: 500 },
      { name: 'send_message' },
    ]);
    const d3 = calcD3(trace);
    expect(d3.score).toBe(50);
    expect(d3.recovered).toBe(1);
    expect(d3.errorsTotal).toBe(2);
  });
});

describe('calcCombinedScore', () => {
  it('D3=0 时综合分为 0', () => {
    expect(calcCombinedScore(0, 10, 3)).toBe(0);
  });

  it('D3=100 且步骤最优时综合分为 100', () => {
    expect(calcCombinedScore(100, 3, 3)).toBe(100);
  });

  it('D3=100 但步骤膨胀时综合分在 60~100 之间', () => {
    const score = calcCombinedScore(100, 52, 3);
    expect(score).toBeGreaterThan(60);
    expect(score).toBeLessThan(100);
  });
});
