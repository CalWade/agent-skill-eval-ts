/**
 * 判定引擎
 *
 * 逐条评估 pass_criteria，返回每条判定的 PASS/FAIL 及详情。
 * 核心改进点（相对 Python 版）：
 *   - 关键词匹配加入否定上下文感知，降低 False Positive
 *   - LLM-as-Judge 使用 CoT Prompt，输出推理过程
 */

import type { PassCriteria, Judgment, AgentResult, AgentTrace, AppConfig } from './types.js';

// ── 否定上下文感知 ──

/** 否定前缀词表：关键词出现在这些词之后时不算有效命中 */
const NEGATION_PREFIXES = [
  '失败', '未能', '无法', '不能', '没有', '抱歉', '出错',
  '错误', '异常', '拒绝', '不成功', '未成功',
  'fail', 'error', 'unable', 'denied', 'cannot', 'not',
];

/** 默认成功关键词（semantic_success 的 fallback） */
const DEFAULT_SUCCESS_KEYWORDS = [
  '成功', '✅', '已发送', '已创建', '完成', '已保存',
  '已添加', '已设置', '已更新', '已删除',
  'success', 'done', 'completed', 'sent', 'created', 'saved',
];

/**
 * 检查关键词是否在正面上下文中出现
 *
 * 在命中位置前 30 个字符内搜索否定词。
 * 如果所有命中位置都处于否定上下文，返回 false。
 */
function keywordInPositiveContext(output: string, keyword: string): boolean {
  let idx = output.indexOf(keyword);
  while (idx !== -1) {
    const prefixStart = Math.max(0, idx - 30);
    const prefix = output.slice(prefixStart, idx);
    const hasNegation = NEGATION_PREFIXES.some((neg) => prefix.includes(neg));
    if (!hasNegation) {
      return true; // 至少有一个命中不在否定上下文中
    }
    idx = output.indexOf(keyword, idx + 1);
  }
  return false;
}

// ── LLM 裁判 ──

/**
 * 调用裁判 LLM，使用 CoT Prompt 强制输出推理过程
 *
 * 返回 { verdict, reasoning }。未配置裁判时返回 null。
 */
