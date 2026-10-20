# C10 长期记忆：FTS5 检索与写入治理

> 课程性质：核心
> 返回：[导学](../导学.md)；前置：[C09 定时任务调度与重启恢复](./C09-定时任务调度与重启恢复.md)；下一课：[C11 多租户隔离与 Agent Profile 治理](./C11-多租户隔离与-agent-profile-治理.md)
> 对应：B6；见 [面经](../面经.md)；目标掌握：看懂链路、理解机制、设计与表达。

## 本课重点

Miniclaw 的工作区长期记忆是一张结构化知识表加一张 FTS5 虚表，不是向量 RAG。每条记忆有 `kind`（`fact`/`decision`/`lesson`/`open_loop`）、`status`（`active`/`proposed`/`conflicted`/`superseded`/`deleted`）、`revision` 和 `provenance`；每个 Workspace 还有独立的 store revision。一次写入不是"插一行"，而是在同一个 SQLite 事务里同时落：item 行、versions 行、provenance 行、FTS 行、audit 事件、outbox 事件，并 bump store revision。删除是软删：item 变 `deleted` 并写 tombstone，FTS 行被移除，于是"回忆不再命中但审计仍可追溯"。Runner 进程不能直接改库，写操作必须走 IPC，并携带 `runnerInstanceId` 与对该请求的 HMAC 签名，宿主侧还要重新判定这一轮到底是不是交互式顶层会话。

## 主链与职责

存储层在 [memory-store.ts](../../../src/memory-store.ts)，它只认 SQLite，不做权限判断。策略层在 [memory-service.ts](../../../src/memory-service.ts)：做字段校验（`MAX_CONTENT_LENGTH` 32K、`importance`/`confidence` 必须在 0~1、`validFrom` 必须早于 `validUntil`）、Workspace 授权（读用 `canAccessGroup`、写用 `canModifyGroup`）、游标分页（base64url 编码的 `{updatedAt,id}` 与 `{revision}`），并把 store 错误码翻译成 `not_found`/`revision_conflict`/`idempotency_conflict`/`reserved_canonical_key`。

入口有两个。Web 侧是 [routes/memory.ts](../../../src/routes/memory.ts)，挂在 `/api/memory/workspaces/:workspaceJid/items*`；Runner 侧是 [mcp-tools.ts](../../../container/agent-runner/src/mcp-tools.ts) 里的 `workspace_memory_search`/`_get`/`_remember`/`_update`/`_forget`，它们通过 `callWorkspaceMemory` 把请求写进 IPC 任务目录，再由 [index.ts](../../../src/index.ts) 的 `workspace_memory` broker 分支处理。宿主的 capability 状态在 [workspace-memory-capability.ts](../../../src/workspace-memory-capability.ts)，写入准入的纯判定在 [workspace-memory-ipc.ts](../../../src/workspace-memory-ipc.ts)，Runner 侧的签名在 [workspace-memory-auth.ts](../../../container/agent-runner/src/workspace-memory-auth.ts)，子 Agent 的只读拦截在 [workspace-memory-runtime.ts](../../../container/agent-runner/src/workspace-memory-runtime.ts)。

链路：`Agent 工具调用 → callWorkspaceMemory(operation, payload) → signWorkspaceMemoryMutation → IPC tasks/ → index.ts 校验 capability → memory-service 授权 → memory-store 事务 → 结果回写 → 工具返回 JSON`。每一轮的上下文注入是另一条链：`fetchWorkspaceMemorySnapshot → getWorkspaceMemorySnapshot → searchWorkspaceMemoryItems → renderedText → renderWorkspaceMemorySnapshotBlock`。

## 源码阅读

先看 FTS 虚表定义，它决定了检索能力上限。注意分词器是 `trigram`：

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS workspace_memory_fts USING fts5(
  item_id UNINDEXED, workspace_jid UNINDEXED,
  title, content, canonical_key, tokenize='trigram'
);
```

`trigram` 意味着索引按三字符滑窗切分，少于三个字符的查询在 FTS 里没有可匹配的 token。所以 [memory-store.ts](../../../src/memory-store.ts) 的 `searchWorkspaceMemoryItems` 里有一道显式分叉：`[...query].length >= 3` 才走 `MATCH ?` 加 `ftsPhrase(query)`，否则退化成对 `title`/`content`/`canonical_key` 的三处 `LIKE ... ESCAPE '\'`，并手工转义 `\`、`%`、`_`。这是"中文短词也能搜到"的兜底，不是两套实现写重了。

