# C05 工具面：MCP 工具与 IPC 回调

> 课程性质：核心
> 返回：[导学](../导学.md)；前置：[C04 能力解析管线与精确挂载](./C04-能力解析管线与精确挂载.md)；下一课：[C06 会话串行队列与 Runner 生命周期](./C06-会话串行队列与-runner-生命周期.md)
> 对应：B3；见 [面经](../面经.md)；目标掌握：看懂链路、理解机制、设计与表达。

## 本课重点

场景：飞书群里用户说「帮我把这份周报发到项目群，然后每天晚上九点提醒我复盘」。这条请求会触发两个工具：发消息、排定时任务。两个动作都会改变外部世界，而 Agent 运行在一个只有工作目录和 IPC 目录写权限的隔离进程里。

本课要拿下的四个结论：

1. 内置工具不是额外服务，而是**进程内工具**：在 Runner 里用一份中立的工具定义（名称、描述、Zod 形状、处理器）构造数组，再适配成 Pi 的 `ToolDefinition`，挂上 `mcp__liteclaw__` 前缀。
2. 有副作用的工具**不在 Runner 里落地**：它们把一条请求 JSON 写进 IPC 的 tasks 目录，然后按 `requestId` 轮询结果文件；真正的发送、落库、排任务在宿主完成。
3. 请求写入是原子的（临时文件 + `rename`，权限 `0o600`），轮询只吞 `ENOENT`，其它错误立刻抛——这两条一起保证「读到的结果一定属于本次请求，且不会把半截文件当成结果」。
4. 工具结果的形状要迁就模型：统一包成 text/image 内容块；参数在校验层和执行层各校验一次，坏 schema 不能让运行起不来。

## 主链与职责

```
模型发起工具调用
└─ Pi: tool_execution_start → prepareArguments(zod 校验) → execute()
   ├─ 纯计算类（read/grep/find/bash…）在 Runner 内完成
   └─ 副作用类（send_message / schedule_task / workspace_memory_* / feishu_*）
        writeIpcFile(tasks/, {type, requestId, chatJid, inputTurnId, params})
        pollIpcResult(tasks/, 'xxx_result', timeout)   ← 每 500ms 读一次
宿主 src/index.ts 扫描 IPC
  ├─ 鉴权：跨群/租户/主机模式校验（canSendCrossGroupMessage 等）
  ├─ 执行：渠道发送 / 任务落库 / 记忆变更（带幂等键）
  └─ 写回 tasks/<prefix>_<requestId>.json
Runner 读到结果 → 包装 content 返回模型
```

状态所有者很清楚：`requestId` 由 Runner 生成并贯穿请求与结果；`chatJid` / `channelContext` / `inputTurnId` 来自本轮的 `McpContext`，不是从「最近一条群消息」推的；工具是否成功以宿主写回的结果为准，Runner 不做乐观假设。

## 源码阅读

1. 工具的中立定义在 [mcp-tool-types.ts](../../../container/agent-runner/src/mcp-tool-types.ts)：`McpToolDefinition` 只有 `name`、`description`、`inputSchema`（Zod raw shape）、`handler`。`defineMcpTool` 是 SDK 那个 `tool()` 构造器的中性替代品——这层薄封装的意义是让工具定义不依赖任何一家 SDK 的类型。

2. [mcp-tools.ts](../../../container/agent-runner/src/mcp-tools.ts) 的 `createMcpTools(ctx)` 返回数组，`ctx` 里带着本轮的可变上下文（`chatJid`、`channelContext`、`currentInputTurnId`、`isAdminHome`、`interactionMode`、`workspaceMemoryMutationAuth`）。工具处理器读的是这个对象，所以它必须每轮刷新——这是 C01 讲 `applyTurnContext` 的直接原因。

3. IPC 写：[mcp-tools.ts](../../../container/agent-runner/src/mcp-tools.ts) 的 `writeIpcFile` 先写 `*.tmp`（`flag: 'wx'` 保证不覆盖、`mode: 0o600` 保证同机其它用户读不到），再 `renameSync` 成正式文件名。宿主永远不会看到一个正在写的半成品文件。

4. IPC 读：`pollIpcResult(dir, data, resultFilePrefix, timeoutMs)` 先写请求，再以 500ms 间隔读 `<prefix>_<requestId>.json`，读到即 `unlinkSync` 并返回；只有 `code === 'ENOENT'` 被当作「还没好」，其它错误直接抛。默认 30 秒超时，飞书能力那类跨网络的调用给 120 秒。

5. 工具面本身：`send_message`（`delivery_role` 分 `progress`/`final`/`separate`）、`send_image`、`send_file`、`schedule_task`/`list_tasks`/`pause_task`/`resume_task`/`cancel_task`/`update_task`/`run_task_now`/`stop_task_run`/`restore_task`/`list_task_runs`、`register_group`、`feishu_*` 系列（`feishu_get_chat`、`feishu_send_card`、`feishu_edit_message`、`feishu_recall_message`、`feishu_api_request`…）、`discord_get_history` 等、`workspace_memory_search`/`workspace_memory_get`。注意 `send_message` 的描述是**按模式分叉**的：交互模式说「更新已有卡片，不产生第二条回复」，Proactive 模式说「每次调用都是一条独立消息」。

