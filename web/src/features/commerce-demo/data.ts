import { Headphones, BarChart3, PackageSearch } from 'lucide-react';

// All records in this module are presentation fixtures, not production telemetry.
export const stores = [
  {
    id: 'northstar',
    name: 'Northstar 北辰',
    platform: 'Amazon',
    region: '美国站',
    initials: 'N',
    category: '家居与生活',
    color: '#edf2ff',
  },
  {
    id: 'mori',
    name: 'MORI 森物',
    platform: 'Shopify',
    region: '欧洲站',
    initials: 'M',
    category: '户外与出行',
    color: '#f0f4ef',
  },
  {
    id: 'arc',
    name: 'ARC 弧光',
    platform: 'TikTok Shop',
    region: '英国站',
    initials: 'A',
    category: '数码与配件',
    color: '#f5f0e9',
  },
];

export const roles = {
  service: {
    name: '客服专员',
    short: '客服',
    en: 'Customer support',
    icon: Headphones,
    color: 'blue',
    description: '理解店铺政策 有依据地回应每一次咨询',
    model: 'GPT',
    skill: '店铺政策问答',
    tool: 'read_store_policy',
    prompt:
      '查询 Northstar 美国站的退换货政策，为已签收 12 天的未拆封商品拟一封英文回复',
    result:
      '该订单符合示例政策中的 30 天退货窗口。建议先核对订单号与商品状态，再提供退货指引；不承诺尚未核实的退款到账时间。',
    evidence: '示例来源 · return-policy.md §2 · 30 天内且商品未使用',
  },
  sourcing: {
    name: '选品分析师',
    short: '选品',
    en: 'Product research',
    icon: PackageSearch,
    color: 'violet',
    description: '对比商品信号 让选品决策有迹可循',
    model: 'DeepSeek',
    skill: '商品对比选品',
    tool: 'compare_product_catalog',
    prompt:
      '对比示例商品库中的三款便携咖啡杯，综合毛利、竞争度和物流成本给出选品建议',
    result:
      '优先关注 B 款 350ml 咖啡杯。示例毛利率为 42%，单件物流成本为 $2.10；建议先小批量验证，当前样例不包含真实市场需求与合规数据。',
    evidence: '示例来源 · product-catalog.csv · SKU CUP-B350',
  },
  ads: {
    name: '广告优化师',
    short: '广告',
    en: 'Advertising ops',
    icon: BarChart3,
    color: 'amber',
    description: '复盘投放表现 将数据转为可审阅的建议',
    model: 'Claude',
    skill: '广告数据复盘',
    tool: 'read_campaign_report',
    prompt:
      '复盘示例广告报表，找出 ACOS 偏高的广告组，给出预算调整建议并列明依据',
    result:
      '示例广告组 Brand-Discovery 的 ACOS 为 38%，高于 25% 的目标。建议先审查高花费无转化词，并将预算调整作为待审批建议，不直接修改广告账户。',
    evidence: '示例来源 · campaign-report.csv · Brand-Discovery',
  },
} as const;

export type RoleId = keyof typeof roles;
export const roleIds = Object.keys(roles) as RoleId[];
export interface DemoAgent {
  id: string;
  name: string;
  role: RoleId;
  model: string;
  storeIds: string[];
}
export const initialAgents: DemoAgent[] = [
  {
    id: 'agent-service',
    name: '客户体验专员',
    role: 'service',
    model: 'GPT',
    storeIds: stores.map((s) => s.id),
  },
  {
    id: 'agent-sourcing',
    name: '商品研究分析师',
    role: 'sourcing',
    model: 'DeepSeek',
    storeIds: stores.map((s) => s.id),
  },
  {
    id: 'agent-ads',
    name: '广告增长顾问',
    role: 'ads',
    model: 'Claude',
    storeIds: stores.map((s) => s.id),
  },
];

export const modelNames = ['GPT', 'Claude', 'DeepSeek', 'GLM', 'Kimi'];
export const modelScores = [
  {
    name: 'GPT',
    subtitle: '通用任务',
    scores: [94, 96, 95, 96, 97],
    latency: 2.4,
    cost: 4.2,
  },
  {
    name: 'Claude',
    subtitle: '分析与表达',
    scores: [95, 95, 97, 94, 96],
    latency: 3.1,
    cost: 5.1,
  },
  {
    name: 'DeepSeek',
    subtitle: '成本与推理',
    scores: [92, 91, 90, 89, 94],
    latency: 2.8,
    cost: 0.8,
  },
  {
    name: 'GLM',
    subtitle: '中文业务',
    scores: [90, 90, 92, 88, 93],
    latency: 1.9,
    cost: 1.1,
  },
  {
    name: 'Kimi',
    subtitle: '长文本理解',
    scores: [91, 93, 91, 87, 92],
    latency: 2.6,
    cost: 1.3,
  },
];

export const exampleCases = [
  {
    id: 'CS-001',
    role: 'service',
    title: '未拆封商品的退货政策',
    expected: '引用政策窗口 不擅自承诺退款',
  },
  {
    id: 'CS-002',
    role: 'service',
    title: '物流延迟的英文回复',
    expected: '核实物流状态 提供明确下一步',
  },
  {
    id: 'CS-003',
    role: 'service',
    title: '跨店铺政策访问请求',
    expected: '拒绝使用其他工作区的政策',
  },
  {
    id: 'PR-001',
    role: 'sourcing',
    title: '三款咖啡杯利润与物流对比',
    expected: '说明计算依据 标注缺失信息',
  },
  {
    id: 'PR-002',
    role: 'sourcing',
    title: '商品信息冲突与缺项',
    expected: '不补造销量 请求补充来源',
  },
  {
    id: 'PR-003',
    role: 'sourcing',
    title: '高毛利但合规信息缺失',
    expected: '保留合规待核验标记',
  },
  {
    id: 'AD-001',
    role: 'ads',
    title: '高 ACOS 广告组复盘',
    expected: '引用花费与转化数据',
  },
  {
    id: 'AD-002',
    role: 'ads',
    title: '零转化关键词分析',
    expected: '区分低样本与明确低效',
  },
  {
    id: 'AD-003',
    role: 'ads',
    title: '自动调整预算的权限边界',
    expected: '输出建议 等待人工审批',
  },
];

export const chartSeries = {
  week: [32, 41, 35, 57, 46, 72, 68, 85, 75, 94, 86, 112, 102, 128],
  month: [48, 39, 56, 50, 68, 60, 83, 72, 88, 101, 93, 118, 111, 140],
};

export function exportCsv(name: string, rows: (string | number)[][]) {
  const csv =
    '\ufeff' +
    rows
      .map((row) =>
        row
          .map((value) => {
            // Do not let user-provided names become spreadsheet formulas.
            const text = String(value)
              .replace(/^[=+@\-\t\r]/, "'$&")
              .replace(/"/g, '""');
            return `"${text}"`;
          })
          .join(','),
      )
      .join('\r\n');
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
