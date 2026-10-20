# C06 会话串行队列与 Runner 生命周期

> 课程性质：核心
> 返回：[导学](../导学.md)；前置：[C05 工具面：MCP 工具与 IPC 回调](./C05-工具面-mcp-工具与-ipc-回调.md)；下一课：[C07 流式事件契约与三段同步](./C07-流式事件契约与三段同步.md)
> 对应：B4；见 [面经](../面经.md)；目标掌握：看懂链路、理解机制、设计与表达。

## 本课重点

场景：飞书有两个话题群同时在用同一个 Agent，Web 上还有一个页面在聊；其中一个话题里的模型调用卡住了，另一个用户正等着回复；与此同时管理员正在改这个 Agent 的技能配置。

这一课要回答的问题只有一个：**谁在什么条件下可以启动、复用、暂停和杀掉一个 Runner**。四个结论：

1. 并发边界是**序列化键**，不是群、不是用户、不是 JID。同一个逻辑会话的多个 JID 共享一个 Runner 且严格串行；不同会话必须能并行。
2. 容量闸门分模式：容器模式受系统并发上限和用户计费并发双重限制；宿主模式**故意没有**应用层并发池。
3. 失败恢复是有界指数退避，但有三类例外：上下文溢出、用户刚停止、配置变更中——它们的重试语义完全不同。
4. 停止与变更走三段式：暂停（保留待重放输入）→ 提交 → 恢复或丢弃。卡死判定用「候选 + 重校验 + CPU 探针」，不用「跑了多久」。

## 主链与职责

```
新消息/任务
└─ enqueueMessageCheck(jid) / enqueueTask(jid, task)
   └─ hasCapacityFor(jid)?
      ├─ host 模式：true（序列化键是唯一准入边界）
      └─ container 模式：activeContainerCount < maxConcurrentContainers
                         且 userConcurrentLimit(jid).allowed
   └─ runForGroup(jid, reason)
      ├─ 重入保护：state.active 已真 → 直接返回（pending 由活跃 Runner 的 finally 兜）
      ├─ 取消旧 retry timer，保留 retryCount
      ├─ 置 active/queryId/runnerGeneration，计数 +1
      ├─ processMessagesFn(jid)   ← 真正拉起 Runner 并跑一轮
      └─ finally：
         cleanupIpcSentinels → recoverUnacknowledgedIpcDeliveries → recoverUnconsumedIpc
         hasIpcInjectedMessages → pendingMessages=true（用户刚 Stop 时跳过）
         清空 active 状态、计数 -1、announceQueryFinish
         restarting ? 等 restartGroup : drainGroup(jid)
```

状态所有者：`GroupState` 持有 `active`、`queryId`、`runnerGeneration`、`retryCount`、`ipcOwedSinceAt`、`hasIpcInjectedMessages`；Runner 进程只持有本轮输入身份；投递凭据的真值在宿主的 durable 记录里（见 [C08](./C08-渠道可靠投递状态机.md)）。

## 源码阅读

1. 入口与准入：[group-queue.ts](../../../src/group-queue.ts) 的 `enqueueMessageCheck` / `enqueueTask` 最终都走到 `runForGroup` / `runTask`。准入看 `hasCapacityFor`：宿主模式第一行就 `return true`，注释写得很直白——容器模式每个回合占一份受管的 Docker 分配，所以要显式限额；宿主进程由操作系统管，如果在这里放一个全局槽位，一个空闲但没超时的暖会话就能把无关的飞书话题堵住长达一个空闲超时周期。

2. 序列化键：`getSerializationKey(jid)` 由注入的 resolver 决定，`findActiveRunnerFor(jid)` 按「键相同且 state.active」反查真正的活跃 Runner。于是「同一会话的另一个 JID 来消息」会被路由到已有的那个进程，而不是新起一个。`requestDrainForActiveRunner` 特别强调要写给**真正持有该键的 runner state**，而不是调用方自己的 state，否则哨兵会落在没人读的目录里。

3. 一轮的骨架：`runForGroup`（2312 行起）。先是重入保护（`state.active` 已真就返回，pending 由活跃 Runner 的 `finally → drainGroup` 兜住，不会丢活），再取消旧退避计时器但**保留 `retryCount`**（注释解释了原因：新消息合法地提前启动一轮，但不能把连续异常洗白），然后置 `active`、`runnerGeneration += 1`、`queryId = randomUUID()`、计数 +1，调用 `processMessagesFn`。

4. finally 的收尾顺序不能乱：先 `cleanupIpcSentinels`，再 `recoverUnacknowledgedIpcDeliveries`，再 `recoverUnconsumedIpc('agent exit')`，然后才清空 `groupFolder` / `agentId` —— 因为这些恢复函数要靠 `groupFolder` 定位 IPC 目录。之后按 `hasIpcInjectedMessages` 决定是否重新置 `pendingMessages`，但如果用户刚点过停止（`recentlyStoppedFolders` 时间窗内），跳过这次 re-arm，否则会出现「点了停止又自己爬起来」。

5. 退避：`canScheduleRetry` / `scheduleRetry` 做有界指数退避。`markContextOverflow` 会把该会话标成上下文溢出并跳过退避——等一会儿不会让上下文变小，正确动作是马上重排并让运行时压缩。

6. 变更事务：`pauseGroupsForMutation` 返回 `MutationPauseToken`，暂停期间 `runForGroup` 把消息挂成 pending 但不启动；`resumeGroupsAfterMutation` 恢复；`discardGroupsAfterMutation` 丢弃挂起任务。配套的 `getRecentStopDisposition(folder)` 区分 `discard`（普通用户停止，中断的输入扔掉）和 `preserve`（变更引起的停止，输入要留给新 Runner 重放）。