`ftsPhrase` 把整条查询包成 `"..."` 并把内部双引号翻倍，等于强制短语匹配——这解释了为什么长自然语言提示直接拿来搜经常零命中，也解释了 `getWorkspaceMemorySnapshot` 里那段兜底注释：FTS 命中不足 `limit` 时，会再用 `listRecallableWorkspaceMemoryItems` 按 `importance DESC, updated_at DESC` 填满预算。

写入事务的顺序是固定模板：先 bump store，再插 item（`revision=1`），然后 `appendVersion` 记 `create`/`update`/`forget` 版本与 provenance，`replaceFts` 重建该 item 的 FTS 行，最后 `appendAuditAndOutbox` 同时写 `workspace_memory_audit_events` 和 `workspace_memory_outbox`（事件名 `memory.created`/`memory.updated`/`memory.forgotten`）。`replaceFts` 只在 `status === 'active'` 且不是平台保留项时才插行，其余情况只删不插——所以 `proposed`/`superseded`/`deleted` 天然不可召回。

检索 SQL 用列权重和 `snippet()`：

```sql
bm25(workspace_memory_fts, 0, 0, 3, 1, 2) AS search_rank,
snippet(workspace_memory_fts, 3, '‹', '›', '…', 24) AS search_snippet
-- ORDER BY search_rank ASC, i.importance DESC, i.updated_at DESC
```

权重按 FTS 列序排列：`item_id`=0、`workspace_jid`=0、`title`=3、`content`=1、`canonical_key`=2。标题命中权重是正文的三倍，canonical key 两倍。`snippet` 的第 4 个参数 3 就是 `content` 列号，返回被 `‹ ›` 包裹的 24 个 token 片段。bm25 在 SQLite 里是越小越相关，所以 `ORDER BY search_rank ASC`。

并发与重试是两套机制，别混。`updateWorkspaceMemoryItem`/`forgetWorkspaceMemoryItem` 要求 `expectedRevision`，UPDATE 的 WHERE 里带 `revision = ? AND status <> 'deleted'`，`changes !== 1` 就抛 `revision_conflict`——这是 compare-and-set。幂等键则查 `workspace_memory_mutation_requests`：同一个 key 加同一个 `requestHash`（对 patch 或 `{itemId, expectedRevision, reason}` 做 sha256）返回 `replayed: true`，key 相同但 hash 不同就抛 `idempotency_conflict`。create 的幂等靠 `workspace_memory_items` 上的 `UNIQUE (store_id, create_idempotency_key)` 加 `create_request_hash` 列。

最后看 Runner 侧的签名：

```ts
const { mutationSignature: _sig, ...unsigned } = request;
const payload = JSON.stringify(normalizeForCanonicalJson({ namespace: {...}, request: unsigned }));
return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
```

`normalizeForCanonicalJson` 递归排序对象键并丢掉 `undefined`，目的是让宿主和 Runner 对同一请求算出同一字节串。宿主在 `verifyWorkspaceMemoryCapability` 里做四件事：`TOKEN_PATTERN` 形状校验、`currentRunnerByScope.get(key) === runnerInstanceId`（只有当前那个 Runner 能签）、`entry.admittedTurnIds.has(inputTurnId)`（这一轮必须被宿主接纳过）、`timingSafeEqual` 比对；写入路径还额外把签名加进 `usedSignatures`，所以逐字节重放会被拒。密钥由 `issueWorkspaceMemoryWriteCapability` 现场生成（32 字节 base64url），只通过 Runner 的 stdin bootstrap 下发，不进环境变量、不落盘、不进模型可见的 schema。

## 机制与边界

**为什么不是向量库。** 结构化表换来的是可审计、可版本、可软删、可确定性排序、零外部依赖（SQLite FTS5 内建）。代价是语义召回弱：近义不同词就搜不到。项目的补偿手段是三个：`kind` 让模型自己声明知识类型，检索时可按类过滤；bm25 列权重把标题和 canonical key 抬高；注入时用 `importance` 兜底填充，保证"哪怕没搜到，重要背景也在提示里"。这不是 RAG 的替身，是不同取舍。

**软删与 tombstone 各管一半。** `forgetWorkspaceMemoryItem` 把 `status` 改 `deleted`、写 `deleted_at`、`revision+1`、插 `workspace_memory_tombstones`（含 `deleted_revision`、`reason`、actor）、再 `replaceFts` 删掉 FTS 行。于是三个查询面同时生效：列表默认只要 `status = 'active'`；检索走 `status = 'active'` 加 FTS 表（已无行）；审计面读 `workspace_memory_versions` 和 tombstone 仍有完整线索。tombstone 的作用不是"记住删了什么"这么简单——`getMiniclawOwnerAddressMemoryItem` 的恢复路径会删 tombstone 并复用同一条 item lineage，可见 tombstone 是"这条 item 当前是否已被正式关闭"的标记。

