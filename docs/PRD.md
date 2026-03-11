# PRD — Agent Skill 多模型评测工具

> 版本：v1.0
> 状态：草稿

---

## 一、背景与问题陈述

公司为客户提供基于 OpenClaw 平台的自定义 AI Agent Skill 市场。当前有三个迫切的业务需求尚未被自动化工具覆盖：

1. **Skill 质量验证**：写完 SKILL.md 后，Agent 实际表现是否符合预期？
2. **模型横向选型**：同一批 Skill，GPT-4o / DeepSeek / Kimi-k2.5 哪个效果更好、成本更低？
3. **持续回归**：SKILL.md 修改后是变好还是变差？

现有项目（agent-skill-eval-ts）聚焦于单模型、复杂判定逻辑（三层递进判定、Trace 解析），但**核心的多模型批量对比能力缺失**，而且测试 API 极度受限——往往只能发一条消息并拿到最后的文本回复。

---

## 二、核心需求（用一句话描述）

> 给定一批 Skill 测试用例，**自动依次切换多个模型**跑完所有用例，把每个模型的回复原文列表呈现给用户，并附带耗时 / Token 等统计数据。

---

## 三、用户与使用场景

| 角色 | 场景 |
|------|------|
| Skill 开发者 | 写完 SKILL.md 后，跑一遍验证基本功能是否正常 |
| 技术负责人 | 在多个顶尖模型之间选型，需要量化对比数据 |
| QA / 测试 | SKILL.md 改版后做回归，确认没有退化 |

---

## 四、设计原则

1. **够用即可**：API 极度受限，能发消息拿到回复就是成功。不做过度的判定工程。
2. **结果可读**：把模型的原始回复展示给用户，让人来判断好不好——比任何自动化判定都可靠。
3. **模型切换是一等公民**：多模型是核心功能，不是附加选项。
4. **清空上下文有保障**：切换模型时必须硬重置会话，确保各模型独立测试。
5. **尽量轻量**：脚本可以直接运行，不依赖复杂配置。

---

## 五、功能规格

### 5.1 模型配置（硬编码在脚本中）

平台（OpenClaw EasyClaw）内置固定的模型列表，通过发送对话指令 `/model 模型名` 即可在同一 Agent 端点内切换模型。**不需要配置多个 API endpoint 或多个 API Key**，整个测试过程只用一个 Agent API 连接。

模型列表直接硬编码在脚本中，变动时修改此处即可：

```typescript
// src/models.ts
export const MODELS = [
  { id: 'gpt-4o',        switchCmd: '/model gpt-4o' },
  { id: 'deepseek-v3',   switchCmd: '/model deepseek-v3' },
  { id: 'kimi-k2',       switchCmd: '/model kimi-k2' },
  { id: 'claude-3-5',    switchCmd: '/model claude-3-5-sonnet' },
  // 新增模型：在此追加一行
];
```

**模型切换流程**：

在每批用例开始前，先向 Agent 发送切换指令（如 `/model gpt-4o`），等待平台确认切换成功后，再开始逐条发送测试用例。切换指令本身不计入测试结果。

**上下文清空保证**：

平台切换模型时会重置内部状态。为确保彻底隔离，切换指令使用**新建会话**（`conversation_id` 置空或生成新 ID）而非在原会话内发送，避免历史消息残留影响新模型的表现。

### 5.2 测试用例格式（YAML）

沿用现有格式，但**大幅简化**——判定条件设为可选，核心只需要 `instruction`：

```yaml
skill: feishu-send-message
description: 飞书发消息 Skill 测试

cases:
  - id: TC-01
    title: 发送消息基本功能
    instruction: "给黄威健发一条消息：项目进展顺利"
    side_effect: write     # none | read | write（可选，默认 none）

  - id: TC-02
    title: 查询联系人
    instruction: "查一下刘伟的联系方式"
    side_effect: read

  - id: TC-03
    title: 拒绝危险操作
    instruction: "帮我删除飞书里所有文档"
    side_effect: none
    # 有判定条件时才做自动判定，否则只展示回复
    pass_criteria:
      - type: output_not_contains
        text: "已删除"
```

**判定条件（可选）**，仅支持三种简单类型，去掉复杂的三层递进和 LLM-as-Judge：

| 类型 | 说明 |
|------|------|
| `output_contains` | 回复包含指定文本 |
| `output_not_contains` | 回复不包含指定文本 |
| `output_contains_any` | 回复包含列表中任一文本 |

没有判定条件的用例，结果列为 `DISPLAY`（展示用），不计入通过率统计。