6. 适配层：[pi-tools.ts](../../../container/agent-runner/src/runtime/pi/pi-tools.ts) 的 `adaptClaudeMcpToolsToPi` 把 Zod 形状用 `z.toJSONSchema` 转成 JSON Schema、删掉 `$schema`、`Type.Unsafe` 包一层塞给 Pi；`prepareArguments` 再 `z.object(...).parse(args)` 一次；`execute` 把返回值转成 text/image 内容块并把原始结果放进 `details`。schema 转换失败时退回 `Type.Object({})`，但参数校验仍在执行层生效。

7. 白名单联动：[pi-index.ts](../../../container/agent-runner/src/pi-index.ts) 的 `DEFAULT_ALLOWED_TOOLS` 里写的是通配 `mcp__liteclaw__*`，`PiRuntimeAdapter` 在组装工具列表时把它展开成实际的自定义工具名，再与内置工具别名（`bash`/`read`/`edit`/`write`/`find`/`grep`/`ls`/`Agent`…）一起过滤。所以「加一个工具」不需要改白名单，删一个工具也不会留下悬空名字。

8. 去重：[ipc-send-dedup.ts](../../../src/ipc-send-dedup.ts) 用 `sourceGroup|chatJid|md5(text)` 作键，TTL 10 分钟、上限 500 条；关键在于它**只在会话处于重试状态时才判定为重复**。

## 机制与边界

为什么工具副作用一定要回宿主。Runner 的视野是这一轮任务：它知道模型想做什么，但不知道这个租户的配额还剩多少、这条消息该进哪个话题、这个用户有没有权限往那个群发、这次发送是不是重试。把这些判断塞进 Runner，等于把授权逻辑放进被模型间接控制的环境里——工具描述可以被提示词影响，宿主校验不会。

为什么 `destination` 不能自己猜。`send_message` 的投递目标来自本轮 `ChannelTurnContext`，而不是「最近一条群消息」。一轮里可能先后处理多条用户输入（见 C02 的 `followUp`），如果按最近消息猜目标，就会出现「回答 A 的话发进了 B 的群」。这也是 `inputTurnId` 必须随请求一起传的原因：宿主用它把副作用锚定到具体一轮。

去重为什么只对重试生效。第一次发送是正常行为，同一个文本在同一会话里出现两次完全可能是用户让它重发；只有在宿主因为失败正在重试这一轮时，同样的 `sourceGroup|chatJid|文本` 才意味着「上一次可能已经成功了」。判定还要跨 JID 查重试计数（`web:{folder}`、`sourceGroup`、以及同 folder 的所有 JID），因为入队时用的 JID 和投递时的 JID 可能不同——飞书 `feishu:oc_xxx` 这类 JID 用 folder 猜会漏掉活跃的重试。

参数校验为什么做两次。`prepareArguments` 是给运行时用的：模型给的参数不合 schema 就在这里被拒，错误直接回到模型，不进入执行。执行层再 `parse` 一次是因为工具可能被别的路径调用（比如未来的非 Pi 运行时），不能假设上游一定校验过。

已知边界：`pollIpcResult` 是忙轮询，500ms 粒度的代价是工具调用的感知延迟下限；`Type.Object({})` 的降级路径会让模型看不到参数说明，只能靠描述文字猜；`mcp-tools.ts` 里工具描述与提示词契约必须人工保持同步（源码注释里就记录过一次不一致：任务运行拿到了「发一条完整结果」的提示，却看到了「可以调用零到多次」的工具说明）。

## 需要懂什么

**工具不是函数，是一次跨进程契约。** 一旦接受「副作用在宿主执行」，工具就变成了异步 RPC：有请求 ID、有超时、有结果文件、有幂等键。它的收益是权限与计费集中在一处；代价是每次调用多一次落盘和轮询，且必须处理「请求写成功但结果没回来」。

**为什么用文件而不是 socket。** 与 C01 同源：容器里 PID namespace 隔离、宿主重启不重启容器，文件是双方唯一稳定共享的面。文件还有个副产品——请求和结果天然可审计，出问题能直接看到那条 JSON。

**schema 转换为什么不能失败就报错。** 一个可选工具的 schema 有问题，不应该让整个 Runtime 起不来，因为模型还能用别的工具干活；但如果参数不校验，坏参数会在执行时炸出更难懂的错误。所以拿掉 schema 说明、保留执行校验，是这两者之间的折中。

**工具描述也是提示词。** `send_message` 在不同模式下描述完全不同，不是因为接口不同，而是因为模型需要知道「这一次调用会不会多出一条消息」。工具描述写错，模型的行为就错，这类 bug 不会出现在类型检查里。

## 需要记住什么

主链一口气复述：模型调用工具 → `prepareArguments` 校验 → 纯计算工具在 Runner 内执行、副作用工具写 IPC 请求（`requestId`）→ 宿主鉴权并执行 → 写回 `结果_<requestId>.json` → Runner 轮询读到 → 包成 content 返回模型。

必记参数与不变量：

- 写入原子性：`.tmp` + `rename`，`mode 0o600`，`wx` 不覆盖。
- 轮询：500ms；默认 30s，飞书能力 120s；只吞 `ENOENT`。
- 命名空间 `mcp__liteclaw__*`，白名单用通配展开，不逐个维护。
- 去重键 `sourceGroup|chatJid|md5(text)`，TTL 10 分钟、上限 500，且仅重试期生效。
- 工具结果统一 text/image 内容块；原始返回值进 `details` 供调试。

当前限制：忙轮询没有退避；超时后 Runner 只能报错，宿主侧那条副作用是否已经生效要靠宿主自己的幂等与状态机兜底（见 [C08 渠道可靠投递状态机](./C08-渠道可靠投递状态机.md)）；工具描述与提示词契约靠人工同步，没有自动一致性检查。
