/**
 * 报告生成器
 *
 * 将测试结果输出为两种格式：
 *   - Markdown：人读，逐条展示判定详情和 Trace 摘要
 *   - JSON：机器读，供 gen_summary 或 Dashboard 消费
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { CaseResult, EvalReport, AppConfig } from './types.js';

/**
 * 生成 Markdown 格式的测试报告
 */
function generateMarkdown(
  suiteName: string,
  results: CaseResult[],
  roundId: string,
  config: AppConfig,
): string {
  const total = results.length;
  const passed = results.filter((r) => r.verdict === 'PASS').length;
  const rate = total > 0 ? ((passed / total) * 100).toFixed(0) : '0';
  const avgDuration = total > 0
    ? (results.reduce((sum, r) => sum + r.durationMs, 0) / total / 1000).toFixed(1)
    : '0';

  const lines: string[] = [
    `# ${suiteName} 测试报告`,
    '',
    `> Round: ${roundId}`,
    `> 时间: ${new Date().toLocaleString('zh-CN')}`,
    `> 模型: ${config.agentModel || '(未指定)'}`,
    '',
    '## 汇总',
    '',
    '| 指标 | 值 |',
    '|------|-----|',
    `| 总用例数 | ${total} |`,
    `| Pass | ${passed} |`,
    `| Fail | ${total - passed} |`,
    `| 首次成功率 | ${rate}% |`,
    `| 平均耗时 | ${avgDuration}s |`,
    '',
    '## 逐条结果',
    '',
    '| ID | 标题 | 结果 | 耗时 | 失败原因 |',
    '|-----|------|------|------|---------|',
  ];

  for (const r of results) {
    const duration = `${(r.durationMs / 1000).toFixed(1)}s`;
    const reason = r.reason.slice(0, 60);
    lines.push(`| ${r.caseId} | ${r.title} | ${r.verdict} | ${duration} | ${reason} |`);
  }

  lines.push('', '## 详细记录', '');

  for (const r of results) {
    lines.push(`### ${r.caseId}: ${r.title}`);
    lines.push(`- **指令**: \`${r.instruction}\``);
    lines.push(`- **结果**: **${r.verdict}**`);
    lines.push(`- **耗时**: ${(r.durationMs / 1000).toFixed(1)}s`);

    // Trace 摘要
    if (r.trace) {
      lines.push(`- **步骤数**: ${r.trace.totalSteps}`);
      lines.push(`- **工具调用链**: ${r.trace.toolChain.join(' → ')}`);
      lines.push(`- **错误恢复**: ${r.trace.hasRecovery ? '是' : '无'}`);
    }

    // Agent 回复预览
    if (r.output) {
      const preview = r.output.slice(0, 800);
      lines.push('- **Agent 回复**:');
      lines.push('  ```');
      for (const line of preview.split('\n')) {
        lines.push(`  ${line}`);
      }
      lines.push('  ```');
    }

    // 判定明细
    if (r.judgments.length > 0) {
      lines.push('- **判定明细**:');
      for (const j of r.judgments) {
        const icon = j.passed ? 'PASS' : 'FAIL';
        lines.push(`  - [${icon}] ${j.detail}`);
        if (j.reasoning) {
          lines.push(`    > 裁判推理: ${j.reasoning}`);
        }
      }
    }

    // 半自动失败标签
    if (r.autoFailTags.length > 0) {
      lines.push(`- **疑似失败分类**: ${r.autoFailTags.join(', ')}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 构建 JSON 报告数据
 */
function buildJsonReport(
  suiteName: string,
  results: CaseResult[],
  roundId: string,
  config: AppConfig,
): EvalReport {
  const total = results.length;
  const passed = results.filter((r) => r.verdict === 'PASS').length;
  const avgDurationMs = total > 0
    ? results.reduce((sum, r) => sum + r.durationMs, 0) / total
    : 0;

  return {
    suite: suiteName,
    round: roundId,
    timestamp: new Date().toISOString(),
    config: {
      apiUrl: config.agentApiUrl,
      model: config.agentModel,
    },
    summary: {
      total,
      passed,
      failed: total - passed,
      avgDurationMs,
    },
    results,
  };
}

/**
 * 保存测试报告到文件
 *
 * 同时输出 Markdown 和 JSON 两种格式。
 * 返回 Markdown 报告文件路径。
 */
export function saveReport(
  suiteName: string,
  results: CaseResult[],
  roundId: string,
  config: AppConfig,
): string {
  const dir = config.resultsDir;
  mkdirSync(dir, { recursive: true });

  // Markdown
  const markdown = generateMarkdown(suiteName, results, roundId, config);
  const mdPath = join(dir, `${suiteName}-${roundId}.md`);
  writeFileSync(mdPath, markdown, 'utf-8');

  // JSON
  const jsonData = buildJsonReport(suiteName, results, roundId, config);
  const jsonPath = join(dir, `${suiteName}-${roundId}.json`);
  writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf-8');

  return mdPath;
}
