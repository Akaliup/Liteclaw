# C01 Runner 进程协议与 IPC 通道

> 课程性质：核心
> 返回：[导学](../导学.md)；前置：无；下一课：[C02 Runtime 适配层与单轮执行](./C02-runtime-适配层与单轮执行.md)
> 对应：B1；见 [面经](../面经.md)；目标掌握：看懂链路、理解机制、设计与表达。

## 本课重点

场景：飞书群里用户 @ 机器人说「帮我看下 error.log」。宿主（`src/index.ts` + `group-queue`）要让 Agent Runner 拿到这句话、边跑边把字流回卡片，并且在同一个进程里继续接住群里的下一句——中间不重启、不重连。

四个结论：

1. Runner 与宿主之间的硬协议只有两条：stdin 收一个 `ContainerInput` JSON，stdout 吐被 `---LITECLAW_OUTPUT_START---` / `---LITECLAW_OUTPUT_END---` 包裹的 `ContainerOutput` JSON 行。没有 socket、没有 RPC、没有回调注册。
2. 进程起来之后，新消息一律走 IPC 目录（容器内 `/workspace/ipc/input`，宿主模式 `data/ipc/{folder}/input`），落成 `*.json` 文件；控制面用三个空文件当哨兵。
3. 每条输出都盖 `inputTurnId`。轮内并发（用户边跑边追加）让「这段输出属于哪句输入」变成必须显式携带的事实，`activeInputTurnId` 是 Runner 侧唯一事实源。
4. 退出有三种语义（closed / interrupted / error），宿主对三者的处理路径不同：只有 `closed` 会把 `hasClosedOutput` 置真，`error` 会把 `process.exitCode` 置 1。

## 主链与职责

```
宿主 group-queue
├─ container-runner.runHostAgent()            src/container-runner.ts:2295
│    spawn(node dist/pi-index.js, stdio:pipe, cwd=groupDir)
│    stdin.write(JSON.stringify(ContainerInput)); stdin.end()
└─ container-runner.runContainerAgent()       src/container-runner.ts:1671
     docker run -i --rm …  →  entrypoint.sh 把 stdin 落 /tmp/input.json 再喂 node

Runner  pi-index.main()                       container/agent-runner/src/pi-index.ts:427
  readStdin → JSON.parse → 建 McpContext → drainInput() 预取
  while (true):
    runTurn() → runPiQueryAttempt() → PiRuntimeAdapter / PiRuntimeSession
              → emit(ContainerOutput) → writeOutput() → stdout 标记帧
    重排队未 ack 的 pending 消息
    waitForNextInput()  ←  watcher(fs.watch + 1s 轮询)

宿主 agent-output-parser.attachStdoutHandler()  src/agent-output-parser.ts:104
  标记定位 + 大括号配平 → onOutput() → Web 卡片 / IM 流式
```

状态所有者：

| 状态 | 所有者 | 落点 |
| --- | --- | --- |
| 会话上下文（历史消息） | Pi `SessionManager` | `CLAUDE_CONFIG_DIR/sessions/<…>_<sessionId>.jsonl` |
| 本轮输入身份 | Runner 进程 | `activeInputTurnId`、`input.turnId`、`ctx.currentInputTurnId` |
| 投递是否 ack | 宿主 durable 队列 | `channel-reliability-store`，Runner 只持 receipt 副本 |
| 暖进程存活 | 宿主 `group-queue` | `CONTAINER_TIMEOUT` / `IDLE_TIMEOUT` |

跨层契约就是 `ContainerInput` / `ContainerOutput` 两个接口：`src/container-runner.ts:344` 与 `container/agent-runner/src/types.ts:194` 各有一份同构声明（`make sync-types` 校验副本一致性），字段改名会同时打断两侧。

## 源码阅读

按执行顺序。

1. 容器内第一跳：`entrypoint.sh:158-163` 先 `cat > /tmp/input.json`，再 `runuser -u node -- node /tmp/dist/pi-index.js < /tmp/input.json`。先落文件是因为 `runuser` 之后 node 的 stdin 需要 EOF 才会 flush；宿主侧 `proc.stdin.write(...)` + `proc.stdin.end()`（`src/container-runner.ts:2836`）正好制造这个 EOF。

2. `readStdin()`（`pi-index.ts:106`）：把 stdin 读空再 `JSON.parse`。一次读、一次解析——首包永远是「一轮对话的完整 bootstrap」。

3. `main()` 的第一件事是 Pi-only 断言（`pi-index.ts:431`）：

```ts
if (resolveAgentRuntimeKind(process.env) !== 'pi') {
  throw new Error(
    'The production runner is Pi-only; use the legacy runner explicitly for rollback.',
  );
}
```

`resolveAgentRuntimeKind`（[runtime-config.ts](../../../container/agent-runner/src/runtime-config.ts)）在环境变量未配置时返回 `'pi'`。这个断言真正拦的是「有人把 `AGENT_RUNTIME=claude` 显式塞进容器」这种回滚动作，不是「没配」。

