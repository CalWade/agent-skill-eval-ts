# agent-skill-eval

AI Agent 技能质量评估框架（TypeScript 重写版）。

用 YAML 定义测试用例，自动调用 Agent API，三层递进判定 Pass/Fail，生成结构化报告。

## 特性

- **TypeScript** — 完整类型定义，编译期保障
- **平台无关** — 兼容任何 OpenAI Chat Completions 格式的 Agent API
- **YAML 驱动** — 测试用例即配置，不写代码
- **三层递进判定** — 关键词（带否定上下文感知）→ 正则 → LLM-as-Judge（CoT）
- **Trace 解析** — 可选的 stream 模式，解析 Agent 每一步工具调用
- **多轮测试** — `steps` + `extract` 支持跨步骤变量传递
- **副作用隔离** — `side_effect` 字段 + `--safe-only` 参数，CI 安全运行
- **半自动失败分类** — F3/F4/F5 特征码自动标记

## 项目结构

```
agent-skill-eval/
├── src/                        # 评估引擎
│   ├── types.ts                #   核心类型定义（Single Source of Truth）
│   ├── config.ts               #   配置加载与校验
│   ├── agent.ts                #   Agent API 调用（fetch + SSE）
│   ├── judge.ts                #   判定引擎（含否定上下文感知）
│   ├── trace.ts                #   Trace 分析工具（D2/D3/D5 计算）
│   ├── report.ts               #   报告生成（Markdown + JSON）
│   ├── runner.ts               #   测试执行器（单轮 + 多轮）
│   ├── cli.ts                  #   CLI 入口
│   └── adapters/               #   平台 Trace 适配器
│       ├── index.ts            #     适配器注册
│       └── openai.ts           #     OpenAI 兼容格式适配器
├── tests/                      # 单元测试（vitest）
├── examples/                   # 使用示例
│   └── openclaw-feishu/        #   飞书技能评估示例
├── results/                    # 报告输出（自动生成，不入库）
├── .env.example                # 配置模板
└── package.json
```

## 快速开始

```bash
# 安装依赖
pnpm install

# 配置
cp .env.example .env
# 编辑 .env，填入 Agent API 地址和 Key

# 预览用例（不调 API）
pnpm run smoke:dry

# 运行测试
pnpm run smoke

# 运行自定义测试
pnpm run eval -- --suite path/to/test.yaml

# 只跑无副作用的用例
pnpm run eval -- --suite path/to/test.yaml --safe-only
```

## 编写测试用例

```yaml
skill: my-skill

cases:
  - id: TC-01
    title: 基本功能测试
    instruction: "帮我完成 xxx"
    category: happy_path
    side_effect: write         # none | read | write
    pass_criteria:
      - type: semantic_success
        description: "任务已成功完成"
        keywords: ["任务完成", "已完成"]
        regex: "(完成|成功).*(任务|操作)"
```

## 运行测试

```bash
pnpm test          # 运行单元测试
pnpm run typecheck # 类型检查
```

## License

MIT
