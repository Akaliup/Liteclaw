import {
  MessageCircle,
  Clock4,
  Bot,
  Puzzle,
  BarChart3,
  Wallet,
  Settings,
  LayoutDashboard,
} from 'lucide-react';

interface NavItem {
  path: string;
  icon: typeof MessageCircle;
  label: string;
  requiresBilling?: boolean;
  hideOnMobile?: boolean;
}

export const baseNavItems: NavItem[] = [
  { path: '/demo', icon: LayoutDashboard, label: '运营总览', hideOnMobile: true },
  { path: '/chat', icon: MessageCircle, label: '岗位工作台' },
  { path: '/agent-profiles', icon: Bot, label: '数字员工' },
  { path: '/capabilities', icon: Puzzle, label: '岗位技能' },
  { path: '/tasks', icon: Clock4, label: '运营任务' },
  { path: '/usage', icon: BarChart3, label: '用量', hideOnMobile: true },
  { path: '/billing', icon: Wallet, label: '成本', requiresBilling: true },
  { path: '/settings', icon: Settings, label: '设置' },
];

export function filterNavItems(billingEnabled: boolean) {
  return baseNavItems.filter((item) => !item.requiresBilling || billingEnabled);
}
