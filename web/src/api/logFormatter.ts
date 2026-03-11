/**
 * SSE 事件 → 日志行格式化
 *
 * 职责：将服务端推送的 SseEvent 转换为界面日志条目，
 * 与 Vue 组件解耦，便于独立测试。
 */

import type { SseEvent } from '../types'

export interface LogLine {
  text: string
  type: 'info' | 'success' | 'error' | 'muted'
}

/** 将单个 SSE 事件转换为一组日志行 */
export function formatSseEvent(e: SseEvent): LogLine[] {
  const lines: LogLine[] = []

  const info  = (text: string): LogLine => ({ text, type: 'info' })
  const ok    = (text: string): LogLine => ({ text, type: 'success' })
  const err   = (text: string): LogLine => ({ text, type: 'error' })
  const muted = (text: string): LogLine => ({ text, type: 'muted' })

  switch (e.type) {
    case 'model_start':
      lines.push(info(`\n── [${e.index + 1}/${e.total}] 模型：${e.modelId} ──`))
      break

    case 'switch':
      lines.push(muted(`  切换模型：${e.cmd} ...`))
      break

    case 'switch_ok':
      lines.push(ok(`  切换成功（${(e.durationMs / 1000).toFixed(1)}s）`))
      break

    case 'switch_fail':
      lines.push(err(`  切换失败：${e.error}`))
      break

    case 'case_start':
      lines.push(info(`\n  [${e.index + 1}/${e.total}] ${e.caseId} ${e.caseTitle}`))
      break

    case 'case_result': {
      const dur = `${(e.call.durationMs / 1000).toFixed(1)}s`
      const tok = e.call.totalTokens != null ? ` / ${e.call.totalTokens} tok` : ''
      lines.push(muted(`  耗时：${dur}${tok}`))

      if (e.verdict === 'PASS') {
        lines.push(ok(`  判定：✅ PASS`))
      } else if (e.verdict === 'FAIL') {
        lines.push(err(`  判定：❌ FAIL`))
        for (const reason of e.failReasons) lines.push(err(`    - ${reason}`))
      }

      if (e.call.success) {
        lines.push(muted(`  回复：`))
        for (const line of e.call.output.split('\n')) lines.push(info(`    ${line}`))
      } else {
        lines.push(err(`  错误：${e.call.error}`))
      }
      break
    }

    case 'model_done':
      lines.push(ok(`\n  ${e.modelId} 完成`))
      break

    case 'done':
      lines.push(ok(`\n测试全部完成，报告已保存：${e.reportFile}`))
      break

    case 'error':
      lines.push(err(`错误：${e.message}`))
      break
  }

  return lines
}