**保留 canonical key 的不变量。** `miniclaw.owner.preferred_address` 是平台保留项，物理上仍是 `workspace_memory_items` 的一行（沿用 revision、provenance、audit、outbox、CAS），但通用 CRUD、列表、搜索、versions、FTS 全部对它关死：`rejectReservedCanonicalKey`/`rejectReservedMemoryItem` 抛 `reserved_canonical_key`，查询里用 `i.canonical_key <> ?` 加 `NOT EXISTS (SELECT 1 FROM workspace_memory_platform_items ...)` 双重排除，`replaceFts` 也拒绝为它建行。这里有个必须按顺序执行的迁移细节：`reconcileMiniclawOwnerAddressCanonicalKey` 必须先跑，把同 store 内的重复项按 `updated_at DESC, revision DESC, id DESC` 确定性收敛、清空败者的 `canonical_key`、标记进 `workspace_memory_platform_items`，然后才允许 `enforceMiniclawOwnerAddressCanonicalInvariant` 建那条部分唯一索引 `WHERE canonical_key = 'miniclaw.owner.preferred_address'`。顺序反了，老库会因为重复行直接建索引失败。

**谁能写。** 写权限是三层收敛的。MCP 暴露面：`memoryWriteEnabled = !ctx.isScheduledTask && !ctx.currentTaskId`，定时与任务上下文里干脆不注册写工具。Runtime hook：`createWorkspaceMemoryWriteGuard` 对 `agent_id` 非空的子 Agent 在 `PreToolUse` 直接 `deny`。宿主 broker：`workspaceMemoryWriteRejection` 按 `runtime_agent_kind`、`hostTurnKind`、`capabilityValid` 依次给出 `runtime_agent_memory_read_only`、`scheduled_memory_read_only`、`workspace_memory_no_active_turn`、`workspace_memory_invalid_capability`。三层里任何一层都足以拒，所以"模型参数无法扩大权限"是结构性的，不是靠提示词。

**读失败与写失败的语义不同。** `fetchWorkspaceMemorySnapshot` 里整个 `try` 包着 `catch { return null; }`——读失败就当没有记忆，这一轮照常回答；写失败必须报错，因为静默丢弃会让模型以为记住了一件事。这是有意的 fail-open / fail-closed 分工。

**顺带一个容易踩的边界。** broker 解析 `workspaceJid` 时取 `getJidsByFolder(sourceGroup)` 里第一个 `web:` 前缀的 JID，找不到再退回第一个，绝不采信 IPC 里模型给的 JID；actor 取自 `sourceGroupEntry.created_by` 对应的活跃用户。也就是说，一个文件夹同时挂着 IM 会话和 Web 工作区时，记忆永远落到 Web 那个工作区身份上。

## 需要懂什么

- 能说清"结构化表 + FTS5"与"向量 RAG"的取舍，并给出这个项目的三条补偿手段（kind、列权重、importance 兜底）。
- 能复述一次写入落了几张表、各自作用，以及 `revision` 与 store revision 的区别。
- 能解释 `revision_conflict` 与 `idempotency_conflict` 分别解决什么并发问题，二者为什么不能互相替代。
- 能解释为什么"忘记"是软删而不是 DELETE，以及 tombstone 之外还需要删 FTS 行。
- 能解释 capability 签名为什么只在当前 Runner 有效、为什么必须绑定 `inputTurnId`、为什么要消费签名防重放。
- 能说清为什么 `reconcile` 必须在 `enforce` 之前。

## 需要记住什么

- 记忆 = `workspace_memory_items` + 版本/来源/墓碑/审计/outbox + `workspace_memory_fts(trigram)`，单一 SQLite 事务内写完。
- 检索排序 = `bm25(…, 0,0,3,1,2)` 升序，再按 `importance`、`updated_at` 稳定化；短查询退化为 LIKE。
- 写 = IPC + HMAC + 当前 Runner + 已接纳 turn + 消费签名；读 fail-open，写 fail-closed。
- 删 = `deleted` + tombstone + 删 FTS 行；审计线保留，回忆不再命中。
- 平台保留 key 走 `workspace_memory_platform_items` 与部分唯一索引，通用接口一律看不见。
- 定时任务与子 Agent 只读，这条限制由注册面、hook、broker 三处同时兜住。