4. `McpContext` 构建（`pi-index.ts:447`）：`chatJid`、`channelContext`、`currentTaskId`、`currentInputTurnId`、`workspaceIpc` 等可变字段全在这层落地。MCP 工具读的就是这个对象（`mcp-tools.ts:27`），工具侧拿 `currentInputTurnId` 拼幂等键，所以它必须每轮刷新。

5. `drainInput()`（`pi-index.ts:116`）：`readdirSync` 取 `*.json` → `JSON.parse` → **立刻 `unlinkSync`** → 再判断 `type === 'message'` 与 `text` 是否为字符串。删除发生在校验之前，坏文件不重试，只在 stderr 留一行 `Failed to process IPC input`。末尾 `orderIpcInputMessages` 排序。

6. `orderIpcInputMessages`（[ipc-delivery.ts](../../../container/agent-runner/src/ipc-delivery.ts)）的注释是整条通道最关键的一句：重排队的消息会拿到比「查询拆除时写入的消息」更新的文件名，光看文件名会颠倒两次已被接受的用户轮次。整批都带 receipt 时才按 `receipt.cursor` 排；混入无 receipt 的 legacy 消息就保持原序，因为缺游标的消息没有可比对的位置。

7. `watcher()` + `waitForNextInput()`（`pi-index.ts:167`、`192`）：`fs.watch` 只是加速，1 秒 `setInterval` 才是保底，`timer.unref()` 让等待中的进程能自然退出。两个来源都调同一个 `check()`，靠 `done` 标志做幂等。

8. 三个哨兵（`pi-index.ts:49`）：`_close`、`_interrupt`、`_drain`，`consumeSentinel` 读即删。`waitForNextInput` 把 `_close` 与 `_drain` 都当「本轮结束、离开等待」；`_interrupt` 只在查询轮询里被消费（见 C02）。

9. `writeOutput()`（`pi-index.ts:85`）只有五行，却承担归属：

```ts
const correlated = activeInputTurnId
  ? { ...output, inputTurnId: output.inputTurnId ?? activeInputTurnId }
  : output;
```

标记用三次 `console.log`（START、JSON、END）。日志一律走 `console.error`（`log()` / `logWarn()`），这是 stdout 可解析的前提。

10. main 的 while（`pi-index.ts:486`）：每轮 `runTurn` 之后先把 `result.pending` 写回 input 目录（`{ type: 'message', … }`，文件名 `Date.now()-random`），再看 `closed` 直接 `writeOutput({ status: 'closed' })` 并返回，`interrupted` 只记一行日志后继续等，末尾 `waitForNextInput()`。

11. `applyTurnContext()`（`pi-index.ts:224`）：把 `sourceJid`、`channelContext`、`taskId`、`queryRunId` 从本批消息的「最新一条」写进 `ContainerInput` 与 `McpContext`，并把 `ctx.currentInputTurnId` 定为 `receipt.deliveryId || queryRunId || turnId`。「最新」的判定走 `latestIpcInputMessage`，按 receipt 游标取最大，不是取数组末位。

12. 宿主侧 `attachStdoutHandler`（[agent-output-parser.ts](../../../src/agent-output-parser.ts)）：定位 START、跳过空白、要求负载以 `{` 开头、`findJsonObjectEnd` 做字符串感知的配平，最后才确认 END。用配平而不是扫 END 的原因写在同一段注释里：模型回复正文可能原样引用标记字符串，扫 END 会被内容骗。解析成功后 `resetTimeout()`——只有 stdout 帧续命，stderr 不续命。

13. `buildContainerArgs`（`src/container-runner.ts:1637`）：`docker run -i --rm --name … -e TZ=… -v hostPath:containerPath[:ro] …`。`-i` 是 stdin 通道存在的前提，`--rm` 保证暖超时被杀掉的容器不积垃圾。

## 机制与边界

进程边界解决的是依赖与权限，不是性能。Runner 是独立 Node 进程（容器里还是非 root），宿主不必 import 任何 Agent SDK；SDK 崩、工具死循环、模型流卡住，最多杀掉这一棵进程树，宿主的事件循环和 Web/IM 连接池不受影响。反过来宿主不认 Pi 的事件模型，只认 `ContainerOutput`。

stdout 用「带标记的 JSON 行」而不是裸 JSON，是因为 stdout 是共享的：SDK、工具、第三方库都会往里打东西。定长标记加括号配平让宿主能在任意切片边界重建帧，同一个 chunk 里也能连续解出多帧；`parseBuffer` 超过 10MB 时按最后一个 START 截断，避免脏流把内存拖死。

IPC 目录存在的唯一理由是暖 Runner。`IDLE_TIMEOUT` 默认 1800000（30 分钟）——一个已经加载好系统提示、工具、Skill 的进程，如果每条群消息都重开，冷启动成本全落在用户等待上。目录是 Runner 与宿主唯一同时可写的面（Docker 挂载 / 同机路径），写文件比开 socket 简单，也比信号可靠：容器里 PID namespace 隔离，`docker kill` 杀的是整个容器，`SIGUSR1` 之类到不了 agent 进程。

