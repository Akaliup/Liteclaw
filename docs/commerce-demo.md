# 跨境电商数字员工演示（LiteClaw）

## 本地启动

```powershell
npm --prefix web ci
npm --prefix web run dev
```

打开 <http://localhost:5173/demo>。首页 `/` 默认跳转至此，不需要后端、登录账号、
模型密钥或电商平台授权。真实工作台位于 `/chat`，登录与服务端权限校验继续生效。

## 演示顺序

1. **运营总览**：切换店铺与趋势周期，进入数字员工岗位配置。
2. **数字员工**：查看 IDENTITY、SOUL、AGENTS、TOOLS 四段 Prompt；回放客服、
   选品或广告样例。创建一位绑定指定店铺的员工，刷新后配置仍保存在当前浏览器。
3. **店铺工作区**：检查店铺与岗位绑定，查看独立来源文件与 Runtime Session 归属。
   一个演示工作区对应一个店铺与一个顶层岗位 Agent。
4. **模型评测**：浏览 5 个模型 × 7 维预置评分矩阵，按岗位筛选九个用例样例，回放评测
   进度，导出带示例标识的 CSV；用例池口径为 300+，页面只展示其中 9 条样例。
5. **运行保障**：选择轮询、加权轮询或故障转移策略，模拟主 Provider 异常，观察
   健康隔离、备用选择与恢复流程，再点击恢复演示状态。

## 数据边界

- 所有运营指标、业务结果、模型评分、时延、成本与运行事件都是前端预置示例。
- 评测使用五个模型系列名称，未固定具体版本；不能作为实测结果或能力排名。
- 页面只渲染九个可浏览的用例样例；“300+”只表示真实业务用例池的量级口径，
  演示页面不声称已完成 300+ 条用例的实测跑批。
- 任务回放不会根据自定义输入生成答案，会显示明确标注的固定业务样例。
- 故障模拟不会调用真实 Provider、修改运行配置或重放实际业务输入。
- Benchmark 驱动的质量、成本与时延自动路由不在演示实现范围内；生产侧的模型路由与
  降级由 ProviderPool 承担。
- 新建数字员工仅保存至 `liteclaw-demo-agents-v1` 浏览器 localStorage，
  不会写入后端数据库。清除此键可恢复初始演示配置。

## 实现与验证

- `web/src/features/commerce-demo/CommerceDemoPage.tsx`：演示页面与交互。
- `web/src/features/commerce-demo/data.ts`：业务样例及 CSV 导出。
- `web/src/features/commerce-demo/commerce-demo.css`：局部白黑蓝视觉、响应式与动画。
- 复用现有开源 shadcn/ui、Radix Dialog 和 Lucide 图标，不新增运行时依赖。
- 动画覆盖页面进出、图表、弹窗进出、侧栏、提示与按钮反馈，并支持 reduced motion。

```powershell
npm --prefix web run build
npm --prefix web run test:e2e -- commerce-demo.spec.ts
```