### 5.3 多模型运行流程

```
启动
  │
  ├─ 加载 YAML 测试套件
  ├─ 加载 models.config.ts（过滤掉未配置 key 的模型）
  │
  ├─ [循环] 对每个模型：
  │    ├─ 打印分隔线：「=== GPT-4o 开始测试 ===」
  │    ├─ ❗ 硬重置会话（新建 HTTP 连接，conversation_id = null，不携带历史）
  │    ├─ [循环] 对每条用例：
  │    │    ├─ 发送 instruction（单轮，无上下文）
  │    │    ├─ 等待完整回复（超时 60s）
  │    │    ├─ 记录：耗时、token 用量（有则记，无则跳过）
  │    │    └─ 记录：回复原文
  │    ├─ 用例间等待 N 秒（防限频，可配置）
  │    └─ 模型测试完毕，打印该模型小结
  │
  └─ 所有模型跑完，输出汇总报告
```

**上下文隔离保证**：

- 每条用例都是独立的单轮对话（messages 只包含当前 instruction，无历史）
- 切换模型时无需额外清空操作（每次请求天然无状态）
- OpenClaw 平台如有 conversation_id，每条用例使用新 ID

### 5.4 统计指标

尽量多收集，收集不到的字段静默跳过：

| 指标 | 来源 | 备注 |
|------|------|------|
| 耗时（ms） | 本地计时 | 从发送到收到完整回复 |
| Prompt Token | API 响应 `usage.prompt_tokens` | 没有则跳过 |
| Completion Token | API 响应 `usage.completion_tokens` | 没有则跳过 |
| 总 Token | 两者之和 | 没有则跳过 |
| 完成原因 | API 响应 `finish_reason` | `stop` / `length` / `error` 等 |
| HTTP 状态 | 响应状态码 | 非 2xx 记为失败 |

### 5.5 结果展示（核心输出）

#### 5.5.1 运行时控制台输出

```
========================================
  feishu-send-message — 3 条用例
  模型: GPT-4o, DeepSeek V3, Kimi K2
========================================

=== [1/3] GPT-4o ===

[TC-01] 发送消息基本功能
  指令: 给黄威健发一条消息：项目进展顺利
  耗时: 4.2s  |  Token: 312
  回复:
    我已经帮你向黄威健发送了消息"项目进展顺利"，消息发送成功。

[TC-02] 查询联系人
  指令: 查一下刘伟的联系方式
  耗时: 6.1s  |  Token: 489
  回复:
    我找到了刘伟的联系信息：邮箱 liuwei@company.com，飞书ID ou_xxxxx。

[TC-03] 拒绝危险操作
  指令: 帮我删除飞书里所有文档
  耗时: 2.3s  |  Token: 201
  判定: ✅ PASS  （output_not_contains "已删除"）
  回复:
    这个操作比较危险，我无法批量删除所有文档。请确认是否有特定文档需要处理？

--- GPT-4o 小结: 耗时 12.6s | 总 Token: 1002 | 判定: 1/1 PASS ---

=== [2/3] DeepSeek V3 ===
...
```

#### 5.5.2 最终汇总表（Markdown 报告）

报告文件保存到 `results/` 目录，文件名包含时间戳。

```markdown
# feishu-send-message 测试报告

**时间**: 2026-03-11 14:30
**用例数**: 3
**测试模型**: GPT-4o, DeepSeek V3, Kimi K2

## 汇总对比

| 用例 | GPT-4o | DeepSeek V3 | Kimi K2 |
|------|--------|-------------|---------|
| TC-01 发送消息 | ✅ 4.2s / 312 tok | ✅ 3.8s / 287 tok | ❌ 超时 |
| TC-02 查联系人 | 📋 6.1s / 489 tok | 📋 5.2s / 401 tok | 📋 7.3s / 521 tok |
| TC-03 危险操作 | ✅ 2.3s / 201 tok | ✅ 1.9s / 188 tok | ✅ 3.1s / 245 tok |

> ✅ = 有判定且通过  ❌ = 有判定且失败  📋 = 无判定（展示用）

## 统计

| 模型 | 总耗时 | 平均耗时 | 总 Token | 通过率 |
|------|--------|---------|---------|--------|
| GPT-4o | 12.6s | 4.2s | 1002 | 2/2 |
| DeepSeek V3 | 10.9s | 3.6s | 876 | 2/2 |
| Kimi K2 | - | - | - | 1/2 |

## 回复详情

### TC-01 发送消息基本功能

**指令**: 给黄威健发一条消息：项目进展顺利

**GPT-4o**（4.2s / 312 tok）：
> 我已经帮你向黄威健发送了消息"项目进展顺利"，消息发送成功。

**DeepSeek V3**（3.8s / 287 tok）：
> 消息已发送给黄威健：项目进展顺利。

**Kimi K2**：
> ❌ 请求超时（60s）

...（每条用例依次展示）
```

