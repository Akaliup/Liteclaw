# C02 Runtime 适配层与单轮执行

> 课程性质：核心
> 返回：[导学](../导学.md)；前置：[C01 Runner 进程协议与 IPC 通道](./C01-runner-进程协议与-ipc-通道.md)；下一课：[C03 上下文工程：Prompt 分层与预算](./C03-上下文工程-prompt-分层与预算.md)
> 对应：B1；见 [面经](../面经.md)；目标掌握：看懂链路、理解机制、设计与表达。

## 本课重点

场景：产品的对外协议（`ContainerOutput` + `StreamEvent`）一行不改，底层执行引擎从 Claude SDK 换成 Pi。C01 讲的是「消息怎么进来、结果怎么出去」，本课讲「中间那一轮到底怎么跑」。

四个结论：

1. 中立契约只有两个接口：[types.ts](../../../container/agent-runner/src/runtime/types.ts) 里的 `AgentRuntime`（`createSession`）与 `RuntimeSession`（`prompt`/`steer`/`followUp`/`abort`/`compact`/`subscribe`/`dispose`）。适配层只做两件事：把 Pi 的 `AgentSessionEvent` 翻成 `RuntimeEvent`，把 `RuntimeEvent` 翻成产品 `StreamEvent` 与 `ContainerOutput`。
2. 一轮不是「遍历消息跑循环」，而是「建一个 Pi 会话 + 一个 25ms 轮询泵」，泵同时盯三件事：哨兵、IPC 目录、会话状态。
3. 结果只发一次靠 `completionPublished` 标志，不靠事件去重；但一个 SDK 查询可以发**多个** result 帧，因为队列里排着后续 turn 时它会重置这个标志。
4. 工具白名单是「别名表 + 硬白名单」双重过滤：别名表把产品 Prompt 里的 Claude 工具名翻成 Pi 原生名，硬白名单再把不在名单内的名字剔掉。

## 主链与职责

```
pi-index.runTurn
  turnPrompt = [owner.block, memory.block, channelContext 块, prompt].join('\n\n')
  tracker = new IpcTurnDeliveryTracker(initialMessages)
  customTools = adaptClaudeMcpToolsToPi(createMcpTools(ctx))
  runPiQueryAttempt({runtime: PiRuntimeAdapter, sessionOptions, prompt, images, …})

runPiQueryAttempt                                   pi-runner.ts:230
  createSession → onSessionId → subscribe(emitRuntimeEvent)
  promptPromise = session.prompt(...)   （不 await，只为拿到 done/error）
  loop 每 25ms:
    shouldClose() → abort → break
    shouldInterrupt() → tracker.cancelCurrentTurn() → abort → break
    acceptIpcMessagesDuringQuery 时：drainInput → acceptTurn → session.followUp
    resultState.result → publishResult
    fatalError → throw
    promptError → throw
    退出条件判定 → break
  finally: unsubscribe + session.dispose()
```

状态所有者：Pi 的 `AgentSession` 持有流式状态、steering 队列、followUp 队列与 jsonl 会话文件；`IpcTurnDeliveryTracker` 持有投递账本（哪批消息被哪个 turn 认领、哪些已 ack）；`resultState` 只是本轮 `result` / `fatalError` 的暂存格，不跨轮。

## 源码阅读

1. `PiRuntimeAdapter.createSession`（[pi-runtime.ts](../../../container/agent-runner/src/runtime/pi/pi-runtime.ts)）先把目录铺好：`sessionDir` 与它上一级的 `agent` 目录都要 `mkdirSync`。`agentDir` 是个固定约定——下面所有凭据和模型清单都挂在它身上。

2. `SettingsManager.create(cwd, agentDir, { projectTrusted: true })`。`projectTrusted` 为真意味着项目目录里的配置直接受信，这是自托管场景的取舍：工作区文件本来由宿主挂载控制。随后一行：

```ts
settingsManager.setCompactionEnabled(options.autoCompactEnabled !== false);
```

未传或传真都开启，只有显式 `false` 才关。`pi-index.ts` 传的是常量 `true`，注释写明历史 Claude SDK 的 percentage/window 旋钮在 Pi 下只是 advisory，Pi 自己按剩余量算阈值。