归属为什么必须显式。一轮 runTurn 期间用户可以再发一句：`acceptIpcMessagesDuringQuery: true` 时 Runner 会把新消息 `tracker.acceptTurn` + `session.followUp`（见 C02），于是一个 SDK 查询里可能有多条用户输入先后被回答。此时如果按时间戳或数组末位去猜「输出属于哪条输入」，就会把后一条的投递目标（哪个群、哪个话题、哪张卡片）错配给前一条的正文——投递目标写错就是发进别人群里。所以 `activeInputTurnId` 是进程级可变全局，只在两个时刻改写：新一轮开始（`onTurnActivated`）和 bootstrap 阶段（`runTurn` 里的 `latestIpcDeliveryId(...) || input.turnId || generateTurnId()`）。

异常路径与已知缝隙（当前实现）：

- `_close` 在**等待阶段**被消费时，`waitForNextInput` 返回 `null`，`main` 直接 `return`，不写任何 `closed` 帧；只有 `_close` 落在 **runTurn 期间**（`shouldClose()` 命中）才走 `writeOutput({ status: 'closed' })`。宿主对这两种退出都走成功分支（`handleSuccessClose`），差别只体现在最终 status 是否为 `closed`。
- `_interrupt` 命中时 `tracker.cancelCurrentTurn()` 移出的消息既不发 receipt，也不进回写列表（`runTurn` 只返回 `pending`）。语义上是「用户显式中断＝放弃这一轮」，但宿主侧那条投递没有 ack，只能靠自身 durable 队列的下一次投递收敛。
- `process.exitCode = 1` 只出现在两处：bootstrap 阶段模型缺失（写完 error 帧就 `return`），以及 `main` 的 catch。最外层还有 `main().catch` 里的 `process.exit(1)`。

分析推断（源码没有直接断言，讨论时标注）：暖 Runner 半路被 OOM 或杀掉时，Runner 侧没有任何「上一轮做到哪」的持久承诺，能依赖的只有宿主游标和 jsonl 会话文件；所以 `inputTurnCompleted` / `queryIdle` 这类字段必须由 Runner 主动发帧表达，宿主不要试图从进程是否退出来反推轮次是否完成。

## 需要懂什么

协议选型的取舍。stdin 一次性 JSON + stdout 行协议约等于「进程即函数调用」：宿主写入参数、收走返回值，中间状态用流帧旁路。代价是双向通信必须借文件系统；收益是宿主实现只需要几十行 spawn 加解析，任何语言都能照着重写 Runner。

为什么不往这个协议上加 RPC：容器是 `--rm` 的短命体，暖 Runner 靠 IPC 目录续命，宿主的重启不影响在跑的容器。换成 socket 之后宿主重启就得重连协商、处理半开连接；文件系统天生是「写进去就在」。

receipt 里为什么既有 `cursor` 又有 `coveredCursors`。一条 IPC 文件可以覆盖多条群消息（宿主把同一轮的多条消息合并成一次投递）。`parseIpcReceipt` 要求 `coveredCursors` 里的最大值必须等于 `cursor`，否则整条 receipt 被丢弃——这是在防止一份 receipt 声称覆盖了它其实没覆盖的游标，那会让宿主提前推进游标、丢掉用户消息。

排序为什么不能只靠文件名。`drainInput` 按 `readdirSync().sort()` 读，但重排队文件名是 `Date.now()-random`，同毫秒内的先后本来就是随机的（`latestIpcDeliveryId` 的注释也这么写）。文件序只作「无 receipt 时的兜底」，durable 顺序以数据库游标为准。

## 需要记住什么

主链一口气复述：宿主 spawn Runner → stdin 一个 `ContainerInput` → Runner 建 `McpContext`、预取 IPC → `runTurn` 跑一轮 Agent → 每帧 `writeOutput` 带 `inputTurnId` → 宿主按标记配平解析 → 轮次结束后 `waitForNextInput` 等 IPC，未 ack 的消息回写 input 目录。

不变量：

- stdout 只出现标记帧；日志全走 stderr，前缀 `[agent-runner]` / `[agent-runner:warn]`。
- 每帧输出带 `inputTurnId`：IPC 轮用 `receipt.deliveryId`，冷启动轮用 `input.turnId`。
- IPC 文件与哨兵消费即删；坏 JSON 也删，不重试。
- `input.turnId` 每轮轮换（`onTurnCompleted` 里 `generateTurnId()`），但 `inputTurnId` 在一条投递被回答期间保持不动。
- `resolveAgentRuntimeKind` 未配置时默认 `pi`；显式 `claude` 会让生产入口立刻抛错。

当前限制：只有一个 input 目录，没有按通道分区；哨兵是单次消费语义，`_close` 与 `_interrupt` 同时落地时谁先被 `check()` 看到取决于调用顺序；宿主解析遇到非 JSON 对象负载只能跳帧重同步，跳掉的帧不重放。
