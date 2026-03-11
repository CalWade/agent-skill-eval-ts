/**
 * 判定引擎
 *
 * 仅支持三种简单判定类型，不做 LLM-as-Judge 或三层递进。
 * 没有 pass_criteria 的用例直接返回 DISPLAY。
 */

import type { PassCriteria, Verdict } from './types.js';

export interface JudgeResult {
  verdict: Verdict;
  failReasons: string[];
}

export function judge(output: string, criteria: PassCriteria[] | undefined): JudgeResult {
  if (!criteria || criteria.length === 0) {
    return { verdict: 'DISPLAY', failReasons: [] };
  }

  const failReasons: string[] = [];

  for (const c of criteria) {
    switch (c.type) {
      case 'output_contains':
        if (!output.includes(c.text)) {
          failReasons.push(`回复未包含: "${c.text}"`);
        }
        break;

      case 'output_not_contains':
        if (output.includes(c.text)) {
          failReasons.push(`回复不应包含: "${c.text}"`);
        }
        break;

      case 'output_contains_any': {
        const hit = c.texts.some((t) => output.includes(t));
        if (!hit) {
          failReasons.push(`回复未包含以下任意文本: [${c.texts.map((t) => `"${t}"`).join(', ')}]`);
        }
        break;
      }
    }
  }

  return {
    verdict: failReasons.length === 0 ? 'PASS' : 'FAIL',
    failReasons,
  };
}