3. `ModelRuntime.create({ authPath: agentDir/auth.json, modelsPath: agentDir/models.json, refreshOnCreate: false })`，然后 `resolvePiProvider`（[pi-provider.ts](../../../container/agent-runner/src/runtime/pi/pi-provider.ts)）。三条分支值得记住：模型名里没有 `/` 时 provider 取 `anthropic`；自定义端点会被注册成一个独立 provider `miniclaw-<provider>`（`api: 'anthropic-messages'`、`contextWindow: 200_000`、`maxTokens: 32_000`、cost 全 0），这样 Pi 内置的 Anthropic 目录和凭据不受污染；官方端点只 `setRuntimeApiKey('anthropic', apiKey)`。`refreshOnCreate: false` 是为了不每次冷启动都打网络。

4. `DefaultResourceLoader`（`pi-runtime.ts:78`）吃四个来源：`systemPrompt`、`additionalSkillPaths`（`pi-index` 传 `CLAUDE_CONFIG_DIR/skills` 与 `WORKSPACE_GROUP/.claude/skills`，先用 `existsSync` 过滤）、`additionalExtensionPaths`、以及 `settingsManager` + `eventBus`。subagent 扩展由 `resolveSubagentsExtension()` 用 `require.resolve('@tintinweb/pi-subagents')` 解析后自动追加。

5. 加载失败的降级路径（`pi-runtime.ts:87-110`）是本课最容易被追问的一段：

```ts
try {
  await resourceLoader.reload({ resolveProjectTrust: async () => true });
} catch (error) {
  if (!subagentsExtension || !extensionPaths.includes(subagentsExtension)) throw error;
  // 只用「去掉 subagent 扩展」的 path 集重建 Loader 再 reload
}
```

降级的范围被刻意限死在「可选扩展」：剔掉 subagent 扩展、重建 Loader、再 reload 一次；其它任何加载错误照原样抛。这里不换 runtime、不吞错——注释原话是不要让 Pi 在可选扩展缺失时静默降级到 Claude。于是调用方看到的失败是「选了 pi 却在 pi 里失败」，而不是「悄悄跑在另一个引擎上」。

6. 会话续接靠文件名约定（`existingPiSessionPath`）：在 `sessionDir` 里找以 `_<sessionId>.jsonl` 结尾的文件，`sort()` 后取 `at(-1)`。命中就 `SessionManager.open(file, sessionDir, cwd)`，否则 `SessionManager.create(cwd, sessionDir, { id: sessionId })`。取最后一个是因为同一 sessionId 可能有多份历史文件，按文件名排序取最新。

7. 工具别名表（`pi-runtime.ts:122`）：

```ts
const toolAliases: Record<string, string> = {
  Bash: 'bash', Read: 'read', Write: 'write', Edit: 'edit',
  Glob: 'find', Grep: 'grep',
  Task: 'Agent', TaskOutput: 'get_subagent_result', TaskStop: 'steer_subagent',
};
```

白名单展开时 `mcp__miniclaw__*` 这一项展开成全部自定义工具名，其它项走别名映射，然后 `new Set` 去重，再过滤：核心工具只留 `read/bash/edit/write/find/grep/ls`，要么是自定义工具，要么是 `Agent` / `get_subagent_result` / `steer_subagent`。别名表存在的理由是产品 Prompt 与能力清单里写的是 Claude 工具名，Pi 里同能力不同名——尤其 `Task → Agent`。

8. `createAgentSession({ …, thinkingLevel: options.thinkingLevel === 'off' ? 'minimal' : options.thinkingLevel, tools: selectedTools, excludeTools, customTools, resourceLoader, sessionManager, settingsManager })`，返回值包成 `PiRuntimeSession(session, eventBus)`。`off → minimal` 是把「无思考」映射到 Pi 能表达的最低档。

9. `mapPiEvent`（[pi-session.ts](../../../container/agent-runner/src/runtime/pi/pi-session.ts)）是纯函数映射表：`message_update` 里按 `assistantMessageEvent.type` 分出 `text_delta` / `thinking_delta` / `toolcall_start`（从 `update.partial.content` 里找 `toolCall`）/ `toolcall_end`；`tool_execution_start|update|end` 直译成 `tool_start|tool_update|tool_end`；`compaction_start|end` 带 `reason` 与 `errorMessage`；`queue_update` 被压成一行状态文本 `queued: N steer / M follow-up`。`agent_end` 取最后一条 assistant 消息：

```ts
finalizationReason:
  assistant.stopReason === 'aborted' ? 'interrupted'
  : assistant.stopReason === 'error' ? 'error'
  : 'completed',
```

`RuntimeResult` 的联合里还有 `'truncated'`，但 Pi 这条路没有任何分支产出它——那是宿主 `truncation_continue` 老路径的遗留位。

