# LiteClaw 品牌清理记录

本文记录 LiteClaw 独立品牌清理时发现的旧项目引用、处理范围和有意保留的第三方引用。除本记录的审计词表外，当前个人复现仓库地址为 `https://github.com/Akaliup/Liteclaw`。历史记录中的上游地址仅用于说明代码来源，不代表当前仓库归属。

## 清理规则

| 旧引用 | 范围 | 处理方式 |
| --- | --- | --- |
| `HappyClaw` / `happyclaw` / `HAPPYCLAW` | `src/`、`web/`、`container/`、`scripts/`、`tests/`、`docs/`、Makefile、CI、配置和 prompts | 统一改为 LiteClaw 的品牌、类型名、环境变量、标记和运行时命名 |
| `riba2534/happyclaw` | 根 `package.json`、`web/package.json`、Agent Runner metadata、README、About/Bug Report、CI 与测试契约 | 改为 `helsome/liteclaw`，并同步 lockfile |
| `https://happyclaw.cc/` | README、网页元信息和链接 | 移除旧站点链接；项目首页使用 GitHub 仓库 |
| 旧项目 badges、homepage、bugs、repository URL、author | README、package metadata、网页设置页和诊断页面 | 改为 LiteClaw 仓库、问题反馈地址和维护者 metadata |
| `happyclaw-bootstrap`、`bootstrap.happyclaw.md`、旧测试文件名 | `src/`、`container/agent-runner/prompts/`、`tests/` | 重命名为 `liteclaw-*`，并同步 import、prompt loader 和测试路径 |
| `happyclaw-agent`、`happyclaw-backup-*`、旧容器缓存目录 | Makefile、Dockerfile、GitHub Actions、`.gitignore`、脚本 | 改为 `liteclaw-agent`、`liteclaw-backup-*` 和 `liteclaw-*` |

## 兼容性说明

本轮以独立品牌为目标，运行时暴露的项目级名称、MCP namespace、Owner Profile key、输出 marker、容器环境变量和 cookie 名称统一改为 LiteClaw 命名。已有部署如依赖旧的项目级 key 或环境变量，应在升级前按当前文档迁移配置；SQLite 数据和运行时备份仍由现有迁移/恢复流程负责。

## 有意保留的外部引用

`riba2534/feishu-cli` 是独立的第三方 Feishu CLI 上游仓库，不是 LiteClaw 的项目身份。Dockerfile、`scripts/install-host-tools.sh` 和相关可复现构建测试保留该上游下载地址，并不作为品牌或 repository metadata 使用。

## 验证

清理完成后应检查：

```bash
rg -n -i 'happyclaw|happyclaw\.cc|riba2534/happyclaw' \
  --glob '!docs/liteclaw-migration-cleanup.md' \
  --glob '!node_modules/**' --glob '!dist/**' --glob '!web/dist/**' .

npm run typecheck
npm run desktop:typecheck
npm test -- --run
```

## 个人复现仓库说明

当前仓库用于个人复现与二次开发展示，保留历史来源记录。既有文档记录的来源包括 `riba2534/happyclaw` 与 `helsome/liteclaw`；运行时复用 Pi Agent Runtime。个人新增或修改部分应以实际提交与代码差异为准，不将继承的功能全部声明为个人原创。
