# C11 多租户隔离与 Agent Profile 治理

> 课程性质：核心
> 返回：[导学](../导学.md)；前置：[C06 会话串行队列与 Runner 生命周期](./C06-会话串行队列与-runner-生命周期.md)、[C10 长期记忆：FTS5 检索与写入治理](./C10-长期记忆-fts5-检索与写入治理.md)；下一课：（全部课程结束）
> 对应：B7；见 [面经](../面经.md)；目标掌握：看懂链路、理解机制、设计与表达。

## 本课重点

场景：同一个 Miniclaw 实例上有三个团队在用。A 团队的成员试图打开 B 团队的工作区接口；一个普通成员试图改系统配置；管理员改了一个 Agent 的人格提示词，而那个 Agent 正在三个会话里干活。

四个结论：

1. 权限分两层：**平台运维权限**（系统配置、用户、邀请、审计、计费）走角色 + 显式权限位，管理员在 `hasPermission` 里有旁路；**资源 ACL**（工作区、渠道、任务）走创建者与显式授权，**没有管理员旁路**，越权统一返回 404。
2. 控制面身份用 HMAC 签名 Cookie：密钥按「环境变量 → 持久文件 → 首次生成」三级解析，Cookie 带 `HttpOnly`、`SameSite=Strict`、30 天有效期，签名比较用 `timingSafeEqual`。
3. WebSocket 是独立的信任边界：CORS 中间件不覆盖它，浏览器也不发 preflight，所以必须在 upgrade 阶段自己校验 Origin，否则直接暴露 CSWSH。
4. Agent Profile 的四段提示（身份、价值取向、工作流、工具策略）是版本化数据，不是代码；变更要通过能力与上下文预览、暂停运行、失效暖 Runner 来落地，而 Web 控制面不能篡改由原生渠道首次占有的会话归属。

## 主链与职责

```
HTTP 请求
└─ Cookie 解析 → verifySessionToken(签名校验) → 查 user_sessions → req.user
   ├─ 平台路由：Permission Middleware(hasPermission)
   └─ 资源路由：canAccessGroup / canModifyGroup / canDeleteGroup（创建者隔离，无 admin 旁路）
        └─ 越权 → 404（隐藏存在性）

WebSocket upgrade
├─ Origin 校验（同源 Host 比较 / CORS_ALLOWED_ORIGINS 白名单）→ 不在白名单 403
├─ Cookie 认证（upgrade 不能 Set-Cookie，所以只接受已有有效会话）
└─ 每条消息再判定：send_message 要 ACL，host 模式额外要求 admin

Agent Profile 变更
├─ 写 profile + 新 prompt 版本
├─ 生成能力清单与上下文预览（哈希可比对）
├─ pauseGroupsForMutation → 提交 → resume 或 discard（见 C06）
└─ 暖 Runner 失效，下一次运行按新策略解析能力
```

状态所有者：身份在 `users` / `user_sessions`；平台权限位在用户记录上；资源归属在 `created_by` 与 `channel_mounts`；Profile 与提示词版本在 `agent_profiles` / `agent_profile_prompt_versions`；渠道归属在 `channel-session-owner` 的粘性解析里。

## 源码阅读

1. Cookie 会话：[auth.ts](../../../src/auth.ts)。`generateSessionToken` 用 `crypto.randomBytes(32)`；`signSessionToken` 生成 `token.HMAC-SHA256`；`verifySessionToken` 按最后一个 `.` 切分、校验签名长度必须 64、用 `timingSafeEqual` 比较——注意它比较的是 Buffer 而不是字符串，避免早退泄漏。未签名 cookie 的兼容由 `ALLOW_LEGACY_UNSIGNED_COOKIE` 控制且默认关闭，注释写明原因：HMAC 就是为了防止数据库/备份/日志泄漏 raw token 后被冒名登录，永久接受未签名等于让这层防护失效。

2. 密钥来源：[config.ts](../../../src/config.ts) 的 `getOrCreateSessionSecret`：`WEB_SESSION_SECRET` 环境变量优先；否则读 `data/config/session-secret.key`；都没有就 `randomBytes(32)` 生成并落盘。三级链条的意义是「默认安全、可显式接管、可持久化」——随机生成但只放内存的话，重启一次所有人被登出。

3. 平台权限：[permissions.ts](../../../src/permissions.ts)。六个权限位（`manage_system_config`、`manage_group_env`、`manage_users`、`manage_invites`、`view_audit_log`、`manage_billing`）、四套模板（`admin_full`、`member_basic`、`ops_manager`、`user_admin`）、以及 `hasPermission` 里那句 `if (user.role === 'admin') return true`。**这个旁路只对平台权限成立**，是有意的：运维要能管系统，但不需要（也不应该）能看别人 Agent 的对话。

4. 资源 ACL：[cross-group-acl.ts](../../../src/cross-group-acl.ts) 的 `canSendCrossGroupMessage`：管理员 home 放行（这是 IPC 跨群的系统能力，不是资源浏览）、同 folder 放行、home 组可以发给自己创建的组、以及 `target_main_jid` 绑定回源工作区的通道。这里的豁免都围绕「同一租户内的投递」，不是「随便看」。

5. WebSocket 边界：[web.ts](../../../src/web.ts) 的 `setupWebSocket`。Origin 缺失（同源或无浏览器 origin）放行；同源用 `new URL(origin).host === host` 判定；否则查 `CORS_ALLOWED_ORIGINS`（支持 `*`），不在白名单 403，且每个 origin 只 warn 一次避免刷屏。连接建立后每条 `send_message` 还要再过一次 ACL，host 模式额外要求 admin——因为 host 模式直接跑在有权限的机器上。