10. `PiRuntimeSession.prompt` 有个细节（`pi-session.ts:197`）：图片先 `filter((image) => !!image.mimeType)`，没有 mimeType 的图片被直接丢，`mimeType || 'image/jpeg'` 的兜底因此永远走不到。`steer` / `followUp` 只传文本。`dispose()` 用 `disposed` 标志做幂等。

11. `toStreamEvent`（`pi-runner.ts:72`）是产品化的最后一跳。`text_delta` → `displayLevel: 'primary'`（直接上屏）；`thinking_delta` / 工具三态 / usage / status / compaction → `'detail'`（trace 面板）；`session` → `'debug'`。`agentScope` 在 subagent 事件上是 `'subagent'`，状态类事件是 `'system'`，其余 `'main'`。工具事件的 `agentScope` 写成 `event.toolName.startsWith('mcp__') ? 'main' : 'main'`——两个分支相同，是个无害的死三元。

12. `runPiQueryAttempt` 的循环体（`pi-runner.ts:286`）顺序是有讲究的：先哨兵，再收 IPC，再发结果，再抛错误，最后判退出。`promptError` 的抛出位置被显式注释解释过：Pi 的 `prompt()` 可能在 `agent_end` 之前就 reject（凭据缺失就是典型），这个错误必须先于「队列不变量」抛出去，否则宿主拿到的是 `Pi session ended with uncompleted input turns` 这种没有病因的报错。

13. `publishResult`（`pi-runner.ts:246`）是幂等点：`completionPublished` 为真直接返回；否则 `tracker.completeNextTurn()` 取回本轮的 receipt 列表，发一帧 `status: inputTurnCompleted ? 'success' : 'error'` 的结果，带 `queryIdle: !tracker.hasPendingTurns`。若本轮健康完成且队列里还有后续 turn，它把 `completionPublished` 复位为 false 并 `onTurnActivated(...)`——同一个 SDK 查询继续为下一条输入产出结果帧。

14. `adaptClaudeMcpToolsToPi`（[pi-tools.ts](../../../container/agent-runner/src/runtime/pi/pi-tools.ts)）：Zod raw shape → `z.toJSONSchema` → 删 `$schema` → `Type.Unsafe`；转换抛错时降级成 `Type.Object({})`，但 `prepareArguments` 仍在执行期用 `z.object(...).parse(args)` 校验。名字统一加 `mcp__miniclaw__` 前缀。

## 机制与边界

为什么契约里是 `prompt` / `steer` / `followUp` 三个方法而不是一个 `send(text)`。三者语义在 Pi 里落点不同：`prompt` 开一轮新的用户输入；`steer` 插到当前执行中间改变方向，模型当轮就能看到；`followUp` 排在当前轮之后当作下一条用户消息。产品侧 `acceptIpcMessagesDuringQuery` 用的正是 `followUp`——用户补一句话不该打断正在跑的工具调用，但必须被计入「还没回答的输入」，否则 ack 语义就错了。tracker 的 `pendingTurnCount` 注释把这条讲得很直白：结果帧可能先到，而 steer 已经排进同一个流里，调用方必须等队列清零才能拆流。

25ms 轮询为什么存在。Pi 的事件是推的（`subscribe` 回调），但「关掉 / 中断 / 有新 IPC 文件」这三件事是拉的——它们是文件系统状态，没有能被 `await` 的通知。要在一个循环里同时等推与拉，最省事的就是定时拍一次。代价是 25ms 的响应延迟和空转唤醒；收益是不用为「文件出现」和「事件到达」写两套并发原语。这是当前实现的取舍，不是性能结论。

一轮里可能出现多帧 result。`publishResult` 的复位逻辑意味着：用户在第一句还在跑时又发一句，tracker 里就有两个 turn；第一个 turn 结束时发结果帧并 `onTurnActivated`（重设 `activeInputTurnId`，见 C01），第二个 turn 结束时再发一帧。宿主因此必须按 `inputTurnId` 归档流帧，而不是假设「一个进程一次结果」。

`finally` 里只做两件事：`unsubscribe()` 与 `session.dispose()`。dispose 是幂等的，所以循环因异常退出也不会漏掉清理；反过来，`session` 若在 `createSession` 阶段就抛错（例如自定义端点缺 `ANTHROPIC_BASE_URL`），`runPiQueryAttempt` 根本没有可 dispose 的对象，错误直接冒到 `main` 的 catch，最终是 `status: 'error'` + `process.exitCode = 1`。

