# C03 上下文工程：Prompt 分层与预算

> 课程性质：核心
> 返回：[导学](../导学.md)；前置：[C02 Runtime 适配层与单轮执行](./C02-runtime-适配层与单轮执行.md)；下一课：[C04 能力解析管线与精确挂载](./C04-能力解析管线与精确挂载.md)
> 对应：B2；见 [面经](../面经.md)；目标掌握：看懂链路、理解机制、设计与表达。

## 本课重点

- 平台 prompt 不是字符串拼接，而是一份有序的 `PromptPlan`：每个 block 带 `id / version / scope / owner / required / condition / hash / estimatedTokens`，整份计划另有 `planHash`。
- 估算口径是"SDK 初始化前的兜底"：`estimatePromptTokens` 取 `字节数/4` 与"非 ASCII 字符数"的较大值；≥50000 记 warning，≥100000 记 error 并直接拒绝本轮运行。
- `buildSystemPrompt` 用一份显式条件表决定加哪些 block；Pi 生产入口与遗留 `index.ts` 入口的条件表并不一致，读代码时必须确认自己在看哪一条路径。
- 每轮的 `turnPrompt` 在系统提示之外再拼三层：owner-profile block、workspace memory block、渠道 turn context，顺序固定为"owner → memory → 渠道 → 用户输入"。
- 真正生效的上下文用量以 SDK 的 `getContextUsage()` 为准，`context-budget.ts` 用模型相关阈值（`min(50k, max×0.25)` / `min(100k, max×0.4)`）评估"静态启动上下文"，两套阈值不能混为一谈。

## 主链与职责

一次运行里，进入模型的文本有三个来源，职责严格分开：

1. **系统提示**：`container/agent-runner/prompts/*.md` 是文案真相源，`buildLiteClawPromptPlan` 只负责选块、排序、包 XML 标签，`createPromptPlan` 负责校验、估算与 hash。产物 `plan.text` 就是 `systemPrompt`。
2. **每轮上下文**：`runTurn` 里并行取 owner-profile 与 workspace memory 快照，再拼上 `ChannelTurnContext`，交给 Runtime 作为本轮 `prompt`。
3. **能力与项目上下文**：Skills/CLAUDE.md/rules/MCP 由 `container-runner` 与 `claude-context-resolver` 投影成文件，不进 prompt 文本（C04 展开）。

为什么不是简单拼接？因为产品要回答两个问题：这轮模型到底看到了什么（可审计），以及能力/身份变了要不要重新拉起暖 Runner（可失效）。前者靠 block 元数据与 hash，后者靠 plan 与清单的 hash 比对。

## 源码阅读

**一、block 契约与计划生成**（[prompt-plan.ts](../../../container/agent-runner/src/prompt-plan.ts)）

```ts
export function createPromptPlan(inputs: PromptBlockInput[]): PromptPlan {
  const blocks = inputs
    .filter((block) => block.text.trim().length > 0)
    .map(createPromptBlock);
  const text = blocks.map((block) => block.text).join('\n');
  const estimatedTokens = estimatePromptTokens(text);
  if (estimatedTokens >= 50_000) warnings.push(/* 估算超警戒线 */);
  if (estimatedTokens >= 100_000) errors.push(/* 硬阈值 */);
```

这段说明三件事：空文本 block 在生成阶段就被丢弃（`loadPrompt` 读不到文件返回空串，等价于"这个块不存在"，不报错）；`text` 用单换行 `join`；阈值判断按整份计划估算，不按单块。`hash` 的算法是 `sha256(JSON.stringify(blocks.map(只取元数据 + 每块 hash)))`——计划 hash 不含 `text` 原文，正文变化通过各 block 的 `hash` 传导上去。

`buildLiteClawPromptPlan` 的固定顺序为主 Agent 的十一个候选：`identity.liteclaw → bootstrap.liteclaw → agent-profile → interaction → security-rules → memory-system.workspace → agent-builder → output → web-fetch → background-tasks → channel.<id> → delivery-contract`。注意 `agent-profile` 块是唯一不包 XML 标签的（正文自带 `<agent-identity>` 外壳，由调用方拼），其余都经 `wrap()` 包成 `<platform-identity>`、`<behavior>`、`<security>`、`<memory-system>`、`<agent-builder>`、`<output-contract>`、`<web-access>`、`<background-tasks>`、`<channel-format>`、`<delivery-contract>`。

**二、谁在什么条件下加块**（[pi-index.ts](../../../container/agent-runner/src/pi-index.ts) 的 `buildSystemPrompt`）

- `identity.liteclaw`：仅 `agentProfile.isDefault`（内置 LiteClaw 身份）。
- `bootstrap.liteclaw`：`isDefault && liteclawOwnerProfileEnabled`。
- `agent-profile`：`identityPrompt` 非空才加，并把 `profile_id` 写进标签。
- `interaction` / `security-rules`：无条件，`required: true`。
- `memory-system.workspace`：**无条件传入**（是否真的出现取决于文件能否读到）。
- `agent-builder`：`input.agentBuilderEnabled`。
- `output`：三选一——定时任务用 `output.task.md`，`interactionMode === 'proactive'` 用 `output.proactive.md`，其余 `output.assistant.md`。
- `web-fetch`：条件为"WebSearch/WebFetch 可用"，但 Pi 入口**从不传** `web`，所以这个块在当前生产路径不会出现；遗留入口才传。
- `background-tasks`：条件写成 `DEFAULT_ALLOWED_TOOLS.includes('Task')`，而该常量固定包含 `'Task'`，实际恒真。
- `channel.<id>`：`prompts/channels/<渠道前缀>.md` 存在时才加，且正文是"渠道格式说明 + 本轮 turn context"。
- `delivery-contract`：按模式二选一，恒传。

