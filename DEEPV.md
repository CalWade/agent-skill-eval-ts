## DeepV Code Added Memories
- agent-skill-eval-ts 项目位于 /Users/calvin/Desktop/实习产出/skill 自动化测试/agent-skill-eval-ts，是一个 AI Agent Skill 自动化评测平台。技术栈：后端 Node.js + TypeScript（server/），前端 Vue 3 + Element Plus（web/src/），测试套件存放在 suites/ 目录（YAML格式）。

核心架构：
- server/agent.ts：callAgent 分发 cloud/local 模式。local 模式固定 model="openclaw"，通过 x-openclaw-session-key header 隔离会话上下文。
- server/services/configService.ts：管理 AgentMode(cloud|local)、LOCAL_BASE_URL、LOCAL_TOKEN 等配置，writeEnvFile 合并写入不覆盖。
- server/services/runService.ts：executeRun 执行测试核心引擎。local 模式下：测试前备份 workspace+sessions，每个模型测前还原到基准快照，测后恢复原始状态。
- server/services/openclawService.ts：OpenClaw 管理。switchModel() 通过 `openclaw models set` + `openclaw secrets reload` 热切换底层 LLM（无需重启 gateway）。backupWorkspace/resetFromBackup/restoreWorkspace 实现 workspace 备份还原隔离。
- server/api.ts：REST API，含 /api/localModels（读取各 provider 的 /v1/models 接口获取完整模型列表）。
- web/src/components/SuitePanel.vue：模型编辑弹窗按 agentMode 显示不同内容（cloud: 纯文本输入; local: 供应商下拉+模型ID输入，自动组合为 provider/modelId）。勾选状态存 localStorage key=selectedModelIds。

Local 模式关键发现：OpenClaw gateway 忽略请求体 model 字段和 x-openclaw-agent-id header，唯一切换底层 LLM 的方式是 `openclaw models set` + `openclaw secrets reload`（热重载，约2秒）。

模型 ID 设计：local 模式下 models.json 的 ids 直接存 provider/modelId 格式（如 custom-coding-dashscope-aliyuncs-com/qwen3.5-plus），不需要额外的 localModels 映射字段。

YAML 格式精简原则：skill 字段从路径推断不写入、id/title 可选自动生成、side_effect:none 省略。