并发与生命周期风险（当前实现，标注为观察）：轮询泵在 `acceptIpcMessagesDuringQuery` 为真时每拍都 `drainInput()`，同一拍里可以取走多条文件，逐条 `acceptTurn` + `followUp`；`followUp` 是 `await` 的，如果 Pi 的 followUp 在流式过程中阻塞，泵的节拍会被拉长，期间哨兵检查被推后。第二个风险在 `emit` 侧：`pi-index` 的 `emit` 包了一层「proactive 模式下把 `result` 挪进 `proactiveFinalCandidate`」，任何新增的结果帧都要经过这层改写，改动协议字段时要同时看这个包装。

分析推断（源码未断言）：`queue_update` 被压成一行文本后丢了结构化队列长度，宿主只能从字符串里读；如果后续要用队列长度做背压，这一层需要重新设计。

## 需要懂什么

适配层的价值不在「支持两个引擎」，而在「产品概念不进适配层」。`RuntimeSessionOptions` 里没有 `groupFolder`、没有 `chatJid`、没有 `channelContext`——那些是 Miniclaw 的东西，止步于 `pi-index`。适配层只看见 `cwd`、`sessionDir`、`model`、`systemPrompt`、工具名单、技能路径、provider 三件套。这条边界让 `runtime/types.ts` 的注释能成立：「产品协议刻意留在这个模块之外」。

降级为什么只降扩展、不降引擎。降引擎是最容易写、也最难查的故障：日志里一切正常，模型答得也不错，但工具名、上下文、会话续接全换了套逻辑，问题只在某个渠道的某个卡片上暴露。所以这里的策略是「保留选择、暴露失败」：`resolveSubagentsExtension()` 拿不到扩展就根本不进降级分支；拿到了但 reload 失败，只把这一项剔掉，让需要它的工具在执行期显式失败。

别名表是历史债的正规化。产品 Prompt（`container/agent-runner/prompts/`）与能力清单里写的是 `Bash`、`Glob`、`Task`，Pi 里叫 `bash`、`find`、`Agent`。硬白名单则防住另一类问题：`allowedTools` 是从宿主透传的字符串数组，白名单把「不在核心集、也不是自定义工具、也不是 subagent 三件套」的名字全滤掉，避免 Pi 收到无效工具名后整轮起不来。

`z.toJSONSchema` + `Type.Unsafe` 而不是手写 TypeBox schema。MCP 工具定义已经用 Zod 写了校验，再手抄一份 TypeBox 就是两份真相；`Type.Unsafe` 让 Pi 侧接受标准 JSON Schema 而不再二次校验。转换失败降级为空对象 schema，把校验责任挪到 `prepareArguments`——这条路径保证「一个坏的可选工具」不会拖垮整个 runtime 启动。

## 需要记住什么

主链一口气复述：`runTurn` 组 prompt + tracker + 自定义工具 → `PiRuntimeAdapter.createSession`（SettingsManager / ModelRuntime+provider / ResourceLoader / SessionManager / 工具白名单 / `createAgentSession`）→ `runPiQueryAttempt` 起 25ms 泵 → `PiRuntimeSession` 把 Pi 事件翻成 `RuntimeEvent` → `toStreamEvent` 翻成 `StreamEvent` → `publishResult` 发带 receipt 的结果帧 → `finally` dispose。

不变量：

- 中立接口固定六个动作：`prompt` / `steer` / `followUp` / `abort` / `compact` / `subscribe`，加 `dispose`；`isStreaming` 与 `sessionId` 只读。
- 每轮新建一个 `AgentSession`，轮末 `dispose`；会话连续性靠 `_<sessionId>.jsonl` 文件，不靠进程内存。
- `completionPublished` 是一轮内结果帧的幂等闸；健康完成且有后续 turn 时会被复位。
- 工具选择 = 别名映射 → 去重 → 白名单过滤；`excludeTools` 也走同一张别名表。
- 只有显式 `autoCompactEnabled === false` 才关压缩；`thinkingLevel: 'off'` 被映射成 `'minimal'`。
- Pi 路径产出的 `finalizationReason` 只有 `completed` / `interrupted` / `error` 三种。

当前限制：25ms 轮询是固定节拍，没有自适应退避；`queue_update` 只保留文本，队列长度不可结构化消费；工具别名表是硬编码的九个条目，新增 Pi 原生工具要同时改这张表和白名单。
