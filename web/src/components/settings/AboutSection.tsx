import { useState } from 'react';
import {
  Github,
  ExternalLink,
  Heart,
  Code2,
  Lightbulb,
  Bug,
} from 'lucide-react';
import { BugReportDialog } from '@/components/common/BugReportDialog';
import { Button } from '@/components/ui/button';

export function AboutSection() {
  const [showBugReport, setShowBugReport] = useState(false);

  return (
    <div className="space-y-6">
      {/* 项目信息 */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          LiteClaw
        </h2>
        <p className="text-sm text-muted-foreground">
          跨境电商多店铺协同运营的数字员工平台 · 自托管 Agent 工作台
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          版本 1.0.0 · MIT License · 基于 Pi Agent Runtime
        </p>
      </div>

      {/* 开源地址 & 作者 & 报告问题 */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Github className="w-4 h-4 text-muted-foreground shrink-0" />
          <a
            href="https://github.com/helsome/liteclaw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-primary/80 inline-flex items-center gap-1"
          >
            helsome/liteclaw
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Code2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-foreground">作者：helson</span>
        </div>
        <div className="flex items-center gap-3">
          <Bug className="w-4 h-4 text-muted-foreground shrink-0" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBugReport(true)}
          >
            <Bug className="w-3.5 h-3.5" />
            报告问题
          </Button>
        </div>
      </div>

      <BugReportDialog
        open={showBugReport}
        onClose={() => setShowBugReport(false)}
      />

      <hr className="border-border" />

      {/* 项目背景 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-medium text-foreground">项目背景</h3>
        </div>
        <div className="space-y-4 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">岗位与店铺建模</p>
            <p className="mt-1 leading-relaxed">
              AgentProfile–Workspace–Runtime Session
              三层模型：客服、选品、广告投放等岗位抽象为数字员工身份，Workspace
              隔离不同店铺、品牌的数据与权限，Runtime Session
              维持运行时身份状态与上下文一致性。
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">业务模型评测</p>
            <p className="mt-1 leading-relaxed">
              跨境电商 Multi-Model Benchmark：沉淀 300+
              业务用例（客服政策问答、商品对比选品、广告数据复盘），对 DeepSeek、GLM、
              Kimi、GPT、Claude 按任务完成度、事实准确性、指令遵循、工具调用、稳定性、时延、
              Token 成本 7 个维度横向评测，输出岗位—模型适用性矩阵。
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">模型运行保障</p>
            <p className="mt-1 leading-relaxed">
              ProviderPool 多模型运行与降级：以评测结果做模型路由，综合任务质量、
              Latency、Token Cost 与可用性选择模型，单 Provider 异常后自动降级切换。
            </p>
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* 设计哲学 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-4 h-4 text-rose-500" />
          <h3 className="text-sm font-medium text-foreground">设计哲学</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          复用成熟的 Agent 运行时，把产品重心放在岗位建模、工作区隔离、模型评测与运行保障上；
          能力、记忆与渠道都以显式配置接入，不做隐式回退。
        </p>
      </div>
    </div>
  );
}
