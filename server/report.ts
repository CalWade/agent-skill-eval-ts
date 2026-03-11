/**
 * 报告生成
 *
 * 职责一：运行时控制台输出（printXxx 函数）
 * 职责二：测试结束后生成 Markdown 报告文件
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { TestCase, CaseModelResult, EvalReport } from './types.js';

// ── 控制台输出 ────────────────────────────────────────────────

export function printSuiteHeader(skill: string, caseCount: number, modelIds: string[]): void {
  const line = '='.repeat(48);
  console.log(`\n${line}`);
  console.log(`  ${skill} — ${caseCount} 条用例`);
  console.log(`  模型: ${modelIds.join(', ')}`);
  console.log(`${line}`);
}

export function printModelHeader(modelId: string, index: number, total: number): void {
  console.log(`\n${'─'.repeat(48)}`);
  console.log(`  [${index}/${total}] 模型: ${modelId}`);
  console.log(`${'─'.repeat(48)}`);
}

export function printCaseResult(testCase: TestCase, result: CaseModelResult): void {
  const { call, verdict, failReasons } = result;

  // 标题行
  console.log(`\n[${testCase.id}] ${testCase.title}`);
  console.log(`  指令: ${testCase.instruction}`);

  // 统计行：有什么显示什么
  const stats: string[] = [];
  stats.push(`耗时: ${(call.durationMs / 1000).toFixed(1)}s`);
  if (call.totalTokens !== null) {
    stats.push(`Token: ${call.totalTokens}`);
  } else if (call.promptTokens !== null || call.completionTokens !== null) {
    const p = call.promptTokens ?? '?';
    const c = call.completionTokens ?? '?';
    stats.push(`Token: ${p}+${c}`);
  }
  if (call.finishReason && call.finishReason !== 'stop') {
    stats.push(`finish: ${call.finishReason}`);
  }
  console.log(`  ${stats.join('  |  ')}`);

  // 判定行（DISPLAY 不显示判定）
  if (verdict === 'PASS') {
    console.log(`  判定: ✅ PASS`);
  } else if (verdict === 'FAIL') {
    console.log(`  判定: ❌ FAIL`);
    for (const reason of failReasons) {
      console.log(`    - ${reason}`);
    }
  }

  // 回复原文
  if (call.success) {
    console.log(`  回复:`);
    // 每行缩进 4 格，超长时截断并提示
    const lines = call.output.split('\n');
    for (const line of lines) {
      console.log(`    ${line}`);
    }
  } else {
    console.log(`  错误: ${call.error}`);
  }
}

export function printModelSummary(modelId: string, results: CaseModelResult[]): void {
  const total = results.length;
  const totalDurationMs = results.reduce((s, r) => s + r.call.durationMs, 0);
  const totalTokens = results.reduce((s, r) => s + (r.call.totalTokens ?? 0), 0);

  // 只统计有判定条件的用例（PASS / FAIL）
  const judged = results.filter((r) => r.verdict !== 'DISPLAY');
  const passed = judged.filter((r) => r.verdict === 'PASS').length;
  const judgedTotal = judged.length;

  const parts: string[] = [
    `总耗时 ${(totalDurationMs / 1000).toFixed(1)}s`,
  ];
  if (totalTokens > 0) parts.push(`总 Token ${totalTokens}`);
  if (judgedTotal > 0) parts.push(`判定 ${passed}/${judgedTotal} PASS`);

  console.log(`\n--- ${modelId} 小结: ${parts.join(' | ')} ---`);
}

export function printFinalSummary(report: EvalReport): void {
  const line = '='.repeat(48);
  console.log(`\n${line}`);
  console.log(`  测试完成: ${report.skill}`);
  console.log(`  模型数: ${report.modelIds.length}  用例数: ${report.cases.length}`);
  console.log(line);
}

// ── Markdown 报告生成 ─────────────────────────────────────────

/** 生成报告并写入 results/ 目录，返回文件路径 */
export function saveReport(report: EvalReport, resultsDir: string): string {
  mkdirSync(resultsDir, { recursive: true });

  const ts = report.timestamp.replace(/[:.]/g, '-').replace('T', '_').slice(0, 16);
  const filename = `${report.skill}-${ts}.md`;
  const filePath = join(resultsDir, filename);

  writeFileSync(filePath, buildMarkdown(report), 'utf-8');
  console.log(`\n  报告已保存: ${filePath}\n`);
  return filePath;
}

