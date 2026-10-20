# 演示空间部署指南

演示空间 `/demo` 是**纯前端**：不调用后端、不需要模型密钥、不需要电商平台授权。
因此可以托管在任何静态站点上，也可以临时开隧道。

## 方案 A：GitHub Pages（推荐，永久地址）

仓库已内置 [`.github/workflows/deploy-demo.yml`](../.github/workflows/deploy-demo.yml)。

1. 推送代码到 GitHub（`main` 或 `master`）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. 等 Actions 里 `Deploy Demo (GitHub Pages)` 跑完，地址形如：

```text
https://<你的用户名>.github.io/<仓库名>/demo/
```

工作流的行为：

- 只在 `web/**` 变更时触发，只构建 `web/`。
- 自动带 `VITE_BASE_PATH=/<仓库名>/`，项目站点挂在子路径也不会白屏。
- 把 `dist/index.html` 复制成 `dist/404.html`，所以直接刷新 `/demo/benchmark` 这类深链也不会 404。

> 想用自定义域名：在 Pages 里填 Custom domain，再把 `VITE_BASE_PATH` 改成 `/`（工作流里换一行即可）。

## 方案 B：Netlify / Cloudflare Pages（拖拽 1 分钟）

```powershell
npm --prefix web ci
npm --prefix web run build
```

产物在 `web/dist`：

- **Netlify**：打开 <https://app.netlify.com/drop>，把 `web/dist` 拖进去，立刻得到 `https://xxx.netlify.app`。
  仓库已带 `web/public/_redirects`（`/* /index.html 200`），深链自动回落到 SPA。
- **Cloudflare Pages**：`npx wrangler pages deploy web/dist --project-name liteclaw-demo`，
  构建时同样会读到 `_redirects`。

## 方案 C：Vercel CLI

```powershell
npm --prefix web ci
npx vercel --cwd web --prod
```

`web/vercel.json` 已配置 SPA rewrite，部署后地址形如 `https://liteclaw-demo.vercel.app/demo`。

## 方案 D：临时公网隧道（今天就要地址）

在本机启动服务，通过临时隧道分享访问地址：

```powershell
# 首次：安装 cloudflared
winget install --id Cloudflare.cloudflared -e

# 一键：起 Vite + 开隧道
powershell -ExecutionPolicy Bypass -File scripts\share-demo.ps1
```

`cloudflared tunnel --url http://127.0.0.1:5400` 会打印一个 `https://xxx.trycloudflare.com` 地址，
把它拼成 `https://xxx.trycloudflare.com/demo` 分享即可。

要点：

- 服务运行期间**保持终端开启，并关闭电脑自动休眠**；隧道一断地址就失效。
- 这台机器 5173 / 5181 / 7800 等端口被系统或安全软件占用（`EACCES`），脚本默认用 **5400**；
  若 5400 也被占，加 `-Port 13000`。
- 隧道地址是随机的，拿到后先自己用手机 4G 打开验证一次。

## 部署验证

```powershell
npm --prefix web run dev -- --port 5400 --host 127.0.0.1
```

- [ ] `http://127.0.0.1:5400/demo` 能打开，侧栏显示 `LiteClaw · 跨境电商数字员工平台`。
- [ ] 依次点：运营总览 → 数字员工 → 店铺工作区 → 模型评测（点「回放示例评测」）→ 运行保障（点「模拟 Provider 故障」）。
- [ ] 浏览器控制台只有 `WebSocket closed` 一类后端未启动的提示，没有红色报错。
- [ ] 手机扫/输地址能打开（验证隧道或 Pages 地址对外可用）。
- [ ] 备用材料在手：`docs/screenshots/liteclaw/*.png` 截图 + `docs/LiteClaw-demo.pdf`。

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| `EACCES: permission denied 0.0.0.0:5173` | 端口被系统保留段或安全软件占用，换端口：`--port 5400` |
| 页面白屏、控制台 404 `/assets/...` | 子路径部署没设 `VITE_BASE_PATH`，重新用 `/repo/` 构建 |
| 刷新 `/demo/benchmark` 404 | 缺 SPA 回落：Netlify 用 `_redirects`，Pages 用 `404.html` |
| 点「进入真实工作台」报错 | 正常：`/chat` 需要后端 `npm start` 与登录，演示不需要它 |
| 隧道地址打不开 | 电脑休眠/网络切换导致隧道断开，重跑脚本换新地址 |