6. Agent Profile 四段：[agent-profile-prompts.ts](../../../src/agent-profile-prompts.ts) 的 `identity_prompt`/`soul_prompt`/`agents_prompt`/`tools_prompt`，空段有默认回退；路由在 [routes/agent-profiles.ts](../../../src/routes/agent-profiles.ts)，运行时落地在 [agent-profile-runtime.ts](../../../src/agent-profile-runtime.ts)。四段的分工是「我是谁 / 我的价值取向 / 我怎么干活 / 我怎么用工具」，对应 C03 的 prompt block 归属。

7. 渠道归属粘性：[channel-session-owner.ts](../../../src/channel-session-owner.ts) 的 `resolveStickyChannelOwner`。注释交代了两个易错点：Web 可以往 IM 拥有的会话注入输入，但不改变传输归属；归属粒度是**会话**（provider + 外部聊天 + 渠道账号）而不是**线程**——早期按线程冻结会让「第一条入站恰好带 root_id」的会话永远回到那个线程，后续顶层消息也进错地方。

8. 挂载安全：[mount-security.ts](../../../src/mount-security.ts) 负责把用户可配的路径限制在允许范围内，与 C04 的只读挂载配合，构成「容器里拿不到别人文件」的最后一环。

## 机制与边界

**为什么资源 ACL 不给管理员旁路。** 自托管产品的卖点就是数据边界。一旦管理员能浏览任意工作区，「我把数据放在自己机器上」就失去意义。实践上这条边界也让代码更简单：`canAccessGroup` 只看 `created_by` 和显式授权，不需要维护一张「谁能看谁」的矩阵。

**为什么越权返回 404 而不是 403。** 403 泄漏「这个资源存在，只是你没权限」，可用于枚举资源 ID。统一 404 让「不存在」和「不属于你」在外部不可区分。代价排障时稍微麻烦一点，需要在日志里区分。

**为什么 WebSocket 要单独做 Origin 校验。** CORS 是给 `fetch`/XHR 用的，浏览器对 WebSocket 只发 `Origin` 头、不发 preflight，服务端如果不校验，任意站点都能用受害者的 Cookie 建连并收发消息（CSWSH）。`SameSite=Strict` 是主防御，Origin 校验是第二道，两者都要。

**为什么身份认证和资源授权必须分开。** 认证回答「你是谁」，授权回答「你能动这个资源吗」。混在一起的典型症状是「所有登录用户都能调管理接口，因为中间件只校验了登录」。

**为什么 Profile 变更要走暂停。** 四段提示和能力清单是运行时的输入。改了配置但旧 Runner 还在跑，会出现「界面显示新人格、实际回答还是旧人格」。暂停-提交-恢复（或丢弃）让配置与运行态要么全旧要么全新。

**已知边界**：`hasPermission` 的 admin 旁路意味着自定义权限位对管理员无效；Cookie 30 天有效期没有服务端主动吊销的批量能力（依赖会话表删除）；Origin 校验对非浏览器客户端放行，安全性依赖 Cookie 自身的 `HttpOnly`；粘性归属按会话粒度，跨会话迁移需要显式解绑。

## 需要懂什么

**多租户的边界不是一个开关，是几层不同性质的判断。** 平台权限（角色 + 权限位 + 管理员旁路）、资源归属（创建者 + 显式授权 + 无旁路）、传输归属（粘性会话所有者）、执行模式（host 额外要求 admin）——这四层各自回答不同问题，混成一层就会出现「给管理员方便，顺手把租户隔离也打开了」。

**签名会话的价值在「泄漏后可判定」。** 数据库或日志泄漏了一个签名后的 token，攻击者能用；但泄漏的是签名前的 raw token 时，没有密钥就伪造不出合法 cookie。这是 HMAC 相对「裸随机 token 存库」的核心差异。

**粘性归属的粒度选择会长期影响用户体验。** 按线程冻结是「实现简单、语义错误」的典型：它能保证回复进同一线程，但也把会话永久钉死在第一次的线程里。按会话（provider + 聊天 + 账号）冻结，线程内锚点仍然跟随当前消息。

**配置即数据，变更即事务。** Profile 版本化 + 预览 + 暂停，是把「配置变更」当成一次有提交语义的操作，而不是一次随手写库。

## 需要记住什么

主链：`Cookie(HMAC) → user_sessions → 权限判定(平台/资源两层) → 路由；WS upgrade: Origin 校验 → 认证 → 每条消息再判权；Profile 变更: 写版本 → 预览 → 暂停运行 → 提交 → 恢复或丢弃 → 失效暖 Runner`。

必记不变量：

- 平台权限六个位、四套模板；`admin` 在 `hasPermission` 有旁路，资源 ACL 没有。
- 越权返回 404，不返回 403。
- 会话密钥三级来源：环境变量 → `data/config/session-secret.key` → 随机生成落盘。
- Cookie：`HttpOnly` + `SameSite=Strict` + 30 天 + `timingSafeEqual` 比较。
- WebSocket 必须校验 Origin（同源或白名单），且每条消息再判定一次权限。
- 渠道归属按「会话」粒度粘性，不按线程；Web 不改变归属。
- host 模式的工作区额外要求 admin。

当前限制与演进：ACL 判定分散在路由与 ACL 模块，新增资源族需要显式接线（对照 [ACL-MATRIX.md](../../../docs/ACL-MATRIX.md) 维护）；平台权限位与资源 ACL 是两套模型，没有统一策略语言；会话吊销依赖表删除，缺少「按用户踢下线」的批量入口（见 [面经 Q7](../面经.md)）。