function buildMarkdown(report: EvalReport): string {
  const lines: string[] = [];
  const { skill, description, timestamp, modelIds, cases, results } = report;

  // 标题
  lines.push(`# ${skill} 测试报告`);
  lines.push('');
  if (description) lines.push(`> ${description}`);
  lines.push('');
  lines.push(`**时间**: ${timestamp.replace('T', ' ').slice(0, 16)}`);
  lines.push(`**用例数**: ${cases.length}`);
  lines.push(`**测试模型**: ${modelIds.join(', ')}`);
  lines.push('');

  // ── 汇总对比表 ──
  lines.push('## 汇总对比');
  lines.push('');

  // 表头
  const header = ['| 用例', ...modelIds.map((id) => ` ${id}`), '|'].join(' |');
  const divider = ['|------', ...modelIds.map(() => '------'), '|'].join('|');
  lines.push(header);
  lines.push(divider);

  for (const c of cases) {
    const cells: string[] = [`| \`${c.id}\` ${c.title}`];
    for (const modelId of modelIds) {
      const r = results.find((x) => x.caseId === c.id && x.modelId === modelId);
      if (!r) {
        cells.push(' -');
        continue;
      }
      const durStr = `${(r.call.durationMs / 1000).toFixed(1)}s`;
      const tokStr = r.call.totalTokens !== null ? ` / ${r.call.totalTokens} tok` : '';
      if (r.verdict === 'PASS') cells.push(` ✅ ${durStr}${tokStr}`);
      else if (r.verdict === 'FAIL') {
        if (r.call.success) cells.push(` ❌ ${durStr}${tokStr}`);
        else cells.push(` ❌ ${r.call.error ?? '失败'}`);
      }
      else cells.push(` 📋 ${durStr}${tokStr}`);
    }
    cells.push('');
    lines.push(cells.join(' |'));
  }

  lines.push('');
  lines.push('> ✅ 有判定且通过  ❌ 有判定且失败  📋 无判定（展示用）');
  lines.push('');

  // ── 模型统计 ──
  lines.push('## 统计');
  lines.push('');
  lines.push('| 模型 | 总耗时 | 平均耗时 | 总 Token | 通过率 |');
  lines.push('|------|--------|---------|---------|--------|');

  for (const modelId of modelIds) {
    const modelResults = results.filter((r) => r.modelId === modelId);
    const totalMs = modelResults.reduce((s, r) => s + r.call.durationMs, 0);
    const avgMs = modelResults.length > 0 ? totalMs / modelResults.length : 0;
    const totalTok = modelResults.reduce((s, r) => s + (r.call.totalTokens ?? 0), 0);
    const judged = modelResults.filter((r) => r.verdict !== 'DISPLAY');
    const passed = judged.filter((r) => r.verdict === 'PASS').length;

    const tokCell = totalTok > 0 ? String(totalTok) : '-';
    const passCell = judged.length > 0 ? `${passed}/${judged.length}` : '-';

    lines.push(
      `| ${modelId} | ${(totalMs / 1000).toFixed(1)}s | ${(avgMs / 1000).toFixed(1)}s | ${tokCell} | ${passCell} |`,
    );
  }
  lines.push('');

  // ── 回复详情 ──
  lines.push('## 回复详情');
  lines.push('');

  for (const c of cases) {
    lines.push(`### ${c.id} ${c.title}`);
    lines.push('');
    lines.push(`**指令**: ${c.instruction}`);
    lines.push('');

    for (const modelId of modelIds) {
      const r = results.find((x) => x.caseId === c.id && x.modelId === modelId);
      if (!r) continue;

      const durStr = `${(r.call.durationMs / 1000).toFixed(1)}s`;
      const tokStr = r.call.totalTokens !== null ? ` / ${r.call.totalTokens} tok` : '';
      lines.push(`**${modelId}**（${durStr}${tokStr}）:`);

      if (!r.call.success) {
        lines.push(`> ❌ ${r.call.error}`);
      } else {
        // 引用块，每行加 > 前缀
        for (const l of r.call.output.split('\n')) {
          lines.push(`> ${l}`);
        }
        if (r.verdict === 'FAIL') {
          lines.push('');
          for (const reason of r.failReasons) {
            lines.push(`> ⚠️ 判定失败: ${reason}`);
          }
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
