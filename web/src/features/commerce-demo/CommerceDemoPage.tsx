import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  GitBranch,
  Layers,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  chartSeries,
  exampleCases,
  exportCsv,
  initialAgents,
  modelNames,
  modelScores,
  roleIds,
  roles,
  stores,
  type DemoAgent,
  type RoleId,
} from './data';
import './commerce-demo.css';
import { morph } from './motion';

const navigation = [
  { id: 'overview', label: '运营总览', icon: LayoutDashboard, en: 'Overview' },
  { id: 'agents', label: '数字员工', icon: Bot, en: 'AI workforce' },
  { id: 'workspaces', label: '店铺工作区', icon: Layers, en: 'Workspaces' },
  { id: 'benchmark', label: '模型评测', icon: FlaskConical, en: 'Benchmark' },
  { id: 'runtime', label: '运行保障', icon: Activity, en: 'Runtime' },
] as const;
type Section = (typeof navigation)[number]['id'];
type Modal =
  | 'create'
  | 'task'
  | 'workspace'
  | 'guide'
  | 'notifications'
  | 'agent'
  | null;
const storageKey = 'liteclaw-demo-agents-v1';

function readAgents(): DemoAgent[] {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(storageKey) || 'null',
    );
    if (
      Array.isArray(saved) &&
      saved.length > 0 &&
      saved.length <= 50 &&
      saved.every(
        (agent) =>
          typeof agent?.id === 'string' &&
          typeof agent?.name === 'string' &&
          agent.name.length <= 40 &&
          roleIds.includes(agent.role) &&
          modelNames.includes(agent.model) &&
          Array.isArray(agent.storeIds) &&
          agent.storeIds.length > 0 &&
          agent.storeIds.every((id: unknown) =>
            stores.some((store) => store.id === id),
          ),
      )
    )
      return saved;
  } catch {
    /* Storage is optional in private browsing. */
  }
  return initialAgents;
}

function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`hm-pill hm-pill-${tone}`}>{children}</span>;
}