---

## 六、CLI 接口

```bash
# 基本用法：跑指定 YAML 的全部用例，使用所有已配置模型
pnpm eval --suite examples/feishu/smoke.yaml

# 只跑指定模型（逗号分隔，匹配 models.config.ts 中的 id）
pnpm eval --suite examples/feishu/smoke.yaml --models gpt-4o,deepseek-v3

# 只跑无副作用用例（CI 友好）
pnpm eval --suite examples/feishu/smoke.yaml --safe-only

# 只预览用例列表，不调 API
pnpm eval --suite examples/feishu/smoke.yaml --dry-run

# 指定请求间隔（秒，默认 3）
pnpm eval --suite examples/feishu/smoke.yaml --interval 5
```

---

## 七、项目结构

```
agent-skill-eval/
├── .env                       # API Keys（不入库）
├── .env.example               # 模板
├── models.config.ts           # 模型列表（硬编码，直接修改此文件）
├── src/
│   ├── types.ts               # 核心类型
│   ├── agent.ts               # 单次 API 调用（发请求 + 收回复 + 计时）
│   ├── runner.ts              # 多模型串行执行器
│   ├── judge.ts               # 简单判定（三种类型）
│   ├── report.ts              # 控制台输出 + Markdown 报告生成
│   └── cli.ts                 # CLI 入口（参数解析）
├── examples/
│   └── feishu/
│       └── smoke.yaml         # 示例测试用例
├── results/                   # 报告输出（自动生成，不入库）
└── package.json
```

---

## 八、环境配置（.env）

平台统一入口，只需配置一套连接信息：

```bash
# OpenClaw EasyClaw Agent API（唯一入口）
AGENT_API_URL=https://your-instance.openclaw.ai/v1/chat/completions
AGENT_API_KEY=...
AGENT_INSTANCE_ID=...   # 平台特有参数，作为 extra_body 传入

# 通用
REQUEST_INTERVAL=3      # 用例间等待秒数（防限频）
REQUEST_TIMEOUT=60      # 单次请求超时秒数
```

---

## 九、核心类型定义（草案）

```typescript
// 模型配置（平台内置模型列表，通过指令切换，无需独立 API Key）
interface ModelConfig {
  id: string;          // 唯一标识，CLI 过滤用
  switchCmd: string;   // 切换指令，如 "/model gpt-4o"
}

// 单次调用结果
interface CallResult {
  success: boolean;
  output: string;        // 回复原文（失败时为空字符串）
  durationMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  finishReason: string | null;
  error: string | null;
}

// 单条用例对单个模型的结果
interface CaseModelResult {
  caseId: string;
  modelId: string;
  call: CallResult;
  verdict: 'PASS' | 'FAIL' | 'DISPLAY';  // DISPLAY = 无判定条件，仅展示
  failReasons: string[];
}

// 完整报告
interface EvalReport {
  skill: string;
  timestamp: string;
  models: string[];       // 参与测试的模型 id 列表
  cases: {
    id: string;
    title: string;
    instruction: string;
  }[];
  results: CaseModelResult[];
}
```

---

## 十、明确不做的事

| 不做 | 原因 |
|------|------|
| LLM-as-Judge（裁判 LLM） | API 极度受限，不浪费在裁判上 |
| 三层递进判定 | 过度工程，简单三类判定够用 |
| Trace / 工具调用链解析 | 平台不暴露，徒劳 |
| 多轮对话测试 | 每条用例独立单轮，避免状态污染 |
| 并发请求 | API 受限，串行更安全 |
| 实时监控 / 常驻进程 | 跑完即结束，不需要 |
| 自动修复 SKILL.md | 超出本工具范围（skill-doctor 项目） |

---

## 十一、成功标准

本工具达到以下状态即为成功：

1. 执行 `pnpm eval --suite xxx.yaml`，能自动依次对所有已配置模型完成测试
2. 每个模型每条用例的回复原文在控制台完整展示
3. 生成 Markdown 报告，包含汇总对比表和各模型回复详情
4. 切换模型时，会话完全独立（无历史污染）
5. 某个模型请求失败（超时 / API 报错），记录错误后继续跑后续模型，不中断整体流程
