#!/usr/bin/env node

/**
 * agent-skill-eval CLI 入口
 *
 * 用法:
 *   npx tsx src/cli.ts --suite examples/openclaw-feishu/test-cases/safe-smoke.yaml
 *   npx tsx src/cli.ts --suite path/to/test.yaml --dry-run
 *   npx tsx src/cli.ts --suite path/to/test.yaml --case TC-01
 *   npx tsx src/cli.ts --suite path/to/test.yaml --safe-only
 */

import { parseArgs } from 'node:util';
import { loadConfig, validateConfig } from './config.js';
import { getAdapter } from './adapters/index.js';
import { runEval } from './runner.js';

function printUsage(): void {
  console.log(`
agent-skill-eval — AI Agent 技能质量评估工具 (TypeScript)

用法:
  npx tsx src/cli.ts --suite <yaml文件路径> [选项]

选项:
  --suite <path>    测试套件 YAML 文件路径（必填）
  --case <id>       只跑指定用例 ID（如 TC-SM-01）
  --dry-run         只预览用例，不调 API
  --safe-only       只跑 side_effect=none 的用例
  --help            显示帮助

示例:
  npx tsx src/cli.ts --suite examples/openclaw-feishu/test-cases/safe-smoke.yaml --dry-run
  npx tsx src/cli.ts --suite examples/openclaw-feishu/test-cases/safe-smoke.yaml
  npx tsx src/cli.ts --suite examples/openclaw-feishu/test-cases/safe-smoke.yaml --safe-only
`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      suite: { type: 'string' },
      case: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'safe-only': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (values.help || !values.suite) {
    printUsage();
    process.exit(values.help ? 0 : 1);
  }

  const config = loadConfig();
  const isDryRun = values['dry-run'] ?? false;

  // dry-run 模式不需要校验 API 配置
  if (!isDryRun) {
    validateConfig(config);
  }

  const adapter = getAdapter(config.traceAdapter);

  await runEval(
    {
      suitePath: values.suite,
      caseId: values.case,
      dryRun: isDryRun,
      safeOnly: values['safe-only'] ?? false,
    },
    config,
    adapter,
  );
}

main().catch((err) => {
  console.error(`❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