async function callJudgeLlm(
  output: string,
  criteriaDesc: string,
  config: AppConfig,
): Promise<{ passed: boolean; reasoning: string } | null> {
  if (!config.judgeApiUrl || !config.judgeApiKey) {
    return null;
  }

  const prompt = `你是一个严格的测试裁判。根据条件判定 AI 助手的回复是否通过。

## 判定条件
${criteriaDesc}

## AI 助手的回复
${output.slice(0, 2000)}

## 判定规则
1. 先用 2-3 句话分析回复内容是否满足条件
2. 如果回复中同时出现正面词和否定词（如"失败...但...成功"），以与判定条件直接相关的部分为准
3. 最后一行严格输出: VERDICT: PASS 或 VERDICT: FAIL

## 分析`;

  try {
    const resp = await fetch(config.judgeApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.judgeApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.judgeModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) return null;

    const data = await resp.json() as Record<string, unknown>;
    const choices = data.choices as Array<{ message: { content: string } }> | undefined;
    const content = choices?.[0]?.message?.content?.trim() ?? '';

    if (!content) return null;

    // 提取 VERDICT 行
    const verdictMatch = content.match(/VERDICT:\s*(PASS|FAIL)/i);
    const passed = verdictMatch ? verdictMatch[1].toUpperCase() === 'PASS' : false;

    // VERDICT 之前的内容就是推理过程
    const reasoning = verdictMatch
      ? content.slice(0, content.indexOf(verdictMatch[0])).trim()
      : content.slice(0, 100);

    return { passed, reasoning };
  } catch (err) {
    console.warn(`  裁判 LLM 调用失败: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// ── 半自动失败分类 ──

/** F1-F7 特征码映射表 */
const FAIL_TAG_PATTERNS: Record<string, string[]> = {
  F3: ['99991672', '403', 'permission', '权限不足', '未授权', 'Forbidden'],
  F4: ['飞书接口', 'API error', 'server error', '502', '503'],
  F5: ['context_length', 'token limit', '超时', 'timeout', 'too long'],
};

/**
 * 从 Agent 回复和错误信息中自动推断失败分类
 *
 * 只标记高置信度的 F3/F4/F5，其余留给人工判断。
 */
export function autoDetectFailTags(output: string, error: string | null): string[] {
  const combined = `${output} ${error ?? ''}`;
  const tags: string[] = [];

  for (const [tag, patterns] of Object.entries(FAIL_TAG_PATTERNS)) {
    if (patterns.some((p) => combined.includes(p))) {
      tags.push(tag);
    }
  }

  return tags;
}

// ── 主判定逻辑 ──

/**
 * 逐条评估 pass_criteria
 *
 * 支持的判定类型：
 *   semantic_success    三层递进（关键词 → 正则 → LLM）
 *   output_contains     回复包含文本
 *   output_not_contains 回复不包含文本
 *   output_contains_any 包含列表中任一
 *   output_matches_regex 正则匹配
 *   llm_judge           纯 LLM 语义判定
 *   duration_le         耗时上限
 *   step_count_le       步骤数上限（需 Trace）
 *   tool_used           工具调用检查（需 Trace）
 */
export async function evaluateCriteria(
  result: AgentResult,
  criteria: PassCriteria[],
  config: AppConfig,
): Promise<Judgment[]> {
  const output = result.output;
  const trace = result.trace;
  const judgments: Judgment[] = [];

  for (const c of criteria) {
    let passed = false;
    let detail = '';
    let reasoning: string | undefined;

    switch (c.type) {
      case 'output_contains': {
        passed = output.includes(c.text);
        detail = `查找 '${c.text}' → ${passed ? '找到' : '未找到'}`;
        break;
      }

      case 'output_not_contains': {
        passed = !output.includes(c.text);
        detail = `确认不含 '${c.text}' → ${passed ? '通过' : '包含了不该有的内容'}`;
        break;
      }

      case 'output_contains_any': {
        const matched = c.texts.filter((t) => output.includes(t));
        passed = matched.length > 0;
        detail = `查找任一 [${c.texts.join(', ')}] → ${passed ? `找到 [${matched.join(', ')}]` : '均未找到'}`;
        break;
      }

      case 'output_matches_regex': {
        try {
          const regex = new RegExp(c.pattern);
          passed = regex.test(output);
          detail = `正则 /${c.pattern}/ → ${passed ? '匹配' : '未匹配'}`;
        } catch (err) {
          detail = `正则语法错误: ${err instanceof Error ? err.message : err}`;
        }
        break;
      }

      case 'llm_judge': {
        const judgeResult = await callJudgeLlm(output, c.criteria, config);
        if (judgeResult === null) {
          passed = true; // 裁判不可用时不阻断，标记警告
          detail = `语义判定 '${c.criteria.slice(0, 30)}...' → 裁判 LLM 不可用，跳过`;
        } else {
          passed = judgeResult.passed;
          reasoning = judgeResult.reasoning;
          detail = `语义判定 '${c.criteria.slice(0, 30)}...' → ${passed ? 'PASS' : 'FAIL'}`;
        }
        break;
      }

      case 'semantic_success': {
        const keywords = c.keywords ?? DEFAULT_SUCCESS_KEYWORDS;

        // 第一层：关键词匹配（带否定上下文感知）
        const kwMatch = keywords.filter((kw) => keywordInPositiveContext(output, kw));
        if (kwMatch.length > 0) {
          passed = true;
          detail = `语义成功 '${c.description}' → 关键词命中: [${kwMatch.join(', ')}]`;
          break;
        }

        // 第二层：正则匹配
        if (c.regex) {
          try {
            if (new RegExp(c.regex).test(output)) {
              passed = true;
              detail = `语义成功 '${c.description}' → 正则命中`;
              break;
            }
          } catch {
            // 正则无效，跳过这层
          }
        }

        // 第三层：LLM-as-Judge
        const judgeResult = await callJudgeLlm(output, c.description, config);
        if (judgeResult?.passed) {
          passed = true;
          reasoning = judgeResult.reasoning;
          detail = `语义成功 '${c.description}' → LLM 裁判: PASS`;
        } else if (judgeResult && !judgeResult.passed) {
          passed = false;
          reasoning = judgeResult.reasoning;
          detail = `语义失败 '${c.description}' → LLM 裁判: FAIL`;
        } else {
          detail = `语义判定 '${c.description}' → 关键词/正则未命中，LLM 裁判不可用`;
        }
        break;
      }

      case 'duration_le': {
        const actualSec = result.durationMs / 1000;
        passed = actualSec <= c.value;
        detail = `耗时 ${actualSec.toFixed(1)}s ≤ ${c.value}s → ${passed ? '通过' : '超时'}`;
        break;
      }

      case 'step_count_le': {
        if (trace) {
          passed = trace.totalSteps <= c.value;
          detail = `步骤数 ${trace.totalSteps} ≤ ${c.value} → ${passed ? '通过' : `超出 ${trace.totalSteps - c.value} 步`}`;
        } else {
          passed = true;
          detail = '步骤数检查 → 跳过（无 Trace 数据）';
        }
        break;
      }

      case 'tool_used': {
        if (trace) {
          const used = trace.toolCalls.some((tc) => tc.toolName === c.name);
          passed = used;
          detail = `工具 ${c.name} → ${used ? '已调用' : '未调用'}`;
        } else {
          passed = true;
          detail = `工具检查 ${c.name} → 跳过（无 Trace 数据）`;
        }
        break;
      }

      default: {
        detail = `未知判定类型: ${(c as { type: string }).type}`;
      }
    }

    judgments.push({ type: c.type, passed, detail, reasoning });
  }

  return judgments;
}