7. 停止与重启：`stopGroup` 走优雅路径（写 drain/关闭哨兵、等 teardown waiter），`restartGroup` 在旧 Runner 退出后再拉起替代者；`waitForRunnerTeardown` 那组 waiter 就是为「等旧进程真的死了」准备的。

8. 卡死判定：`getStuckPendingGroups` 只产出**候选**，`revalidateStuckRecoveryCandidate` 再校验一次（挑出来到动手之间，Runner 可能刚好活过来），然后交给 [stuck-runner-recovery.ts](../../../src/stuck-runner-recovery.ts) 的 `decideStuckRunnerRecovery` 决策。

9. 两个计时器：[runner-liveness.ts](../../../src/runner-liveness.ts) 的 `resolveRunnerLivenessTimeouts` 让 `idleCloseMs = min(执行超时, 空闲超时)`、`watchdogMs = max(执行超时, idleCloseMs) + 15s 宽限`。注释记录了一个真实的历史竞态：两个默认值都是 30 分钟时，外层看门狗在宿主投影输出**之前**就被重置、空闲计时器在**之后**才重置，于是看门狗稳定地赢得比赛，把健康的会话记成超时。

## 机制与边界

**为什么序列化键比「群」更准确。** 产品里一个逻辑会话可以有多个入口：群里的主上下文、某个话题的原生上下文、Web 页面。它们共享同一份 Pi 会话文件，也就是共享历史。如果按 JID 隔离，两个入口会同时往同一份历史里追加消息，模型看到的是交错的、互相打断的上下文。反过来，不同话题、不同私聊之间没有任何共享状态，串行它们是纯粹的性能损失——所以键相同才串行。

**为什么宿主模式不设全局并发池。** 这不是遗漏，是那次「暖会话堵住别人」事故后的选择。代价是宿主模式没有应用层背压，靠操作系统和单轮超时兜底；收益是不同会话之间互不影响。容器模式保留限额，因为每个容器是真实资源分配，且和计费挂钩。

**退避的三个例外为什么必须分开。** 上下文溢出：重试前必须做压缩，等没有意义；用户刚停止：重试会表现为「停不下来」；配置变更中：失败原因是正在换运行时，重试只会撞上同一堵墙。把这三类混进普通退避，会出现「点了停止还在重试」「换了配置后一直失败」这种非常难排查的现象。

**停止为什么分 discard 和 preserve。** 用户点停止是明确的「这次不要了」；系统为了换配置而停止不是用户意图，输入必须留下。这两者混同的后果是：改一次技能配置，用户正在问的问题就静默消失了。

**卡死检测为什么不能只看时间。** 一个跑长工具的 Turn 和真正卡死，在「启动时长」上没有区别。所以用活动信号（`lastActivityAt`、`ipcOwedSinceAt`）判断，再用 CPU 探针辅助：宿主模式读 `ps` 看后代进程 CPU，超过 0.5% 视为活跃并延后处理；容器模式**不探**（宿主看到的 `docker` CLI 进程不是容器内部负载），一律宽限到硬上限。IPC 债务（`ipcOwedMs`）有独立的绝对上限，因为普通输出能刷新活动时间，但「有消息在等却一直没被消费」不能靠输出洗白。

**已知边界**：`drainWaiting` 的调度顺序不保证公平；`stopGroup` 在 Runner 不响应软路径时依赖进程树杀灭，`killProcessTree` 之后的状态恢复靠 durable 记录而不是进程内状态；`getStatus` 暴露的是内存快照，重启后要从数据库重建。

## 需要懂什么

**队列治理的核心不是「限制并发数」，而是定义「哪些工作必须共享一个执行体，哪些必须不共享」。** 序列化键就是把这条业务语义写进调度器的唯一位置。回答了这个问题，容量、重试、暂停才有地方挂。

**生命周期状态必须是显式的枚举，不能用「进程在不在」推断。** `active`、`restarting`、`stopRequested`、`mutationPaused`、`drainSentinelWritten` 这些字段存在的理由，是每个都存在一种「进程状态看起来正常但语义已经变了」的情况。

**优雅停止永远优先于杀。** 软路径保住两样东西：正在流式的输出，和未确认的投递。杀掉之后，这两样都要靠宿主侧的持久记录来补偿，成本高得多。

**计时器之间必须有确定性的先后关系。** 两个都设 30 分钟时定时器谁先触发是竞态，不是配置。把「优雅回收」的期限压到严格早于「外部看门狗」，是让行为可预测的最小改动。

## 需要记住什么

主链：`消息/任务 → 准入(模式相关容量) → runForGroup(重入保护/取消旧计时器/保留重试计数) → processMessagesFn → finally(哨兵清理→投递恢复→pending 重排→计数归零) → drainGroup 或 restartGroup`。

必记不变量：

- 同一序列化键同时最多一个活跃 Runner；`findActiveRunnerFor` 是共享判定的唯一入口。
- `retryCount` 只在成功时归零；取消计时器不清计数。
- finally 的恢复顺序依赖 `groupFolder`，清空必须放在恢复之后。
- 用户停止后的时间窗内不自动 re-arm，不 drain。
- `idleCloseMs = min(执行超时, 空闲超时)`，`watchdogMs = max(...) + 15s`。
- 容器卡死靠宽限到硬上限，宿主卡死看 CPU 探针；IPC 债务上限独立计算。

当前限制与可讨论的演进：调度没有公平性保证（同会话连续失败会长期占用等待队列的时间片）；没有跨进程的 Runner 注册表，多实例部署时序列化只在单进程内成立；`killProcessTree` 之后的资源清理依赖操作系统（见 [面经 Q4](../面经.md)）。