function Sparkline({
  values,
  secondary = false,
}: {
  values: number[];
  secondary?: boolean;
}) {
  const max = Math.max(...values);
  const points = values
    .map((v, i) => `${i * 8},${36 - (v / max) * 29}`)
    .join(' ');
  return (
    <svg
      viewBox="0 0 104 40"
      fill="none"
      className={`hm-sparkline ${secondary ? 'secondary' : ''}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TaskChart({ period }: { period: 'week' | 'month' }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = chartSeries[period];
  const points = values.map((v, i) => `${42 + i * 43},${170 - v}`).join(' ');
  const secondary = values
    .map((v, i) => `${42 + i * 43},${190 - v * 0.56}`)
    .join(' ');
  return (
    <div className="hm-chart" key={period}>
      <svg
        viewBox="0 0 640 224"
        role="img"
        aria-label={`${period === 'week' ? '近 7 天' : '近 30 天'}任务趋势示例，蓝线为完成任务，灰线为人工复核`}
      >
        <defs>
          <linearGradient id="hm-chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3165f4" stopOpacity=".14" />
            <stop offset="100%" stopColor="#3165f4" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[40, 90, 140, 190].map((y, i) => (
          <g key={y}>
            <line
              x1="38"
              x2="614"
              y1={y}
              y2={y}
              stroke="#e9edf3"
              strokeDasharray="3 5"
            />
            <text x="0" y={y + 4} fill="#949ba9" fontSize="10">
              {[150, 100, 50, 0][i]}
            </text>
          </g>
        ))}
        <polygon
          points={`42,190 ${points} 601,190`}
          fill="url(#hm-chart-fill)"
        />
        <polyline
          points={secondary}
          fill="none"
          stroke="#b5c0d3"
          strokeWidth="2"
          strokeDasharray="5 5"
          strokeLinecap="round"
        />
        <polyline
          className="hm-chart-line"
          points={points}
          fill="none"
          stroke="#3165f4"
          strokeWidth="2.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {(period === 'week'
          ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
          : [
              '第 1 天',
              '第 5 天',
              '第 10 天',
              '第 15 天',
              '第 20 天',
              '第 25 天',
              '第 30 天',
            ]
        ).map((label, i) => (
          <text
            key={label}
            x={42 + i * 93}
            y="217"
            fill="#949ba9"
            fontSize="10"
            textAnchor="middle"
          >
            {label}
          </text>
        ))}
        {values.map((v, i) => (
          <g
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <rect
              x={26 + i * 43}
              y="20"
              width="38"
              height="174"
              fill="transparent"
            />
            {hover === i && (
              <g>
                <line
                  x1={42 + i * 43}
                  x2={42 + i * 43}
                  y1="22"
                  y2="190"
                  stroke="#cbd6f4"
                />
                <circle
                  cx={42 + i * 43}
                  cy={170 - v}
                  r="5"
                  fill="#3165f4"
                  stroke="white"
                  strokeWidth="3"
                />
                <rect
                  x={Math.min(560, 20 + i * 43)}
                  y={Math.max(2, 133 - v)}
                  width="58"
                  height="24"
                  rx="6"
                  fill="#17243c"
                />
                <text
                  x={Math.min(560, 20 + i * 43) + 29}
                  y={Math.max(2, 133 - v) + 16}
                  fill="white"
                  textAnchor="middle"
                  fontSize="11"
                >
                  {v} 次
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function CommerceDemoPage() {
  const { section: routeSection } = useParams();
  const section: Section = navigation.some((item) => item.id === routeSection)
    ? (routeSection as Section)
    : 'overview';
  const navigate = useNavigate();
  const [displaySection, setDisplaySection] = useState(section);
  const [leaving, setLeaving] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [storeFilter, setStoreFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [agents, setAgents] = useState<DemoAgent[]>(readAgents);
  const [modal, setModal] = useState<Modal>(null);
  const lastModal = useRef<Exclude<Modal, null>>('guide');
  const renderedModal = modal || lastModal.current;
  const [activeAgent, setActiveAgent] = useState<DemoAgent>(initialAgents[0]);
  const [activeStore, setActiveStore] = useState(stores[0]);
  const [roleFilter, setRoleFilter] = useState<RoleId | 'all'>('all');
  const [taskRole, setTaskRole] = useState<RoleId>('service');
  const [taskPrompt, setTaskPrompt] = useState<string>(roles.service.prompt);
  const [taskStep, setTaskStep] = useState(0);
  const [benchmarkStep, setBenchmarkStep] = useState(0);
  const [faultStep, setFaultStep] = useState(0);
  const [strategy, setStrategy] = useState('failover');
  const [promptTab, setPromptTab] = useState('IDENTITY');
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<RoleId>('service');
  const [formStore, setFormStore] = useState(stores[0].id);
  const [formModel, setFormModel] = useState('GPT');
  const [formError, setFormError] = useState('');
  const [taskError, setTaskError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (modal) lastModal.current = modal;
  }, [modal]);

  useEffect(() => {
    if (section === displaySection) {
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const timer = setTimeout(() => {
      setDisplaySection(section);
      setLeaving(false);
    }, 160);
    return () => clearTimeout(timer);
  }, [section, displaySection]);

  useEffect(() => {
    const title = document.title;
    document.title = 'LiteClaw · 跨境电商数字员工平台';
    return () => {
      document.title = title;
    };
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (modal !== 'task' || taskStep === 0 || taskStep >= 4) return;
    const timer = setTimeout(() => setTaskStep((step) => step + 1), 700);
    return () => clearTimeout(timer);
  }, [modal, taskStep]);
  useEffect(() => {
    if (benchmarkStep === 0 || benchmarkStep >= 6) return;
    const timer = setTimeout(() => setBenchmarkStep((step) => step + 1), 550);
    return () => clearTimeout(timer);
  }, [benchmarkStep]);
  useEffect(() => {
    if (faultStep === 0 || faultStep >= 5) return;
    const timer = setTimeout(() => setFaultStep((step) => step + 1), 850);
    return () => clearTimeout(timer);
  }, [faultStep]);

  function notify(message: string) {
    clearTimeout(toastTimer.current);
    setToast(message);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 3600);
  }
  function go(next: Section) {
    setMobileOpen(false);
    navigate(`/demo/${next}`);
  }
  function openTask(role: RoleId = 'service') {
    const taskStore =
      stores.find((store) => store.id === storeFilter) || stores[0];
    setTaskRole(role);
    setTaskPrompt(
      roles[role].prompt.replace(
        'Northstar 美国站',
        `${taskStore.name} ${taskStore.region}`,
      ),
    );
    setTaskStep(0);
    setTaskError('');
    setModal('task');
  }
  function openAgent(agent: DemoAgent) {
    setActiveAgent(agent);
    setPromptTab('IDENTITY');
    setModal('agent');
  }
  function openWorkspace(agent: DemoAgent, store: (typeof stores)[number]) {
    setActiveAgent(agent);
    setActiveStore(store);
    setModal('workspace');
  }
  function createAgent(event: FormEvent) {
    event.preventDefault();
    if (!formName.trim()) {
      setFormError('请填写数字员工名称');
      return;
    }
    if (agents.length >= 50) {
      setFormError('演示空间最多保存 50 位数字员工');
      return;
    }
    const created: DemoAgent = {
      id: `agent-${crypto.randomUUID()}`,
      name: formName.trim(),
      role: formRole,
      model: formModel,
      storeIds: [formStore],
    };
    const next = [...agents, created];
    setAgents(next);
    let persisted = true;
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      persisted = false;
    }
    setStoreFilter(formStore);
    setSearch('');
    setModal(null);
    setFormName('');
    setFormError('');
    go('agents');
    notify(
      persisted
        ? `已创建 ${created.name} 配置保存在当前浏览器`
        : '已创建 本次浏览有效 浏览器未允许持久保存',
    );
  }
  function exportBenchmark() {
    exportCsv('LiteClaw-示例评测矩阵-非实测.csv', [
      [
        '数据性质',
        '模型系列（非固定版本）',
        '任务完成度',
        '事实与证据',
        '指令遵循',
        '工具调用',
        '稳定性',
        '时延（秒）',
        '成本（美元/百万Token）',
      ],
      ...modelScores.map((model) => [
        '示例评分 非实测 非实际报价',
        model.name,
        ...model.scores,
        model.latency,
        model.cost,
      ]),
    ]);
    notify('已导出示例评分矩阵');
  }
  const currentNav = navigation.find((item) => item.id === displaySection)!;
  const selectedStore = stores.find((store) => store.id === storeFilter);
  const filteredAgents = agents.filter(
    (agent) =>
      (storeFilter === 'all' || agent.storeIds.includes(storeFilter)) &&
      `${agent.name} ${roles[agent.role].name} ${agent.model}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const workspaces = agents
    .flatMap((agent) =>
      agent.storeIds.map((storeId) => ({
        agent,
        store: stores.find((store) => store.id === storeId)!,
      })),
    )
    .filter(
      ({ agent, store }) =>
        (storeFilter === 'all' || store.id === storeFilter) &&
        `${store.name} ${store.platform} ${roles[agent.role].name} ${agent.name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const visibleCases = exampleCases.filter(
    (item) =>
      (roleFilter === 'all' || item.role === roleFilter) &&
      `${item.title} ${item.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const visibleModels = modelScores.filter((model) =>
    `${model.name} ${model.subtitle}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const runtimeModels = modelNames.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase()),
  );
  const role = roles[taskRole];
  const scopeLabel = selectedStore?.name || '全部店铺';

  function workspaceTable(limit?: number) {
    return (
      <div className="hm-table-scroll">
        <table className="hm-table hm-workspace-table">
          <thead>
            <tr>
              <th>店铺 / 工作区</th>
              <th>岗位 Agent</th>
              <th>模型配置</th>
              <th>权限边界</th>
              <th>状态</th>
              <th>
                <span className="hm-sr-only">操作</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {workspaces.slice(0, limit).map(({ agent, store }) => (
              <tr key={`${agent.id}-${store.id}`}>
                <td>
                  <div className="hm-store-cell">
                    <span
                      className="hm-store-avatar"
                      style={{ background: store.color }}
                    >
                      {store.initials}
                      <span className="hm-store-mini">
                        <Store size={8} />
                      </span>
                    </span>
                    <span>
                      <strong>{store.name}</strong>
                      <small>
                        {store.platform} · {store.region} ·{' '}
                        {roles[agent.role].short}
                      </small>
                    </span>
                  </div>
                </td>
                <td>
                  <span className={`hm-tiny-icon ${roles[agent.role].color}`}>
                    {(() => {
                      const Icon = roles[agent.role].icon;
                      return <Icon size={13} />;
                    })()}
                  </span>
                  {roles[agent.role].name}
                </td>
                <td>
                  <span className="hm-model-dot" />
                  {agent.model}
                </td>
                <td>
                  <span className="hm-muted hm-inline">
                    <LockKeyhole size={12} /> 独立工作区
                  </span>
                </td>
                <td>
                  <Pill tone="green">
                    <span className="hm-status-dot" />
                    就绪
                  </Pill>
                </td>
                <td>
                  <button
                    className="hm-icon-button"
                    aria-label={`查看 ${store.name} ${roles[agent.role].name} 工作区`}
                    onClick={() => openWorkspace(agent, store)}
                  >
                    <ArrowUpRight size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {workspaces.length === 0 && (
          <EmptyState text="没有匹配的工作区 调整店铺或搜索条件试试" />
        )}
      </div>
    );
  }

  function agentCard(agent: DemoAgent) {
    const config = roles[agent.role];
    const Icon = config.icon;
    return (
      <article
        className="hm-agent-card"
        key={agent.id}
        style={{ viewTransitionName: `hm-${agent.id}` }}
      >
        <div className="hm-card-top">
          <span className={`hm-role-icon ${config.color}`}>
            <Icon size={23} strokeWidth={1.7} />
          </span>
          <Pill tone="green">
            <span className="hm-status-dot" />
            待命中
          </Pill>
          <button
            className="hm-icon-button hm-push-right"
            onClick={() => openAgent(agent)}
            aria-label={`查看 ${agent.name} 配置`}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
        <h3>{agent.name}</h3>
        <span className="hm-agent-en">{config.en}</span>
        <p>{config.description}</p>
        <div className="hm-agent-skills">
          <span>
            <FileText size={12} />
            {config.skill}
          </span>
          <span>
            <ShieldCheck size={12} />
            工作区隔离
          </span>
        </div>
        <div className="hm-agent-meta">
          <span>
            <span className="hm-model-dot" />
            {agent.model}
          </span>
          <span>
            <Store size={13} />
            {agent.storeIds.length} 个店铺工作区
          </span>
        </div>
        <div className="hm-agent-actions">
          <button
            className="hm-button hm-button-secondary"
            onClick={() => openAgent(agent)}
          >
            <Settings2 size={14} />
            岗位配置
          </button>
          <button
            className="hm-button hm-button-primary"
            onClick={() => openTask(agent.role)}
          >
            <Play size={13} />
            试运行
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="hm-app">
      <button
        className="hm-mobile-scrim"
        data-open={mobileOpen}
        onClick={() => setMobileOpen(false)}
        aria-label="关闭导航"
        tabIndex={mobileOpen ? 0 : -1}
      />
      <aside className="hm-sidebar" data-open={mobileOpen} aria-label="主导航">
        <Link
          to="/demo"
          className="hm-brand"
          onClick={() => setMobileOpen(false)}
        >
          <span className="hm-brand-icon">
            <Layers size={23} strokeWidth={2} />
          </span>
          <span>
            <strong>
              Lite<span className="hm-brand-ai">Claw</span>
            </strong>
            <small>跨境电商数字员工平台</small>
          </span>
        </Link>
        <button className="hm-team-switch" onClick={() => setModal('guide')}>
          <span className="hm-team-avatar">LC</span>
          <span>
            <strong>LiteClaw 运营空间</strong>
            <small>跨境多店铺演示空间</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <span className="hm-nav-label">
          工作空间 <span>WORKSPACE</span>
        </span>
        <nav>
          {navigation.map((item) => (
            <Link
              key={item.id}
              to={`/demo/${item.id}`}
              aria-label={item.label}
              aria-current={section === item.id ? 'page' : undefined}
              className={`hm-nav-item ${section === item.id ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.id === 'agents' && (
                <span className="hm-nav-count">
                  {agents.length.toString().padStart(2, '0')}
                </span>
              )}
              {item.id === 'runtime' && (
                <span
                  className={`hm-nav-dot ${faultStep > 0 && faultStep < 5 ? 'warning' : ''}`}
                />
              )}
            </Link>
          ))}
        </nav>
        <div className="hm-sidebar-scope">
          <div>
            <ShieldCheck size={16} />
            <strong>每个店铺 独立边界</strong>
          </div>
          <p>
            身份、数据与运行上下文
            <br />
            始终在工作区内组织
          </p>
          <button onClick={() => go('workspaces')}>
            查看工作区 <ArrowRight size={13} />
          </button>
          <div className="hm-scope-art" aria-hidden="true">
            <Layers size={56} strokeWidth={0.7} />
            <LockKeyhole size={22} strokeWidth={1.3} />
          </div>
        </div>
        <div className="hm-sidebar-bottom">
          <button className="hm-nav-item" onClick={() => setModal('guide')}>
            <CircleHelp size={18} />
            <span>演示指南</span>
            <span className="hm-keycap">?</span>
          </button>
          <Link className="hm-nav-item" to="/chat">
            <ExternalLink size={17} />
            <span>进入真实工作台</span>
            <ArrowUpRight size={14} />
          </Link>
          <div className="hm-profile">
            <span className="hm-user-avatar">LC</span>
            <span>
              <strong>演示管理员</strong>
              <small>本地演示空间</small>
            </span>
            <Pill>DEMO</Pill>
          </div>
        </div>
      </aside>

      <div className="hm-main">
        <header className="hm-topbar">
          <div className="hm-breadcrumb">
            <button
              className="hm-icon-button hm-mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="打开导航"
            >
              <Menu size={20} />
            </button>
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>{currentNav.label}</strong>
            <Pill tone="blue">演示环境</Pill>
          </div>
          <div className="hm-topbar-actions">
            <label className="hm-search">
              <Search size={15} />
              <input
                ref={searchRef}
                aria-label="搜索当前页面"
                placeholder="搜索当前页面"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search ? (
                <button aria-label="清除搜索" onClick={() => setSearch('')}>
                  <X size={13} />
                </button>
              ) : (
                <kbd>Ctrl K</kbd>
              )}
            </label>
            <button
              className="hm-icon-button hm-notification"
              onClick={() => setModal('notifications')}
              aria-label="查看演示通知"
            >
              <Bell size={18} />
              <i />
            </button>
            <span className="hm-top-divider" />
            <span className="hm-top-avatar">LC</span>
          </div>
        </header>

        <main className="hm-content">
          <div className="hm-demo-notice">
            <span>
              <span className="hm-live-dot" />
              交互演示空间 <span className="hm-notice-separator">/</span>
              <span>任务、评分与运行指标均为示例数据</span>
            </span>
            <button onClick={() => setModal('guide')}>
              如何演示 <ArrowUpRight size={12} />
            </button>
          </div>
          <div
            key={displaySection}
            className={`hm-page ${leaving ? 'hm-page-leaving' : ''}`}
          >
            <div className="hm-page-heading">
              <div>
                <div className="hm-eyebrow">{currentNav.en.toUpperCase()}</div>
                <h1>
                  {currentNav.label}
                  <span className="hm-heading-dot">.</span>
                </h1>
                <p>
                  {
                    {
                      overview: '让每一家店铺 都有一支默契的 AI 团队',
                      agents: '把业务规则组织成岗位 让数字员工各司其职',
                      workspaces: '一个店铺 一个岗位 一份独立的运行上下文',
                      benchmark: '从业务任务出发 让模型选择有据可依',
                      runtime: '让每一次运行 都有可解释的选择与退路',
                    }[displaySection]
                  }
                </p>
              </div>
              <div className="hm-heading-actions">
                {displaySection === 'overview' ||
                displaySection === 'workspaces' ||
                displaySection === 'agents' ? (
                  <>
                    <label className="hm-store-select">
                      <Store size={14} />
                      <select
                        aria-label="选择店铺"
                        value={storeFilter}
                        onChange={(e) => {
                          const value = e.target.value;
                          morph(() => setStoreFilter(value));
                        }}
                      >
                        <option value="all">全部店铺</option>
                        {stores.map((store) => (
                          <option value={store.id} key={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={13} />
                    </label>
                    <button
                      className="hm-button hm-button-primary"
                      onClick={() => {
                        setFormError('');
                        setModal('create');
                      }}
                    >
                      <Plus size={15} />
                      创建数字员工
                    </button>
                  </>
                ) : displaySection === 'benchmark' ? (
                  <>
                    <button
                      className="hm-button hm-button-secondary"
                      onClick={exportBenchmark}
                    >
                      <Download size={14} />
                      导出矩阵
                    </button>
                    <button
                      className="hm-button hm-button-primary"
                      disabled={benchmarkStep > 0 && benchmarkStep < 6}
                      onClick={() => setBenchmarkStep(1)}
                    >
                      {benchmarkStep > 0 && benchmarkStep < 6 ? (
                        <Loader2 className="hm-spin" size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                      回放示例评测
                    </button>
                  </>
                ) : (
                  <button
                    className={`hm-button ${faultStep ? 'hm-button-secondary' : 'hm-button-primary'}`}
                    disabled={faultStep > 0 && faultStep < 5}
                    onClick={() => setFaultStep(faultStep ? 0 : 1)}
                  >
                    {faultStep ? <RefreshCw size={14} /> : <Zap size={14} />}
                    {faultStep ? '恢复演示状态' : '模拟 Provider 故障'}
                  </button>
                )}
              </div>
            </div>

            {displaySection === 'overview' && (
              <>
                <section className="hm-stats" aria-label="示例运营指标">
                  {[
                    {
                      label: '已完成任务',
                      value:
                        storeFilter === 'all'
                          ? period === 'week'
                            ? '1,284'
                            : '5,136'
                          : '428',
                      suffix: '次',
                      change: '18.6%',
                      foot: '较上一周期',
                      icon: CheckCircle2,
                      values: chartSeries.week,
                    },
                    {
                      label: '数字员工',
                      value: String(filteredAgents.length).padStart(2, '0'),
                      suffix: '位',
                      change: `${storeFilter === 'all' ? stores.length : 1} 个店铺`,
                      foot: '覆盖运营岗位',
                      icon: Bot,
                      values: [10, 10, 18, 18, 18, 23, 23, 30],
                    },
                    {
                      label: '任务完成率',
                      value: '96.8',
                      suffix: '%',
                      change: '2.4%',
                      foot: '较上一周期',
                      icon: TrendingUp,
                      values: [60, 65, 63, 70, 71, 77, 80, 88],
                    },
                    {
                      label: '模型运行成本',
                      value:
                        storeFilter === 'all'
                          ? period === 'week'
                            ? '$18.42'
                            : '$73.68'
                          : '$6.14',
                      suffix: '',
                      change: '12.3%',
                      foot: '较上一周期',
                      icon: Zap,
                      values: [80, 72, 76, 62, 65, 50, 55, 42],
                    },
                  ].map((stat, i) => (
                    <article className="hm-stat" key={stat.label}>
                      <div className="hm-stat-label">
                        {stat.label}
                        <stat.icon size={15} />
                      </div>
                      <div className="hm-stat-value">
                        {stat.value}
                        <span>{stat.suffix}</span>
                      </div>
                      <div className="hm-stat-foot">
                        <span className={i === 1 ? 'hm-muted' : 'hm-positive'}>
                          {i !== 1 &&
                            (i === 3 ? (
                              <ArrowDown size={11} />
                            ) : (
                              <TrendingUp size={11} />
                            ))}
                          {stat.change}
                        </span>
                        <span>{stat.foot}</span>
                      </div>
                      <Sparkline values={stat.values} secondary={i === 1} />
                    </article>
                  ))}
                </section>
                <div className="hm-overview-grid">
                  <section className="hm-panel hm-trend-panel">
                    <div className="hm-panel-heading">
                      <div>
                        <h2>任务运行趋势</h2>
                        <p>{scopeLabel} · 任务吞吐与人工复核</p>
                      </div>
                      <div className="hm-segment">
                        <button
                          aria-pressed={period === 'week'}
                          className={period === 'week' ? 'active' : ''}
                          onClick={() => setPeriod('week')}
                        >
                          近 7 天
                        </button>
                        <button
                          aria-pressed={period === 'month'}
                          className={period === 'month' ? 'active' : ''}
                          onClick={() => setPeriod('month')}
                        >
                          近 30 天
                        </button>
                      </div>
                    </div>
                    <div className="hm-chart-summary">
                      <strong>
                        {storeFilter === 'all'
                          ? period === 'week'
                            ? '1,284'
                            : '5,136'
                          : '428'}
                        <small>次任务</small>
                      </strong>
                      <div className="hm-chart-legend">
                        <span>
                          <i />
                          已完成任务
                        </span>
                        <span>
                          <i />
                          人工复核
                        </span>
                      </div>
                    </div>
                    <TaskChart period={period} />
                  </section>
                  <section className="hm-panel hm-team-panel">
                    <div className="hm-panel-heading">
                      <div>
                        <h2>你的数字员工</h2>
                        <p>三个岗位 一支协作团队</p>
                      </div>
                      <button
                        className="hm-icon-button"
                        onClick={() => go('agents')}
                        aria-label="查看全部数字员工"
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="hm-team-list">
                      {filteredAgents.slice(0, 3).map((agent) => {
                        const config = roles[agent.role];
                        const Icon = config.icon;
                        return (
                          <button
                            className="hm-team-row"
                            key={agent.id}
                            onClick={() => openAgent(agent)}
                          >
                            <span className={`hm-role-icon ${config.color}`}>
                              <Icon size={20} strokeWidth={1.7} />
                            </span>
                            <span>
                              <strong>{agent.name}</strong>
                              <small>
                                {config.name} <span>·</span> {agent.model}
                              </small>
                            </span>
                            <span className="hm-team-status">
                              <span className="hm-status-dot" />
                              就绪
                            </span>
                            <ChevronRight size={13} />
                          </button>
                        );
                      })}
                      {filteredAgents.length === 0 && (
                        <EmptyState text="没有匹配的数字员工" />
                      )}
                    </div>
                    <button className="hm-new-task" onClick={() => openTask()}>
                      <span>
                        <Sparkles size={17} />
                        <span>
                          <strong>交给数字员工一项任务</strong>
                          <small>从一次业务对话开始</small>
                        </span>
                      </span>
                      <ArrowRight size={17} />
                    </button>
                  </section>
                </div>
                <section className="hm-panel hm-workspaces-panel">
                  <div className="hm-panel-heading">
                    <div>
                      <h2>
                        店铺工作区{' '}
                        <span className="hm-count">{workspaces.length}</span>
                      </h2>
                      <p>按店铺与岗位组织 文件、记忆和会话各自独立</p>
                    </div>
                    <button
                      className="hm-text-button"
                      onClick={() => go('workspaces')}
                    >
                      查看全部 <ArrowRight size={13} />
                    </button>
                  </div>
                  {workspaceTable(3)}
                </section>
                <div className="hm-bottom-grid">
                  <section className="hm-benchmark-banner">
                    <span className="hm-banner-icon">
                      <FlaskConical size={22} strokeWidth={1.6} />
                    </span>
                    <div>
                      <span className="hm-eyebrow">
                        EVALUATE BEFORE YOU DEPLOY
                      </span>
                      <h3>为每个岗位 找到合适的模型</h3>
                      <p>300+ 业务用例 · 5 个模型 · 7 个评估维度</p>
                    </div>
                    <button
                      className="hm-button hm-button-secondary"
                      onClick={() => go('benchmark')}
                    >
                      查看模型评测 <ArrowRight size={13} />
                    </button>
                  </section>
                  <section className="hm-runtime-mini">
                    <div className="hm-inline">
                      <ShieldCheck size={18} />
                      <strong>运行保障</strong>
                      <Pill tone={faultStep ? 'blue' : 'green'}>
                        {faultStep ? '故障回放' : '示例就绪'}
                      </Pill>
                    </div>
                    <p>ProviderPool 健康检查与故障切换</p>
                    <button onClick={() => go('runtime')}>
                      查看运行链路 <ArrowUpRight size={13} />
                    </button>
                  </section>
                </div>
              </>
            )}

            {displaySection === 'agents' && (
              <>
                <div className="hm-section-toolbar">
                  <div className="hm-inline">
                    <Pill tone="blue">{filteredAgents.length} 位数字员工</Pill>
                    <span className="hm-muted">
                      {scopeLabel} · 每个岗位拥有独立身份与能力配置
                    </span>
                  </div>
                  <button className="hm-text-button" onClick={() => openTask()}>
                    <Play size={13} />
                    快速试运行
                  </button>
                </div>
                <section className="hm-agents-grid">
                  {filteredAgents.map(agentCard)}
                </section>
                {!filteredAgents.length && (
                  <EmptyState text="没有匹配的数字员工 调整搜索或创建一个新岗位" />
                )}
                <section className="hm-model-explainer">
                  <div>
                    <span className="hm-eyebrow">A CLEAR PRODUCT MODEL</span>
                    <h2>身份、空间、会话 各司其职</h2>
                    <p>
                      同一岗位可绑定不同店铺的工作区
                      一个工作区只绑定一个顶层岗位 Agent
                    </p>
                  </div>
                  <div className="hm-model-chain">
                    {[
                      {
                        icon: Bot,
                        name: 'AgentProfile',
                        detail: '岗位身份与能力策略',
                      },
                      {
                        icon: Layers,
                        name: 'Workspace',
                        detail: '店铺文件与权限边界',
                      },
                      {
                        icon: Workflow,
                        name: 'Runtime Session',
                        detail: '运行上下文与身份状态',
                      },
                    ].map((item, i) => (
                      <div key={item.name}>
                        <span className="hm-chain-node">
                          <item.icon size={19} />
                          <strong>{item.name}</strong>
                          <small>{item.detail}</small>
                        </span>
                        {i < 2 && <ArrowRight size={16} />}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {displaySection === 'workspaces' && (
              <>
                <div className="hm-store-grid">
                  {stores
                    .filter(
                      (store) =>
                        storeFilter === 'all' || store.id === storeFilter,
                    )
                    .map((store) => (
                      <button
                        key={store.id}
                        className="hm-store-card"
                        onClick={() =>
                          setStoreFilter(
                            storeFilter === store.id ? 'all' : store.id,
                          )
                        }
                      >
                        <span
                          className="hm-store-avatar"
                          style={{ background: store.color }}
                        >
                          {store.initials}
                        </span>
                        <div>
                          <h3>{store.name}</h3>
                          <p>
                            {store.platform} · {store.region}
                          </p>
                        </div>
                        <Pill>
                          {
                            agents.filter((agent) =>
                              agent.storeIds.includes(store.id),
                            ).length
                          }{' '}
                          个工作区
                        </Pill>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                </div>
                <section className="hm-panel">
                  <div className="hm-panel-heading">
                    <div>
                      <h2>工作区目录</h2>
                      <p>隔离键由店铺与岗位共同组织 不跨工作区共享记忆</p>
                    </div>
                    <Pill tone="blue">
                      <LockKeyhole size={11} />
                      Owner ACL
                    </Pill>
                  </div>
                  {workspaceTable()}
                </section>
                <div className="hm-info-strip">
                  <ShieldCheck size={16} />
                  <p>
                    这里展示工作区模型与隔离边界 数据来自本地演示配置
                    真实权限由服务端校验
                  </p>
                </div>
              </>
            )}

            {displaySection === 'benchmark' && (
              <>
                <div className="hm-eval-overview">
                  <div>
                    <span className="hm-eval-label">BUSINESS BENCHMARK</span>
                    <h2>从业务问题 到岗位适配</h2>
                    <p>先定义什么是一次正确完成 再比较模型表现</p>
                    <div className="hm-eval-tags">
                      <span>
                        <CheckCircle2 size={13} />
                        任务完成
                      </span>
                      <span>
                        <FileText size={13} />
                        事实证据
                      </span>
                      <span>
                        <Workflow size={13} />
                        工具调用
                      </span>
                    </div>
                  </div>
                  <div className="hm-eval-numbers">
                    <span>
                      <strong>
                        300<small>+</small>
                      </strong>
                      <small>业务用例池（演示 9 条）</small>
                    </span>
                    <span>
                      <strong>
                        05<small>个</small>
                      </strong>
                      <small>评测模型</small>
                    </span>
                    <span>
                      <strong>
                        07<small>维</small>
                      </strong>
                      <small>评估维度</small>
                    </span>
                  </div>
                </div>
                {benchmarkStep > 0 && (
                  <div className="hm-progress-panel" role="status">
                    <span className="hm-inline">
                      {benchmarkStep < 6 ? (
                        <Loader2 className="hm-spin" size={15} />
                      ) : (
                        <CheckCircle2 size={15} />
                      )}
                      {benchmarkStep < 6
                        ? `正在回放示例模型 ${benchmarkStep} / 5`
                        : '示例评测回放完成 已展示预置评分矩阵'}
                    </span>
                    <span>不调用模型 API</span>
                    <div className="hm-progress-track">
                      <i
                        style={{
                          width: `${Math.min(100, (benchmarkStep / 6) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                <section className="hm-panel">
                  <div className="hm-panel-heading">
                    <div>
                      <h2>
                        Multi-Model 评测矩阵 <Pill tone="amber">示例评分</Pill>
                      </h2>
                      <p>
                        前 5 项为 0–100 分 时延与成本越低越好 · 均为预置样例
                        非实测与实际报价
                      </p>
                    </div>
                    <button
                      className="hm-icon-button"
                      onClick={exportBenchmark}
                      aria-label="下载示例评分矩阵"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                  <div className="hm-table-scroll">
                    <table className="hm-table hm-score-table">
                      <thead>
                        <tr>
                          <th>模型系列</th>
                          {[
                            '任务完成',
                            '事实与证据',
                            '指令遵循',
                            '工具调用',
                            '稳定性',
                            '时延 / s',
                            '成本 / $',
                          ].map((label) => (
                            <th key={label}>{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleModels.map((model, i) => (
                          <tr key={model.name}>
                            <td>
                              <div className="hm-model-cell">
                                <span
                                  className={`hm-model-avatar model-${model.name.toLowerCase()}`}
                                >
                                  {model.name.slice(0, 1)}
                                </span>
                                <span>
                                  <strong>{model.name}</strong>
                                  <small>{model.subtitle}</small>
                                </span>
                                {i === 0 && (
                                  <span className="hm-recommend-label">
                                    示例
                                  </span>
                                )}
                              </div>
                            </td>
                            {model.scores.map((score, j) => (
                              <td key={j}>
                                <span
                                  className={`hm-score ${score >= 95 ? 'high' : score < 90 ? 'low' : ''}`}
                                >
                                  {score}
                                  <i style={{ width: `${score}%` }} />
                                </span>
                              </td>
                            ))}
                            <td className="hm-numeric">
                              {model.latency.toFixed(1)}
                            </td>
                            <td className="hm-numeric">
                              {model.cost.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!visibleModels.length && (
                      <EmptyState text="没有匹配的模型" />
                    )}
                  </div>
                  <div className="hm-table-foot">
                    <span>
                      <span className="hm-score-key" />
                      较高示例评分
                    </span>
                    <span>
                      成本示例单位 $ / 百万 Token · 未区分输入输出
                      不用于实际计费
                    </span>
                  </div>
                </section>
                <div className="hm-eval-bottom">
                  <section className="hm-panel">
                    <div className="hm-panel-heading">
                      <div>
                        <h2>
                          业务用例库{' '}
                          <span className="hm-count">
                            {visibleCases.length}
                          </span>
                        </h2>
                        <p>覆盖政策问答、选品对比与广告复盘</p>
                      </div>
                      <button
                        className="hm-text-button"
                        onClick={() => {
                          exportCsv('LiteClaw-业务用例样例.csv', [
                            ['用例ID', '岗位', '任务', '预期行为', '数据性质'],
                            ...visibleCases.map((item) => [
                              item.id,
                              roles[item.role as RoleId].name,
                              item.title,
                              item.expected,
                              '示例用例',
                            ]),
                          ]);
                          notify('已导出当前筛选的示例用例');
                        }}
                      >
                        <Download size={13} />
                        导出用例
                      </button>
                    </div>
                    <div className="hm-tabs" aria-label="按岗位筛选用例">
                      {(['all', ...roleIds] as const).map((id) => (
                        <button
                          aria-pressed={roleFilter === id}
                          className={roleFilter === id ? 'active' : ''}
                          key={id}
                          onClick={() => morph(() => setRoleFilter(id))}
                        >
                          {id === 'all' ? '全部用例' : roles[id].name}
                        </button>
                      ))}
                    </div>
                    <div className="hm-case-list" key={roleFilter}>
                      {visibleCases.map((item) => (
                        <div key={item.id} className="hm-case-row">
                          <span className="hm-case-id">{item.id}</span>
                          <span>
                            <strong>{item.title}</strong>
                            <small>{item.expected}</small>
                          </span>
                          <Pill>{roles[item.role as RoleId].short}</Pill>
                        </div>
                      ))}
                      {!visibleCases.length && (
                        <EmptyState text="没有匹配的业务用例" />
                      )}
                    </div>
                  </section>
                  <section className="hm-recommend-panel">
                    <span className="hm-eyebrow">ROLE × MODEL</span>
                    <h2>岗位适配建议</h2>
                    <p>
                      示例矩阵用于展示选型思路
                      <br />
                      不代表真实模型能力排名
                    </p>
                    {roleIds.map((id) => {
                      const Icon = roles[id].icon;
                      return (
                        <div className="hm-recommend-row" key={id}>
                          <span className={`hm-tiny-icon ${roles[id].color}`}>
                            <Icon size={15} />
                          </span>
                          <span>{roles[id].name}</span>
                          <strong>{roles[id].model}</strong>
                        </div>
                      );
                    })}
                    <div className="hm-recommend-note">
                      <FileText size={15} />
                      <span>
                        实测时请固定模型版本、Prompt、工具权限及输入数据
                      </span>
                    </div>
                  </section>
                </div>
              </>
            )}

            {displaySection === 'runtime' && (
              <>
                <div className="hm-runtime-status">
                  <span
                    className={`hm-runtime-status-icon ${faultStep > 0 && faultStep < 5 ? 'warning' : ''}`}
                  >
                    <ShieldCheck size={26} strokeWidth={1.6} />
                  </span>
                  <div>
                    <h2>
                      {faultStep === 0
                        ? '运行链路 准备就绪'
                        : faultStep < 5
                          ? '检测到示例故障 正在切换'
                          : '故障切换回放完成'}
                    </h2>
                    <p>
                      {faultStep === 0
                        ? '通过一次故障回放 观察健康隔离、重新选择与会话恢复边界'
                        : faultStep < 5
                          ? '当前正在回放预置事件 不影响真实 Provider 与运行会话'
                          : '已在示例链路中选择备用 Provider 原生会话可能需要重建'}
                    </p>
                  </div>
                  <Pill
                    tone={faultStep > 0 && faultStep < 5 ? 'amber' : 'green'}
                  >
                    <span className="hm-status-dot" />
                    {faultStep === 0
                      ? '演示就绪'
                      : faultStep < 5
                        ? '回放中'
                        : '已切换'}
                  </Pill>
                </div>
                <section className="hm-panel">
                  <div className="hm-panel-heading">
                    <div>
                      <h2>Provider 路由链路</h2>
                      <p>
                        显式模型绑定优先 自动池可采用轮询、加权轮询或故障转移
                      </p>
                    </div>
                    <label className="hm-strategy-select">
                      <Settings2 size={13} />
                      <select
                        aria-label="路由策略演示"
                        value={strategy}
                        onChange={(e) => {
                          setStrategy(e.target.value);
                          setFaultStep(0);
                        }}
                      >
                        <option value="failover">故障转移</option>
                        <option value="weighted">加权轮询</option>
                        <option value="round">轮询</option>
                      </select>
                      <ChevronDown size={12} />
                    </label>
                  </div>
                  <div className="hm-routing-diagram">
                    <div className="hm-route-node">
                      <span className="hm-route-icon">
                        <Send size={21} />
                      </span>
                      <strong>业务任务</strong>
                      <small>携带岗位与工作区身份</small>
                      <Pill>Workspace scoped</Pill>
                    </div>
                    <div className="hm-route-connector">
                      <i />
                      <ArrowRight size={17} />
                    </div>
                    <div className="hm-route-node hm-route-pool">
                      <span className="hm-route-icon">
                        <GitBranch size={21} />
                      </span>
                      <strong>ProviderPool</strong>
                      <small>
                        {strategy === 'failover'
                          ? '优先健康主节点 故障后回退'
                          : strategy === 'weighted'
                            ? '按配置权重选择健康节点'
                            : '依次选择可用健康节点'}
                      </small>
                      <Pill tone="blue">
                        {strategy === 'failover'
                          ? 'Failover'
                          : strategy === 'weighted'
                            ? 'Weighted round-robin'
                            : 'Round-robin'}
                      </Pill>
                    </div>
                    <div className="hm-route-connector">
                      <i />
                      <ArrowRight size={17} />
                    </div>
                    <div className="hm-provider-stack">
                      <div
                        className={`hm-provider-target ${faultStep ? 'failed' : 'selected'}`}
                      >
                        <span className="hm-model-avatar">G</span>
                        <span>
                          <strong>GPT · 主 Provider</strong>
                          <small>
                            {faultStep ? '示例故障 · 暂时隔离' : '会话粘性绑定'}
                          </small>
                        </span>
                        {faultStep ? (
                          <X size={15} />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                      </div>
                      <div
                        className={`hm-provider-target ${faultStep >= 4 ? 'selected' : ''}`}
                      >
                        <span className="hm-model-avatar">C</span>
                        <span>
                          <strong>Claude · 备用 Provider</strong>
                          <small>
                            {faultStep >= 4
                              ? '已重新选择 · 示例恢复'
                              : '健康候选 · 等待回退'}
                          </small>
                        </span>
                        {faultStep >= 4 && <CheckCircle2 size={16} />}
                      </div>
                    </div>
                  </div>
                  <div className="hm-info-strip">
                    <LockKeyhole size={14} />
                    <p>
                      质量、时延与成本可作为离线选型依据 此处不声称已接入
                      Benchmark 驱动的自动路由
                    </p>
                  </div>
                </section>
                <div className="hm-runtime-grid">
                  <section className="hm-panel">
                    <div className="hm-panel-heading">
                      <div>
                        <h2>Provider 健康状态</h2>
                        <p>内存健康状态 · 所有数值均为示例</p>
                      </div>
                      <Pill>{modelNames.length} 个配置</Pill>
                    </div>
                    <div className="hm-provider-list">
                      {runtimeModels.map((name, index) => (
                        <div key={name} className="hm-provider-row">
                          <span
                            className={`hm-model-avatar model-${name.toLowerCase()}`}
                          >
                            {name.slice(0, 1)}
                          </span>
                          <div>
                            <strong>{name}</strong>
                            <small>
                              {name === 'GPT' && faultStep
                                ? '连续失败 3 次 · 等待恢复间隔'
                                : '连续错误 0 · 可参与候选选择'}
                            </small>
                          </div>
                          <Sparkline
                            values={
                              index === 0 && faultStep
                                ? [28, 28, 25, 15, 4, 3, 2]
                                : [22, 26, 25, 28, 23, 28, 27]
                            }
                          />
                          <Pill
                            tone={index === 0 && faultStep ? 'amber' : 'green'}
                          >
                            {index === 0 && faultStep ? '已隔离' : '健康'}
                          </Pill>
                        </div>
                      ))}
                      {!runtimeModels.length && (
                        <EmptyState text="没有匹配的 Provider" />
                      )}
                    </div>
                  </section>
                  <section className="hm-panel">
                    <div className="hm-panel-heading">
                      <div>
                        <h2>故障切换时间线</h2>
                        <p>可重复播放的前端事件演示</p>
                      </div>
                      <Clock3 size={16} />
                    </div>
                    <div className="hm-timeline">
                      {[
                        {
                          title: '正常运行',
                          detail: '会话绑定主 Provider',
                          step: 0,
                        },
                        {
                          title: '检测 Provider 异常',
                          detail: '模拟额度不足或服务不可用',
                          step: 1,
                        },
                        {
                          title: '标记不健康并隔离',
                          detail: '更新错误计数与健康状态',
                          step: 2,
                        },
                        {
                          title: '检查其他健康候选',
                          detail: '无健康节点时显式终止 不无限重试',
                          step: 3,
                        },
                        {
                          title: '选择备用与恢复输入',
                          detail: '跨 Provider 可能重建原生会话',
                          step: 4,
                        },
                        {
                          title: '完成回放',
                          detail: '实际恢复情况以真实执行结果为准',
                          step: 5,
                        },
                      ].map((item) => (
                        <div
                          className={`hm-timeline-item ${faultStep >= item.step ? 'done' : ''} ${faultStep === item.step ? 'current' : ''}`}
                          key={item.title}
                        >
                          <span>
                            {faultStep > item.step ? (
                              <Check size={11} />
                            ) : (
                              <i />
                            )}
                          </span>
                          <div>
                            <strong>{item.title}</strong>
                            <small>{item.detail}</small>
                          </div>
                          <small>
                            {item.step === 0 ? '00:00' : `00:0${item.step}`}
                          </small>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </>
            )}
            <footer className="hm-footer">
              <span>
                <Layers size={12} />
                LITECLAW <span>/</span> 跨境电商数字员工平台
              </span>
              <span>
                本地交互演示 <i /> 所有业务数据与模型结果均为示例
              </span>
            </footer>
          </div>
        </main>
      </div>

      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setModal(null);
          }
        }}
      >
        <DialogContent
          className={`hm-modal ${renderedModal === 'task' || renderedModal === 'agent' || renderedModal === 'workspace' ? 'hm-modal-wide' : ''}`}
        >
          <DialogHeader>
            <DialogTitle>
              {
                {
                  create: '创建数字员工',
                  task: '数字员工试运行',
                  workspace: '工作区详情',
                  guide: '三分钟 演示一支 AI 团队',
                  notifications: '演示空间通知',
                  agent: '岗位 Agent 配置',
                }[renderedModal]
              }
            </DialogTitle>
            <DialogDescription>
              {
                {
                  create: '在当前浏览器创建演示配置 不会写入真实平台',
                  task: '回放预置业务样例 不调用模型或业务 API',
                  workspace: '展示店铺、岗位与会话的归属关系',
                  guide: '沿着岗位、空间、评测与运行保障 展示完整产品思路',
                  notifications: '以下为预置通知 不代表真实后台事件',
                  agent: '只读配置预览 实际策略在真实工作台中管理',
                }[renderedModal]
              }
            </DialogDescription>
          </DialogHeader>

          {renderedModal === 'create' && (
            <form className="hm-form" onSubmit={createAgent}>
              <label>
                员工名称
                <input
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    setFormError('');
                  }}
                  placeholder="例如 北辰店铺客服专员"
                  maxLength={40}
                  autoFocus
                  required
                />
              </label>
              <div className="hm-form-columns">
                <label>
                  岗位
                  <select
                    value={formRole}
                    onChange={(e) => {
                      const id = e.target.value as RoleId;
                      setFormRole(id);
                      setFormModel(roles[id].model);
                    }}
                  >
                    {roleIds.map((id) => (
                      <option value={id} key={id}>
                        {roles[id].name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  模型系列
                  <select
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                  >
                    {modelNames.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                店铺工作区
                <select
                  value={formStore}
                  onChange={(e) => setFormStore(e.target.value)}
                >
                  {stores.map((store) => (
                    <option value={store.id} key={store.id}>
                      {store.name} · {store.region}
                    </option>
                  ))}
                </select>
              </label>
              <div className="hm-form-hint">
                <ShieldCheck size={15} />
                新配置仅绑定选中的店铺 不共享其他店铺上下文
              </div>
              {formError && (
                <p className="hm-error" role="alert">
                  {formError}
                </p>
              )}
              <button className="hm-button hm-button-primary" type="submit">
                <Plus size={14} />
                创建演示员工
              </button>
            </form>
          )}

          {renderedModal === 'task' && (
            <div className="hm-task-demo">
              <div className="hm-task-role-picker">
                {roleIds.map((id) => {
                  const Icon = roles[id].icon;
                  return (
                    <button
                      key={id}
                      className={taskRole === id ? 'active' : ''}
                      disabled={taskStep > 0 && taskStep < 4}
                      onClick={() => {
                        setTaskRole(id);
                        setTaskPrompt(roles[id].prompt);
                        setTaskStep(0);
                      }}
                    >
                      <Icon size={16} />
                      {roles[id].name}
                    </button>
                  );
                })}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!taskPrompt.trim()) {
                    setTaskError('请输入任务描述');
                    return;
                  }
                  setTaskError('');
                  setTaskStep(1);
                }}
              >
                <label className="hm-task-label" htmlFor="hm-task-prompt">
                  任务描述
                </label>
                <textarea
                  id="hm-task-prompt"
                  value={taskPrompt}
                  onChange={(e) => {
                    setTaskPrompt(e.target.value);
                    setTaskStep(0);
                  }}
                  maxLength={1500}
                  disabled={taskStep > 0 && taskStep < 4}
                />
                <div className="hm-task-input-foot">
                  <span>
                    <LockKeyhole size={12} />
                    {selectedStore?.name || 'Northstar 北辰'} · {role.name}
                  </span>
                  <button
                    className="hm-button hm-button-primary"
                    disabled={taskStep > 0 && taskStep < 4}
                    type="submit"
                  >
                    {taskStep > 0 && taskStep < 4 ? (
                      <Loader2 className="hm-spin" size={13} />
                    ) : (
                      <Play size={13} />
                    )}
                    {taskStep === 4 ? '重新回放' : '回放任务样例'}
                  </button>
                </div>
                {taskError && (
                  <p className="hm-error" role="alert">
                    {taskError}
                  </p>
                )}
              </form>
              {taskStep > 0 && (
                <div className="hm-task-trace" aria-live="polite">
                  <div className="hm-inline">
                    <Pill tone="blue">示例 Trace</Pill>
                    <span className="hm-muted">
                      自定义输入仅用于展示 原样例结果不会随输入推理
                    </span>
                  </div>
                  {[
                    '解析岗位身份与工作区范围',
                    `读取示例来源 · ${role.tool}`,
                    '组织证据与待审批建议',
                  ].map((text, i) => (
                    <div className="hm-trace-step" key={text}>
                      <span>
                        {taskStep > i + 1 ? (
                          <CheckCircle2 size={14} />
                        ) : taskStep === i + 1 ? (
                          <Loader2 className="hm-spin" size={14} />
                        ) : (
                          <Clock3 size={14} />
                        )}
                      </span>
                      <span>{text}</span>
                      <small>
                        {taskStep > i + 1
                          ? '完成'
                          : taskStep === i + 1
                            ? '回放中'
                            : '等待'}
                      </small>
                    </div>
                  ))}
                  {taskStep === 4 && (
                    <div className="hm-task-result">
                      <strong>
                        <Sparkles size={15} />
                        示例任务结果
                      </strong>
                      <p>{role.result}</p>
                      <small>
                        <FileText size={12} />
                        {role.evidence}
                      </small>
                      <Pill tone="amber">仅为预置样例 不构成实际业务结论</Pill>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {renderedModal === 'agent' && (
            <div className="hm-agent-config">
              <div className="hm-config-summary">
                <span
                  className={`hm-role-icon ${roles[activeAgent.role].color}`}
                >
                  {(() => {
                    const Icon = roles[activeAgent.role].icon;
                    return <Icon size={25} />;
                  })()}
                </span>
                <div>
                  <h3>{activeAgent.name}</h3>
                  <p>
                    {roles[activeAgent.role].en} · {activeAgent.model}
                  </p>
                </div>
                <Pill tone="blue">AgentProfile</Pill>
              </div>
              <div className="hm-detail-grid">
                <div>
                  <small>工作区数量</small>
                  <strong>{activeAgent.storeIds.length} 个独立工作区</strong>
                </div>
                <div>
                  <small>Prompt 编排</small>
                  <strong>append · 保留平台约束</strong>
                </div>
                <div>
                  <small>能力策略</small>
                  <strong>{roles[activeAgent.role].skill}</strong>
                </div>
                <div>
                  <small>模型绑定</small>
                  <strong>{activeAgent.model} · 示例配置</strong>
                </div>
              </div>
              <div className="hm-tabs">
                {['IDENTITY', 'SOUL', 'AGENTS', 'TOOLS'].map((tab) => (
                  <button
                    key={tab}
                    className={promptTab === tab ? 'active' : ''}
                    onClick={() => setPromptTab(tab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="hm-prompt-preview" key={promptTab}>
                <span>## {promptTab}</span>
                <p>
                  {promptTab === 'IDENTITY'
                    ? `你是${roles[activeAgent.role].name}，仅在当前绑定店铺的工作区内处理任务。明确区分已知事实、推测和待核验信息。`
                    : promptTab === 'SOUL'
                      ? '以可核验的业务事实为依据，表达简洁，遇到缺失数据时主动说明，不虚构订单、销量或投放结果。'
                      : promptTab === 'AGENTS'
                        ? `确认输入与店铺范围 → 读取${roles[activeAgent.role].skill}所需的来源 → 分析并列明证据 → 输出建议与下一步 → 涉及实际业务变更时等待审批。`
                        : `优先使用 ${roles[activeAgent.role].tool} 读取当前工作区的数据。工具说明不能替代服务端权限校验。来源不可用时说明失败，不假装已成功执行。`}
                </p>
              </div>
              <div className="hm-info-strip">
                <ShieldCheck size={14} />
                <p>身份与能力变更后 通过版本和身份哈希识别旧会话失配</p>
              </div>
              <button
                className="hm-button hm-button-primary"
                onClick={() => openTask(activeAgent.role)}
              >
                <Play size={14} />
                回放岗位任务
              </button>
            </div>
          )}

          {renderedModal === 'workspace' && (
            <div className="hm-workspace-detail">
              <div className="hm-config-summary">
                <span
                  className="hm-store-avatar"
                  style={{ background: activeStore.color }}
                >
                  {activeStore.initials}
                </span>
                <div>
                  <h3>
                    {activeStore.name} · {roles[activeAgent.role].short}
                  </h3>
                  <p>
                    {activeStore.platform} · {activeStore.region} ·{' '}
                    {activeStore.category}
                  </p>
                </div>
                <Pill tone="green">就绪</Pill>
              </div>
              <div className="hm-detail-grid">
                <div>
                  <small>所属 AgentProfile</small>
                  <strong>{activeAgent.name}</strong>
                </div>
                <div>
                  <small>模型配置</small>
                  <strong>{activeAgent.model}</strong>
                </div>
                <div>
                  <small>文件与记忆</small>
                  <strong>工作区独立 不跨区复制</strong>
                </div>
                <div>
                  <small>会话范围</small>
                  <strong>独立运行上下文</strong>
                </div>
              </div>
              <div className="hm-workspace-files">
                <strong>
                  <FileText size={14} />
                  工作区来源示例
                </strong>
                {[
                  'store-policy.md',
                  'product-catalog.csv',
                  'campaign-report.csv',
                ].map((file) => (
                  <div key={file}>
                    <FileText size={14} />
                    <span>{file}</span>
                    <Pill>示例文件</Pill>
                  </div>
                ))}
              </div>
              <div className="hm-session-contract">
                <span className="hm-eyebrow">RUNTIME SESSION</span>
                <code>
                  demo/{activeStore.id}/{activeAgent.id}
                </code>
                <small>Profile ID + Version + Identity Hash</small>
                <p>身份失配时使旧会话失效 避免在过期角色或策略下继续执行</p>
              </div>
              <button
                className="hm-button hm-button-secondary"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(`demo/${activeStore.id}/${activeAgent.id}`)
                    .then(() => notify('已复制示例工作区标识'))
                    .catch(() => notify('浏览器未允许复制'));
                }}
              >
                <Copy size={13} />
                复制工作区标识
              </button>
            </div>
          )}

          {renderedModal === 'guide' && (
            <div className="hm-guide">
              {[
                {
                  n: '01',
                  title: '从岗位出发',
                  detail:
                    '打开数字员工 查看四段 Prompt 与能力边界 回放一个业务任务',
                  target: 'agents',
                },
                {
                  n: '02',
                  title: '展示店铺隔离',
                  detail: '切换店铺 查看同一岗位下不同工作区的文件与会话归属',
                  target: 'workspaces',
                },
                {
                  n: '03',
                  title: '解释模型选择',
                  detail: '浏览七维示例矩阵 按岗位筛选用例 导出评测样例',
                  target: 'benchmark',
                },
                {
                  n: '04',
                  title: '演示异常恢复',
                  detail: '注入前端模拟故障 观察健康隔离、备用选择与恢复边界',
                  target: 'runtime',
                },
              ].map((item) => (
                <button
                  key={item.n}
                  onClick={() => {
                    setModal(null);
                    go(item.target as Section);
                  }}
                >
                  <span>{item.n}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <ArrowUpRight size={16} />
                </button>
              ))}
              <div className="hm-form-hint">
                <CircleHelp size={16} />
                这是基于现有平台的前端场景演示 不是历史交付或真实评测证明
              </div>
              <Link to="/chat" className="hm-button hm-button-secondary">
                进入需要登录的真实工作台 <ExternalLink size={13} />
              </Link>
            </div>
          )}

          {renderedModal === 'notifications' && (
            <div className="hm-notices">
              {[
                {
                  icon: CheckCircle2,
                  title: '数字员工配置已准备',
                  detail: '可浏览岗位、店铺工作区与示例上下文',
                },
                {
                  icon: FlaskConical,
                  title: '业务评测样例可供展示',
                  detail: '9 个样例用例与预置评分矩阵 不代表实测结果',
                },
                {
                  icon: Activity,
                  title: '故障切换支持重复回放',
                  detail: '不会修改真实 Provider 配置或调用模型服务',
                },
              ].map((item) => (
                <div key={item.title}>
                  <item.icon size={19} />
                  <span>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                    <small>演示通知</small>
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <div className="hm-toast" role="status" data-visible={toastVisible}>
        <CheckCircle2 size={16} />
        <span>{toast}</span>
        <button onClick={() => setToastVisible(false)} aria-label="关闭提示">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="hm-empty">
      <Search size={24} strokeWidth={1.3} />
      <p>{text}</p>
    </div>
  );
}
