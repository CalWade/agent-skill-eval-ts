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
  const { verdict, failReasons } = result;
  const isMultiStep = Array.isArray(result.steps) && result.steps.length > 0;

  // 标题行
  const stepLabel = isMultiStep ? `  [${result.steps!.length} 步]` : '';
  console.log(`\n[${testCase.id ?? result.caseId}] ${testCase.title ?? result.caseTitle}${stepLabel}`);

  if (isMultiStep) {
    // 多步：逐步打印
    for (const step of result.steps!) {
      console.log(`\n  步骤 ${step.stepIndex}: ${step.instruction}`);
      printCallStats(step.call, '  ');
      if (step.verdict === 'PASS') {
        console.log(`    判定: ✅ PASS`);
      } else if (step.verdict === 'FAIL') {
        console.log(`    判定: ❌ FAIL`);
        for (const reason of step.failReasons) {
          console.log(`      - ${reason}`);
        }
      }
      printOutput(step.call, '    ');
    }
    // 汇总判定
    console.log(`\n  总判定: ${verdict === 'PASS' ? '✅ PASS' : verdict === 'FAIL' ? '❌ FAIL' : '📋 DISPLAY'}`);
    if (verdict === 'FAIL') {
      for (const reason of failReasons) {
        console.log(`    - ${reason}`);
      }
    }
  } else {
    // 单步：原有逻辑
    const call = result.call;
    console.log(`  指令: ${testCase.instruction ?? result.caseTitle}`);
    printCallStats(call, '');
    if (verdict === 'PASS') {
      console.log(`  判定: ✅ PASS`);
    } else if (verdict === 'FAIL') {
      console.log(`  判定: ❌ FAIL`);
      for (const reason of failReasons) {
        console.log(`    - ${reason}`);
      }
    }
    printOutput(call, '    ');
  }
}

function printCallStats(call: CaseModelResult['call'], indent: string): void {
  const stats: string[] = [];
  stats.push(`耗时: ${(call.durationMs / 1000).toFixed(1)}s`);
  if (call.totalTokens !== null) {
    stats.push(`Token: ${call.totalTokens}`);
  } else if (call.promptTokens !== null || call.completionTokens !== null) {
    stats.push(`Token: ${call.promptTokens ?? '?'}+${call.completionTokens ?? '?'}`);
  }
  if (call.finishReason && call.finishReason !== 'stop') {
    stats.push(`finish: ${call.finishReason}`);
  }
  console.log(`${indent}  ${stats.join('  |  ')}`);
}

function printOutput(call: CaseModelResult['call'], indent: string): void {
  if (call.success) {
    console.log(`${indent}回复:`);
    for (const line of call.output.split('\n')) {
      console.log(`${indent}  ${line}`);
    }
  } else {
    console.log(`${indent}错误: ${call.error}`);
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
    const stepCount = (c as { stepCount?: number }).stepCount;
    lines.push(`### ${c.id} ${c.title}${stepCount ? `  _(${stepCount} 步)_` : ''}`);
    lines.push('');
    lines.push(`**指令**: ${c.instruction}`);
    lines.push('');

    for (const modelId of modelIds) {
      const r = results.find((x) => x.caseId === c.id && x.modelId === modelId);
      if (!r) continue;

      const durStr = `${(r.call.durationMs / 1000).toFixed(1)}s`;
      const tokStr = r.call.totalTokens !== null ? ` / ${r.call.totalTokens} tok` : '';
      lines.push(`**${modelId}**（${durStr}${tokStr}）:`);

      if (r.steps?.length) {
        // 多步：逐步展示
        for (const step of r.steps) {
          const verdictIcon = step.verdict === 'PASS' ? '✅' : step.verdict === 'FAIL' ? '❌' : '📋';
          lines.push(`> **步骤${step.stepIndex}** ${verdictIcon}  \`${step.instruction}\``);
          if (step.call.success) {
            for (const l of step.call.output.split('\n')) {
              lines.push(`> ${l}`);
            }
          } else {
            lines.push(`> ❌ ${step.call.error}`);
          }
          for (const reason of step.failReasons) {
            lines.push(`> ⚠️ ${reason}`);
          }
          lines.push('>');
        }
      } else {
        // 单步
        if (!r.call.success) {
          lines.push(`> ❌ ${r.call.error}`);
        } else {
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
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