`plan.errors` 非空时 `buildSystemPrompt` 抛 `prompt_plan_invalid`，`main` 的 catch 写 `status:'error'` 并置 `process.exitCode = 1`——所以 100k 是"整轮失败"，不是降级继续。

**三、每轮拼接次序**（同文件 `runTurn`）

```ts
const turnPrompt = [
  owner.block,                                    // <workspace_owner_profile trust="host_authoritative">
  memory.block,                                   // <workspace_memory_snapshot trust="historical_data">
  formatChannelTurnContextForPrompt(input.channelContext),
  prompt,
].filter(Boolean).join('\n\n');
```

owner 与 memory 两块都做了 `<>&` 转义，并各自在正文里声明信任级别与"不是指令"（见 [owner-profile-context.ts](../../../container/agent-runner/src/owner-profile-context.ts)、[workspace-memory-context.ts](../../../container/agent-runner/src/workspace-memory-context.ts)）。记忆快照每轮重新取，暖会话不会复用上一轮快照。

**四、两套预算**（[context-budget.ts](../../../container/agent-runner/src/context-budget.ts)、[context-window.ts](../../../container/agent-runner/src/context-window.ts)）

`calculateStaticStartupTokens` 只加"启动即占位"的项：memoryFiles、已加载的 mcpTools、已加载的 deferredBuiltinTools、systemTools、systemPromptSections、agents、slashCommands、skills。`assessContextBudget` 的阈值是模型相关的 `floor(min(50000, max×0.25))` 与 `floor(min(100000, max×0.4))`，状态为 `unavailable / ok / warning / hard_exceeded`。`context-window.ts` 只做一件事：按模型名尾缀 `[1m]` 判 1M 窗口，否则 200K；compact 百分比限定 50–90，遗留绝对阈值按 `min(配置值, 窗口×0.9)` 收敛。

**五、能力预览与兼容上下文**：[agent-capability-preview.ts](../../../src/agent-capability-preview.ts) 输出的是"谁能进上下文、从哪来、覆盖了谁"（skills/mcp 的 entries、overrides、conflicts、manifestHash，以及 context.source 与原生配置清单），**不含 prompt 文本本身**；[claude-context-resolver.ts](../../../src/claude-context-resolver.ts) 负责把宿主 `CLAUDE.md`、`rules/`、六类原生目录投影成 audit（状态 `mounted / linked / missing / unavailable`）与 skills 分层清单。

## 机制与边界

- **两级失败语义**：block 缺文件＝静默少一块（`required` 块例外，空即 error）；估算越硬阈值＝整轮报错。设计意图是"平台自己写坏的 prompt 立刻暴露，用户侧可选内容缺失不致命"。
- **估算只求保守，不求准**：`max(bytes/4, 非ASCII字符数)` 让中文按约 1 字符 ≈ 1 token 计，宁可高估。真正准的数据来自 SDK 的 `getContextUsage()`，`context-budget` 用 `unavailable` 显式表达"拿不到就别猜"。
- **计划 hash 是失效判据**：只覆盖元数据与每个 block 的正文 hash，所以改文案会变 hash、改顺序会变 hash、但只改缩进或多余空行（`trim()` 后相同）不会。
- **预览不是 prompt**：`/effective-capabilities` 那套预览解释"来源与冲突"，prompt 文本走 `PromptPlan`——两者别互相替代。
- **渠道块是唯一绑 owner 为 `channel` 的块**，它的 condition 写着"消息来源解析为某渠道"，实际判定用的是 `(currentSourceJid || chatJid).split(':')[0]` 加文件存在性。

## 需要懂什么

要能解释"为什么要有 planHash 而不是直接 hash 拼好的字符串"：字符串 hash 只能告诉你变了，元数据 hash 能告诉你**哪一类来源**变了——`owner` 与 `scope` 直接对应"这是平台身份、Agent 人格、工作区记忆还是渠道格式"，失效判断和对外解释都靠它。还要能说清 `scope` 的 `main / subagent / both` 是给子 Agent 复用的预留位：当前主链只产 `main` 块。

## 需要记住什么

1. `createPromptPlan` 三件事：去空块、查 `id` 重复与 `required` 空块、算 `planHash` 与总估算；阈值 50k warn / 100k error。
2. 顺序固定，读代码先认顺序再认条件；`agent-profile` 不包标签，其余包标签。
3. 估算公式：`max(ceil(utf8字节/4), 非ASCII字符数)`；权威用量来自 SDK。
4. 每轮顺序：owner-profile → workspace memory → 渠道 turn context → 本次输入。
5. Pi 入口与遗留入口的条件表不同：`web-fetch` 只在遗留入口出现，`memory` 在 Pi 入口无条件传，`background-tasks` 条件恒真。
