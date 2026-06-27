"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Bell,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Clock,
  CreditCard,
  Database,
  Eye,
  LifeBuoy,
  ListTodo,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  Moon,
  Paperclip,
  Plug,
  Plus,
  Rocket,
  Search,
  Send,
  Settings,
  Share2,
  Sun,
  X,
  User,
  UsersRound
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type View = "office" | "tasks" | "activity" | "my-teams" | "shared" | "settings" | "support";
type TaskStatus = "Queued" | "Working" | "Done";
type SettingsTab = "profile" | "general" | "billing" | "notifications" | "memory" | "connected" | "writing" | "completion" | "developer";
type TeamTab = "ready" | "mine" | "shared";
type ThemeMode = "light" | "dark" | "auto";

interface UserData {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  google_connected: boolean;
}

interface IntegrationsData {
  telegram_bot: {
    connected: boolean;
    target_chat_id: string | null;
    bot_username: string | null;
    updated_at: string | null;
  };
}

interface TaskItem {
  id: number;
  title: string;
  owner: string;
  status: TaskStatus;
}

interface AgentData {
  name: string;
  role: string;
  avatar?: string;
  accent: string;
}

interface WorkflowData {
  agent: string;
  text: string;
  path: string;
}

interface TeamCardData {
  id: string;
  name: string;
  category: string;
  agents: string;
  agentsCount: number;
  copy: string;
  modalCopy: string;
  output: string;
  tags: string[];
  icon: LucideIcon;
  roster: AgentData[];
  workflow: string[];
  modalWorkflow: WorkflowData[];
}

const people = [
  { name: "Sofia", role: "Client ops", image: "/images/member-woman.png" },
  { name: "Leo", role: "Research", image: "/images/member-man.png" },
  { name: "Mira", role: "Automation", image: "/images/coordinator.png" }
];

const businessAgents: AgentData[] = [
  { name: "Adam", role: "Стратег", avatar: "/images/member-man.png", accent: "#635BFF" },
  { name: "Mira", role: "Идеи и рост", avatar: "/images/member-woman.png", accent: "#16A3A3" },
  { name: "Leo", role: "Продажи", avatar: "/images/member-man.png", accent: "#2563EB" },
  { name: "Nora", role: "CRM", accent: "#8B5CF6" },
  { name: "Kai", role: "Аналитика", accent: "#0EA5E9" }
];

const businessWorkflow = [
  "Coordinator быстро собирает контекст и фиксирует цель",
  "Adam собирает стратегию, позиционирование и план действий",
  "Mira предлагает идеи для роста, маркетинга и продукта",
  "Nora выстраивает CRM-воронку и правила follow-up",
  "Leo готовит офферы, скрипты и первые сообщения",
  "Kai смотрит метрики и собирает понятный KPI-отчёт",
  "Coordinator упаковывает всё в финальный бизнес-план"
];

const businessModalWorkflow: WorkflowData[] = [
  { agent: "Coordinator", text: "Собирает короткий бриф, уточняет клиента и задачу, чтобы команда не работала вслепую.", path: "workspace/business-ai/brief.md" },
  { agent: "Adam", text: "Формирует позиционирование, варианты стратегии и приоритеты на ближайшие шаги.", path: "workspace/business-ai/strategy.md" },
  { agent: "Mira", text: "Придумывает идеи для роста, контента, продукта и маркетинговых экспериментов.", path: "workspace/business-ai/ideas.md" },
  { agent: "Nora", text: "Собирает CRM-этапы, поля лидов, follow-up и простую автоматизацию.", path: "workspace/business-ai/crm-pipeline.md" },
  { agent: "Leo", text: "Готовит офферы, скрипты продаж, ответы на возражения и outreach-сообщения.", path: "workspace/business-ai/sales-scripts.md" },
  { agent: "Kai", text: "Проверяет KPI, конверсии и сигналы, которые стоит вынести в отчёт.", path: "workspace/business-ai/kpi-dashboard.md" },
  { agent: "Coordinator", text: "Собирает финальный отчёт: что делать дальше, кто отвечает и где результат.", path: "workspace/business-ai/final-report.md" }
];

const readyTeams: TeamCardData[] = [
  {
    id: "business-ai-team",
    name: "Business AI Team",
    category: "Business",
    agents: "5 agents",
    agentsCount: 5,
    copy: "Команда для стратегии, роста, CRM, продаж и аналитики, когда нужен понятный бизнес-план без лишнего шума.",
    modalCopy: "Business AI Team помогает основателям и малым командам быстро собрать стратегию, идеи роста, CRM-процессы, продажи и отчёты по метрикам.",
    output: "Стратегия + CRM-воронка + скрипты продаж + KPI-дашборд",
    tags: ["Business", "Strategy", "CRM"],
    icon: BriefcaseBusiness,
    roster: businessAgents,
    workflow: businessWorkflow,
    modalWorkflow: businessModalWorkflow
  },
  {
    id: "founders-cos",
    name: "Founder's COS",
    category: "Operations",
    agents: "1 agent",
    agentsCount: 1,
    copy: "Личный операционный помощник для фаундера: приоритеты недели, застрявшие решения и короткие апдейты для инвесторов.",
    modalCopy: "Founder's COS держит ритм основателя: собирает приоритеты, напоминает о решениях, готовит investor update и короткий недельный отчёт.",
    output: "Карточки на approve + weekly brief + inbox-log",
    tags: ["Founder", "Operations", "Digest"],
    icon: Rocket,
    roster: [{ name: "Reese", role: "Operations Manager", avatar: "/images/member-man.png", accent: "#F43F5E" }],
    workflow: [
      "Coordinator собирает короткий intake и вытаскивает важные решения",
      "Reese проверяет KPI, runway и конфликты по приоритетам",
      "Coordinator пишет недельный executive brief",
      "Coordinator готовит карточки, которые можно быстро approve"
    ],
    modalWorkflow: [
      { agent: "Coordinator", text: "Быстро собирает контекст недели: решения, дедлайны и конфликты в календаре.", path: "workspace/founder-cos/brief.md" },
      { agent: "Reese", text: "Подтягивает KPI, runway, изменения в расписании и риски по приоритетам.", path: "workspace/founder-cos/data.md" },
      { agent: "Coordinator", text: "Готовит executive brief и короткие notes по решениям.", path: "briefs/week-report.md" },
      { agent: "Coordinator", text: "Собирает approval-карточки и follow-up, готовые к отправке.", path: "briefs/inbox-log.md" }
    ]
  },
  {
    id: "marketing-team",
    name: "Marketing Team",
    category: "Growth",
    agents: "4 agents",
    agentsCount: 4,
    copy: "Маркетинг-команда для фаундера: контент-план, черновики в голосе бренда и очередь упоминаний без хаоса.",
    modalCopy: "Marketing Team превращает контекст продукта в календарь контента, идеи кампаний, готовые посты и ответы на упоминания.",
    output: "Контент-план + готовые черновики + журнал ответов",
    tags: ["Marketing", "Instagram", "Content"],
    icon: BriefcaseBusiness,
    roster: [
      { name: "Mika", role: "Контент", avatar: "/images/member-woman.png", accent: "#EC4899" },
      { name: "Marcus", role: "Копирайтинг", accent: "#F59E0B" },
      { name: "Scout", role: "Соцсети", avatar: "/images/member-man.png", accent: "#0EA5E9" },
      { name: "Hayden", role: "Комьюнити", accent: "#10B981" }
    ],
    workflow: [
      "Mika собирает контент-план на неделю",
      "Marcus пишет тексты и короткие visual briefs",
      "Scout смотрит реакции, охваты и полезные сигналы",
      "Hayden готовит ответы на упоминания и комментарии"
    ],
    modalWorkflow: [
      { agent: "Mika", text: "Собирает недельный календарь и brief для каждого поста на основе бренда.", path: "workspace/marketing/calendar.md" },
      { agent: "Marcus", text: "Пишет hooks, captions, тексты для каналов и направление для визуалов.", path: "workspace/marketing/copy.md" },
      { agent: "Scout", text: "Отмечает метрики вовлечения, удачные темы и аномалии в реакциях.", path: "workspace/marketing/signals.md" },
      { agent: "Hayden", text: "Готовит ответы на упоминания и поднимает спорные сообщения на review.", path: "workspace/marketing/replies.md" }
    ]
  },
  {
    id: "sales-team",
    name: "Sales Team",
    category: "Sales",
    agents: "4 agents",
    agentsCount: 4,
    copy: "Команда для inbound-продаж: быстро отвечает лидам, квалифицирует спрос и держит CRM в порядке.",
    modalCopy: "Sales Team помогает не терять горячих лидов: готовит первые ответы, квалифицирует запросы, собирает офферы и обновляет pipeline.",
    output: "Список квалифицированных лидов + reply drafts + CRM notes",
    tags: ["Sales", "Leads", "CRM"],
    icon: UsersRound,
    roster: [
      { name: "Leo", role: "Продажи", avatar: "/images/member-man.png", accent: "#2563EB" },
      { name: "Nora", role: "CRM", accent: "#8B5CF6" },
      { name: "Adam", role: "Офферы", avatar: "/images/member-man.png", accent: "#635BFF" }
    ],
    workflow: [
      "Leo оценивает новых лидов и сигналы покупки",
      "Nora обновляет CRM-этапы и follow-up",
      "Adam собирает оффер и аргументы для сделки"
    ],
    modalWorkflow: [
      { agent: "Leo", text: "Оценивает входящих лидов и пишет первый персональный ответ.", path: "workspace/sales/replies.md" },
      { agent: "Nora", text: "Обновляет этап сделки, follow-up дату и поля квалификации.", path: "workspace/sales/crm.md" },
      { agent: "Adam", text: "Готовит оффер, аргументы и ответы на частые возражения.", path: "workspace/sales/offers.md" }
    ]
  },
  {
    id: "support-team",
    name: "Support Team",
    category: "Support",
    agents: "5 agents",
    agentsCount: 5,
    copy: "Support-команда, которая разбирает тикеты, пишет понятные ответы и находит повторяющиеся проблемы.",
    modalCopy: "Support Team сортирует обращения, готовит человеческие ответы и превращает повторяющиеся баги в понятный issue report.",
    output: "Ответы по тикетам + issue report + список частых проблем",
    tags: ["Support", "Tickets", "QA"],
    icon: LifeBuoy,
    roster: [
      { name: "Sofia", role: "Клиенты", avatar: "/images/member-woman.png", accent: "#EC4899" },
      { name: "Kai", role: "Отчёты", accent: "#0EA5E9" },
      { name: "Mira", role: "Ответы", avatar: "/images/member-woman.png", accent: "#16A3A3" }
    ],
    workflow: [
      "Sofia сортирует обращения по срочности",
      "Mira пишет ответы из контекста продукта",
      "Kai собирает повторяющиеся проблемы в отчёт"
    ],
    modalWorkflow: [
      { agent: "Sofia", text: "Разбирает новые обращения по срочности, типу клиента и теме.", path: "workspace/support/queue.md" },
      { agent: "Mira", text: "Пишет ответы на основе сохранённого контекста и product notes.", path: "workspace/support/replies.md" },
      { agent: "Kai", text: "Собирает повторяющиеся проблемы и недельные тренды по тикетам.", path: "workspace/support/report.md" }
    ]
  }
];

const myTeams: TeamCardData[] = [
  {
    id: "my-business-ai",
    name: "Business AI",
    category: "Business",
    agents: "4 agents",
    agentsCount: 4,
    copy: "Рабочая команда для Instagram DM, Telegram follow-up, контента и ежедневных сводок.",
    modalCopy: "Business AI держит вместе ответы клиентам, follow-up, контентные задачи и ежедневный отчёт по активности.",
    output: "Ежедневная сводка + очередь approved-ответов",
    tags: ["Instagram", "Telegram", "Daily digest"],
    icon: BriefcaseBusiness,
    roster: businessAgents.slice(0, 4),
    workflow: [
      "Sofia проверяет DM-очередь и готовит ответы",
      "Leo пишет follow-up для Telegram",
      "Mira собирает ежедневную сводку"
    ],
    modalWorkflow: [
      { agent: "Sofia", text: "Проверяет DM-очередь и готовит ответы, которые можно быстро approve.", path: "workspace/business-ai/dm-queue.md" },
      { agent: "Leo", text: "Пишет Telegram follow-up с нормальным тоном и понятным next step.", path: "workspace/business-ai/telegram.md" },
      { agent: "Mira", text: "Собирает дневную сводку: что произошло, что ждёт решения и что готово.", path: "workspace/business-ai/summary.md" }
    ]
  }
];

const sharedTeams: TeamCardData[] = [
  {
    id: "launch-room",
    name: "Launch Room",
    category: "Shared",
    agents: "3 agents",
    agentsCount: 3,
    copy: "Общая launch-комната для ревью контента, задач запуска и коротких activity updates.",
    modalCopy: "Launch Room помогает держать запуск в одном месте: ревью, открытые задачи, владельцы и сводки активности.",
    output: "Launch activity report + список открытых действий",
    tags: ["Shared", "Launch", "Review"],
    icon: Share2,
    roster: businessAgents.slice(0, 3),
    workflow: [
      "Sofia проверяет launch-запросы и approvals",
      "Leo ведёт открытые action items"
    ],
    modalWorkflow: [
      { agent: "Sofia", text: "Проверяет launch-запросы и отправляет нужные approval на ревью.", path: "workspace/launch/review.md" },
      { agent: "Leo", text: "Следит за открытыми задачами, владельцами и сроками.", path: "workspace/launch/actions.md" }
    ]
  }
];

const initialTasks: TaskItem[] = [
  { id: 1, title: "Review Instagram DM queue", owner: "Sofia", status: "Working" },
  { id: 2, title: "Prepare Telegram follow-up copy", owner: "Leo", status: "Queued" },
  { id: 3, title: "Create daily activity summary", owner: "Mira", status: "Done" }
];

const taskTemplates = [
  "Review Instagram DM queue",
  "Prepare Telegram follow-up copy",
  "Create daily activity summary",
  "Draft weekly content plan",
  "Check support requests",
  "Update sales lead notes"
];

const activityItems = [
  { who: "Sofia", text: "Drafted 8 customer replies", time: "09:20" },
  { who: "Leo", text: "Added competitor notes to shared context", time: "09:05" },
  { who: "Mira", text: "Moved daily summary to review", time: "08:42" },
  { who: "System", text: "Business AI office is online", time: "08:30" }
];

function applyThemeMode(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  localStorage.setItem("rebly-theme", mode);
}

export default function DashboardPage() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<View>("office");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [teamTab, setTeamTab] = useState<TeamTab>("ready");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamCategory, setTeamCategory] = useState("All");
  const [expandedTeam, setExpandedTeam] = useState("");
  const [detailTeam, setDetailTeam] = useState<TeamCardData | null>(null);
  const [tasks, setTasks] = useState(initialTasks);
  const [supportCategory, setSupportCategory] = useState("Bug");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [supportStatus, setSupportStatus] = useState("");
  const [emailDigest, setEmailDigest] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramBotTarget, setTelegramBotTarget] = useState("");
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramBotConnected, setTelegramBotConnected] = useState(false);
  const [telegramBotStatus, setTelegramBotStatus] = useState("");

  useEffect(() => {
    const storedTheme = localStorage.getItem("rebly-theme");
    const nextTheme: ThemeMode = storedTheme === "dark" || storedTheme === "auto" ? storedTheme : "light";
    setThemeMode(nextTheme);
    applyThemeMode(nextTheme);

    fetch(`${API_URL}/api/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          window.location.href = "/auth?mode=login";
          return null;
        }
        return response.json();
      })
      .then((payload) => {
        if (payload?.user) {
          setUser(payload.user);
          loadIntegrations();
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (themeMode !== "auto") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyThemeMode("auto");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [themeMode]);

  const filteredTeams = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();
    const source = teamTab === "ready" ? readyTeams : teamTab === "mine" ? myTeams : sharedTeams;
    return source.filter((team) => {
      const matchesQuery = !query || `${team.name} ${team.copy} ${team.tags.join(" ")}`.toLowerCase().includes(query);
      const matchesCategory = teamCategory === "All" || team.tags.includes(teamCategory);
      return matchesQuery && matchesCategory;
    });
  }, [teamCategory, teamSearch, teamTab]);

  async function logout() {
    await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
    window.location.href = "/";
  }

  function cycleTaskStatus(id: number) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== id) return task;
        const nextStatus: TaskStatus = task.status === "Queued" ? "Working" : task.status === "Working" ? "Done" : "Queued";
        return { ...task, status: nextStatus };
      })
    );
  }

  function submitSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supportSubject.trim() || !supportMessage.trim()) return;
    setSupportStatus("Support request queued. We will reply to your account email.");
    setSupportSubject("");
    setSupportMessage("");
    setAttachmentName("");
  }

  function openTeams(tab: TeamTab = "ready") {
    setTeamTab(tab);
    setExpandedTeam("");
    setActiveView("my-teams");
  }

  function changeTheme(mode: ThemeMode) {
    setThemeMode(mode);
    applyThemeMode(mode);
  }

  async function loadIntegrations() {
    try {
      const response = await fetch(`${API_URL}/api/integrations`, { credentials: "include" });
      if (!response.ok) return;
      const payload: IntegrationsData = await response.json();
      setTelegramBotConnected(Boolean(payload.telegram_bot.connected));
      setTelegramBotTarget(payload.telegram_bot.target_chat_id || "");
      setTelegramBotStatus(
        payload.telegram_bot.connected
          ? `Connected${payload.telegram_bot.bot_username ? ` as @${payload.telegram_bot.bot_username}` : ""}`
          : ""
      );
    } catch {
      setTelegramBotStatus("Could not load Telegram status");
    }
  }

  async function connectTelegram(kind: "account" | "bot") {
    if (kind === "account" && telegramToken.trim().length > 8) {
      setTelegramConnected(true);
      setTelegramToken("");
    }
    if (kind === "bot" && telegramBotToken.trim().length > 8 && telegramBotTarget.trim()) {
      setTelegramBotStatus("Connecting...");
      try {
        const response = await fetch(`${API_URL}/api/integrations/telegram-bot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            bot_token: telegramBotToken.trim(),
            target_chat_id: telegramBotTarget.trim(),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.detail || "Telegram connection failed");
        }
        setTelegramBotConnected(true);
        setTelegramBotToken("");
        await loadIntegrations();
      } catch (error) {
        setTelegramBotStatus(error instanceof Error ? error.message : "Telegram connection failed");
      }
    }
  }

  if (loading) {
    return (
      <main className="dashboard">
        <div className="dash-main loading-state">
          <Loader2 size={24} /> Loading workspace...
        </div>
      </main>
    );
  }

  const navItems = [
    { id: "office" as View, label: "Office", icon: BriefcaseBusiness },
    { id: "tasks" as View, label: "Tasks", icon: ListTodo },
    { id: "activity" as View, label: "Activity", icon: Activity },
    { id: "my-teams" as View, label: "My teams", icon: UsersRound },
    { id: "shared" as View, label: "Shared with me", icon: Share2 }
  ];

  const bottomItems = [
    { id: "settings" as View, label: "Settings", icon: Settings },
    { id: "support" as View, label: "Support", icon: LifeBuoy }
  ];

  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Rebly user";

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <Link className="dash-brand" href="/">
          <span className="dash-logo">
            <Bot size={18} />
          </span>
          <span>Rebly AI</span>
        </Link>

        <button className="button new-team" type="button" onClick={() => openTeams("ready")}>
          <span>
            <Plus size={15} /> New team
          </span>
          <ChevronDown size={15} />
        </button>

        <nav className="side-nav" aria-label="Workspace">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`side-link ${
                  (item.id === "shared" && activeView === "my-teams" && teamTab === "shared") ||
                  (item.id === "my-teams" && activeView === "my-teams" && teamTab !== "shared") ||
                  (activeView === item.id && item.id !== "my-teams" && item.id !== "shared")
                    ? "active"
                    : ""
                }`}
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "my-teams") {
                    openTeams("ready");
                    return;
                  }
                  if (item.id === "shared") {
                    openTeams("shared");
                    return;
                  }
                  setActiveView(item.id);
                }}
              >
                <Icon size={19} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="people-strip" aria-label="Office people">
          {people.map((person) => (
            <button className="person-chip" key={person.name} type="button" onClick={() => setActiveView("office")}>
              <Image src={person.image} width={608} height={608} alt={person.name} />
              <span>
                <strong>{person.name}</strong>
                <small>{person.role}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          {bottomItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`side-link ${activeView === item.id ? "active" : ""}`}
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
              >
                <Icon size={19} />
                {item.label}
              </button>
            );
          })}
        </div>
      </aside>

      <section className={`dash-main ${activeView === "office" ? "dash-main-office" : ""}`}>
        {activeView !== "office" && (
          <div className="dash-top-account">
            <button className="account-button top-account-button" type="button" onClick={logout}>
              <span className="brand-mark">{displayName.slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{displayName}</strong>
                <small>Owner · No plan</small>
              </span>
              <LogOut size={16} />
            </button>
          </div>
        )}

        {activeView === "office" && (
          <section className="office-view" aria-label="Agent Office">
            <iframe className="office-full-frame" src="/office/index.html" title="Business AI office" />
          </section>
        )}

        {activeView === "tasks" && (
          <section className="dashboard-view">
            <div className="view-head">
              <div>
                <p className="eyebrow">Queue</p>
                <h1>Tasks</h1>
              </div>
              <button
                className="button solid"
                type="button"
                onClick={() =>
                  setTasks((current) => {
                    const nextIndex = current.length;
                    const owner = people[nextIndex % people.length].name;
                    const title = taskTemplates[nextIndex % taskTemplates.length];
                    return [
                      ...current,
                      {
                        id: Date.now(),
                        title,
                        owner,
                        status: "Queued"
                      }
                    ];
                  })
                }
              >
                <Plus size={16} /> Add task
              </button>
            </div>
            <div className="task-board">
              {tasks.map((task) => (
                <article className="task-row" key={task.id}>
                  <span className={`status-badge ${task.status.toLowerCase()}`}>{task.status}</span>
                  <div>
                    <strong>{task.title}</strong>
                    <small>{task.owner}</small>
                  </div>
                  <button className="button" type="button" onClick={() => cycleTaskStatus(task.id)}>
                    <Check size={15} /> Move
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeView === "activity" && (
          <section className="dashboard-view">
            <div className="view-head">
              <div>
                <p className="eyebrow">Live log</p>
                <h1>Activity</h1>
              </div>
              <button className="button" type="button" onClick={() => setActiveView("office")}>
                <Eye size={16} /> View office
              </button>
            </div>
            <div className="activity-list">
              {activityItems.map((item) => (
                <article className="activity-card" key={`${item.who}-${item.time}`}>
                  <span>{item.time}</span>
                  <div>
                    <strong>{item.who}</strong>
                    <p>{item.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeView === "my-teams" && (
          <section className="dashboard-view team-marketplace">
            <div className="market-pills">
              <span>
                <Check size={14} /> Assign goals
              </span>
              <span>
                <Check size={14} /> Agents coordinate
              </span>
              <span>
                <Check size={14} /> Get deliverables
              </span>
            </div>
            <nav className="market-tabs" aria-label="Team views">
              <button className={teamTab === "ready" ? "active" : ""} type="button" onClick={() => setTeamTab("ready")}>
                <Rocket size={16} /> Ready teams
              </button>
              <button className={teamTab === "mine" ? "active" : ""} type="button" onClick={() => setTeamTab("mine")}>
                <BriefcaseBusiness size={16} /> My teams
              </button>
              <button className={teamTab === "shared" ? "active" : ""} type="button" onClick={() => setTeamTab("shared")}>
                <Share2 size={16} /> Shared with me
              </button>
            </nav>
            <div className="team-tools">
              <label className="searchbox">
                <Search size={17} />
                <input value={teamSearch} onChange={(event) => setTeamSearch(event.target.value)} placeholder="Search teams..." />
              </label>
              <label className="team-category">
                <span>Category</span>
                <select value={teamCategory} onChange={(event) => setTeamCategory(event.target.value)}>
                  <option>All</option>
                  <option>Business</option>
                  <option>Strategy</option>
                  <option>CRM</option>
                  <option>Founder</option>
                  <option>Operations</option>
                  <option>Marketing</option>
                  <option>Instagram</option>
                  <option>Telegram</option>
                  <option>Sales</option>
                  <option>Leads</option>
                  <option>Support</option>
                  <option>Tickets</option>
                </select>
              </label>
            </div>

            <div className="market-grid">
              {filteredTeams.map((team) => {
                const expanded = expandedTeam === team.id;
                return (
                  <TeamCard
                    key={team.id}
                    team={team}
                    expanded={expanded}
                    onToggle={() => setExpandedTeam(expanded ? "" : team.id)}
                    onDetails={() => setDetailTeam(team)}
                  />
                );
              })}
              {teamTab === "ready" && (
                <article className="market-card help-market-card">
                  <div className="market-card-head">
                    <span className="team-symbol">
                      <LifeBuoy size={22} />
                    </span>
                    <div>
                      <h2>I&apos;m stuck</h2>
                      <small>Talk to a human</small>
                    </div>
                  </div>
                  <p>Not sure which team fits? Send a short note and a real person will help you choose the right setup.</p>
                  <button className="button solid support-cta" type="button" onClick={() => setActiveView("support")}>
                    <LifeBuoy size={16} /> Get help
                  </button>
                </article>
              )}
            </div>
          </section>
        )}

        {detailTeam && <TeamDetailsModal team={detailTeam} onClose={() => setDetailTeam(null)} />}

        {activeView === "shared" && (
          <section className="dashboard-view">
            <div className="view-head">
              <div>
                <p className="eyebrow">Collaboration</p>
                <h1>Shared with me</h1>
              </div>
            </div>
            <div className="shared-panel">
              <Share2 size={28} />
              <strong>No shared teams yet</strong>
              <p>When someone invites you to a team, it will appear here.</p>
            </div>
          </section>
        )}

        {activeView === "settings" && (
          <section className="dashboard-view settings-view">
            <div className="view-head">
              <div>
                <p className="eyebrow">Account</p>
                <h1>Settings</h1>
              </div>
            </div>
            <div className="settings-layout">
              <nav className="settings-tabs" aria-label="Settings sections">
                {[
                  { id: "profile" as SettingsTab, label: "Profile", icon: User },
                  { id: "general" as SettingsTab, label: "General", icon: Settings },
                  { id: "billing" as SettingsTab, label: "Billing", icon: CreditCard },
                  { id: "notifications" as SettingsTab, label: "Notifications", icon: Bell },
                  { id: "memory" as SettingsTab, label: "Memory", icon: Database },
                  { id: "connected" as SettingsTab, label: "Connected Apps", icon: Plug }
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      className={settingsTab === tab.id ? "active" : ""}
                      key={tab.id}
                      type="button"
                      onClick={() => setSettingsTab(tab.id)}
                    >
                      <Icon size={17} />
                      {tab.label}
                    </button>
                  );
                })}
                <div className="settings-divider" />
                <button className="settings-group" type="button">
                  <Settings size={17} />
                  Advanced
                  <ChevronDown size={15} />
                </button>
                {[
                  { id: "writing" as SettingsTab, label: "Writing style", icon: MessageCircle },
                  { id: "completion" as SettingsTab, label: "Completion checks", icon: Check },
                  { id: "developer" as SettingsTab, label: "Developer access", icon: Plug }
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      className={`settings-subtab ${settingsTab === tab.id ? "active" : ""}`}
                      key={tab.id}
                      type="button"
                      onClick={() => setSettingsTab(tab.id)}
                    >
                      <Icon size={16} />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
              <div className="settings-panel">
                {renderSettingsPanel({
                  tab: settingsTab,
                  displayName,
                  user,
                  emailDigest,
                  setEmailDigest,
                  memoryEnabled,
                  setMemoryEnabled,
                  themeMode,
                  changeTheme,
                  telegramToken,
                  setTelegramToken,
                  telegramBotToken,
                  setTelegramBotToken,
                  telegramBotTarget,
                  setTelegramBotTarget,
                  telegramConnected,
                  telegramBotConnected,
                  telegramBotStatus,
                  connectTelegram,
                  loadIntegrations
                })}
              </div>
            </div>
          </section>
        )}

        {activeView === "support" && (
          <section className="dashboard-view support-view">
            <div className="support-top">
              <div className="support-title">
                <span className="support-icon">
                  <LifeBuoy size={24} />
                </span>
                <div>
                  <h1>Support</h1>
                  <p>Describe your issue - we read every one.</p>
                </div>
              </div>
              <button className="button" type="button" onClick={() => setActiveView("my-teams")}>
                <ArrowLeft size={15} /> Back to list
              </button>
            </div>

            <button className="support-back" type="button" onClick={() => setActiveView("office")}>
              <ArrowLeft size={15} /> Back to team setup
            </button>

            <div className="support-contact-row">
              <a className="support-contact" href="mailto:support@teamly.to">
                <Mail size={20} />
                <span>
                  <small>Email</small>
                  support@teamly.to
                </span>
              </a>
              <a className="support-contact" href="https://t.me/" target="_blank" rel="noreferrer">
                <MessageCircle size={20} />
                <span>
                  <small>Telegram group</small>
                  Join Support Group
                </span>
              </a>
            </div>

            <form className="support-form" onSubmit={submitSupport}>
              <label className="support-field">
                Category
                <select value={supportCategory} onChange={(event) => setSupportCategory(event.target.value)}>
                  <option>Bug</option>
                  <option>Billing</option>
                  <option>Account</option>
                  <option>Feature request</option>
                </select>
              </label>
              <label className="support-field">
                Subject
                <input
                  maxLength={200}
                  value={supportSubject}
                  onChange={(event) => setSupportSubject(event.target.value)}
                  placeholder="Short summary of the issue"
                />
                <small>{supportSubject.length}/200</small>
              </label>
              <label className="support-field">
                Message
                <textarea
                  maxLength={5000}
                  value={supportMessage}
                  onChange={(event) => setSupportMessage(event.target.value)}
                  placeholder="What happened? Steps to reproduce, what you expected, anything else helpful."
                />
                <small>{supportMessage.length}/5000</small>
              </label>
              <div className="support-actions">
                <label className="button attach-button">
                  <Paperclip size={16} /> Attach
                  <input
                    type="file"
                    onChange={(event) => setAttachmentName(event.target.files?.[0]?.name || "")}
                  />
                </label>
                <button className="button solid" type="submit" disabled={!supportSubject.trim() || !supportMessage.trim()}>
                  <Send size={16} /> Send
                </button>
              </div>
              {attachmentName && <p className="support-note">Attached: {attachmentName}</p>}
              {supportStatus && <p className="support-success">{supportStatus}</p>}
            </form>
          </section>
        )}
      </section>
    </main>
  );
}

function TeamCard({
  team,
  expanded,
  onToggle,
  onDetails
}: {
  team: TeamCardData;
  expanded: boolean;
  onToggle: () => void;
  onDetails: () => void;
}) {
  const TeamIcon = team.icon;

  return (
    <article
      className={`market-card premium-team-card ${expanded ? "expanded" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      <div className="market-card-head">
        <span className="team-symbol">
          <TeamIcon size={22} />
        </span>
        <div>
          <h2>{team.name}</h2>
          <small>{team.agents}</small>
        </div>
        <button
          className="expand-team"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          aria-label={expanded ? `Collapse ${team.name}` : `Expand ${team.name}`}
        >
          <ChevronDown size={18} />
        </button>
      </div>

      <div className="market-roster" aria-label={`${team.name} agents`}>
        {team.roster.map((agent) => (
          <AgentMiniCard agent={agent} key={agent.name} />
        ))}
      </div>

      {expanded && (
        <div className="team-expanded-content" onClick={(event) => event.stopPropagation()}>
          <p className="team-description">{team.copy}</p>
          <div className="workflow-panel">
            <h3>Как работает</h3>
            <div className="workflow-list">
              {team.workflow.map((step, index) => (
                <WorkflowStep index={index} text={step} key={step} />
              ))}
            </div>
            <div className="output-box">
              <strong>Результат</strong>
              <span>{team.output}</span>
            </div>
          </div>

          <div className="team-card-actions">
            <button className="button detail-button" type="button" onClick={onDetails}>
              <Eye size={16} /> Подробнее
            </button>
            <Link className="button solid team-hire" href="/office/index.html">
              <Rocket size={16} /> Нанять
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}

function AgentMiniCard({ agent }: { agent: AgentData }) {
  return (
    <span className="agent-mini-card" style={{ borderColor: `${agent.accent}24` }}>
      {agent.avatar ? (
        <Image src={agent.avatar} width={608} height={608} alt="" />
      ) : (
        <span className="agent-initials" style={{ color: agent.accent, background: `${agent.accent}12` }}>
          {agent.name.slice(0, 1)}
        </span>
      )}
      <strong>{agent.name}</strong>
    </span>
  );
}

function WorkflowStep({ index, text }: { index: number; text: string }) {
  return (
    <div className="workflow-step">
      <span>{index + 1}</span>
      <p>{text}</p>
    </div>
  );
}

function TeamDetailsModal({ team, onClose }: { team: TeamCardData; onClose: () => void }) {
  const TeamIcon = team.icon;

  return (
    <div className="team-detail-overlay" role="dialog" aria-modal="true" aria-label={`${team.name} details`} onClick={onClose}>
      <section className="team-detail-modal" onClick={(event) => event.stopPropagation()}>
        <header className="detail-head">
          <span className="team-symbol detail-symbol">
            <TeamIcon size={28} />
          </span>
          <div>
            <h2>{team.name}</h2>
            <p>
              <span>{team.category}</span>
              <UsersRound size={14} /> {team.agents}
            </p>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </header>

        <div className="detail-modal-body">
          <p className="detail-copy">{team.modalCopy}</p>

          <div className="detail-section">
            <h3>Участники</h3>
            <div className="detail-members">
              {team.roster.map((agent) => (
                <span className="detail-member" key={agent.name} style={{ borderColor: `${agent.accent}24` }}>
                  {agent.avatar ? (
                    <Image src={agent.avatar} width={608} height={608} alt="" />
                  ) : (
                    <span className="agent-initials" style={{ color: agent.accent, background: `${agent.accent}12` }}>
                      {agent.name.slice(0, 1)}
                    </span>
                  )}
                  <strong>{agent.name}</strong>
                  <small>{agent.role}</small>
                </span>
              ))}
            </div>
          </div>

          <div className="detail-section">
            <h3>Как работает</h3>
            <div className="detail-flow">
              {team.modalWorkflow.map((step, index) => (
                <article key={`${step.agent}-${step.path}`}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.agent}</strong>
                    <p>{step.text}</p>
                    <small>-&gt; {step.path}</small>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <footer className="detail-footer">
          <Link className="button solid detail-hire" href="/office/index.html">
            <Rocket size={16} /> Нанять эту команду
          </Link>
        </footer>
      </section>
    </div>
  );
}

function renderSettingsPanel({
  tab,
  displayName,
  user,
  emailDigest,
  setEmailDigest,
  memoryEnabled,
  setMemoryEnabled,
  themeMode,
  changeTheme,
  telegramToken,
  setTelegramToken,
  telegramBotToken,
  setTelegramBotToken,
  telegramBotTarget,
  setTelegramBotTarget,
  telegramConnected,
  telegramBotConnected,
  telegramBotStatus,
  connectTelegram,
  loadIntegrations
}: {
  tab: SettingsTab;
  displayName: string;
  user: UserData | null;
  emailDigest: boolean;
  setEmailDigest: (value: boolean) => void;
  memoryEnabled: boolean;
  setMemoryEnabled: (value: boolean) => void;
  themeMode: ThemeMode;
  changeTheme: (mode: ThemeMode) => void;
  telegramToken: string;
  setTelegramToken: (value: string) => void;
  telegramBotToken: string;
  setTelegramBotToken: (value: string) => void;
  telegramBotTarget: string;
  setTelegramBotTarget: (value: string) => void;
  telegramConnected: boolean;
  telegramBotConnected: boolean;
  telegramBotStatus: string;
  connectTelegram: (kind: "account" | "bot") => void;
  loadIntegrations: () => void | Promise<void>;
}) {
  if (tab === "profile") {
    return (
      <div className="settings-page">
        <div className="settings-page-head">
          <h1>Profile</h1>
          <p>Account details and business context</p>
        </div>
        <section className="settings-hero-card">
          <span className="settings-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
          <div>
            <h2>{displayName}</h2>
            <p>Owner · Team Lead</p>
            <span className="active-badge">Active</span>
          </div>
        </section>
        <section className="settings-block about-block">
          <div className="settings-block-head">
            <Image src="/images/member-man.png" width={608} height={608} alt="" />
            <div>
              <h2>About you</h2>
              <p>Help your agents understand your business</p>
            </div>
            <button className="button" type="button">
              <Paperclip size={15} /> Edit
            </button>
          </div>
          {["Your role", "What does your company do?", "Website", "Goals & challenges"].map((label) => (
            <div className="settings-line" key={label}>
              <span>{label}</span>
              <strong>-</strong>
            </div>
          ))}
        </section>
        <section className="settings-block">
          <h2>Account details</h2>
          <div className="settings-line">
            <span>Email</span>
            <strong>{user?.email || "-"}</strong>
          </div>
          <div className="settings-line">
            <span>Plan</span>
            <strong>No plan</strong>
          </div>
          <div className="settings-line">
            <span>Teams</span>
            <strong>0 / 0</strong>
          </div>
          <div className="settings-line">
            <span>Role</span>
            <strong>Owner</strong>
          </div>
        </section>
      </div>
    );
  }

  if (tab === "general") {
    return (
      <div className="settings-page">
        <div className="settings-page-head">
          <h1>General</h1>
          <p>Team name, appearance, and follow-up behavior</p>
        </div>
        <section className="settings-block">
          <h2>Identity</h2>
          <p>Choose how this team appears in your workspace.</p>
          <label className="settings-field">
            Team name
            <input defaultValue="My Team" />
          </label>
        </section>
        <section className="settings-block">
          <h2>Team status</h2>
          <span className="warning-badge">Not connected</span>
        </section>
        <section className="settings-block appearance-block">
          <h2>Appearance</h2>
          <div className="theme-segment">
            <button className={themeMode === "light" ? "active" : ""} type="button" onClick={() => changeTheme("light")}>
              <Sun size={15} /> Light
            </button>
            <button className={themeMode === "dark" ? "active" : ""} type="button" onClick={() => changeTheme("dark")}>
              <Moon size={15} /> Dark
            </button>
            <button className={themeMode === "auto" ? "active" : ""} type="button" onClick={() => changeTheme("auto")}>
              <Clock size={15} /> Auto
            </button>
          </div>
          <div className="theme-caption">
            <strong>Theme</strong>
            <span>Currently {themeMode} mode</span>
          </div>
        </section>
        <section className="settings-block">
          <h2>Agent follow-up</h2>
          <label className="settings-field small-field">
            Check for new work
            <select defaultValue="30 min">
              <option>15 min</option>
              <option>30 min</option>
              <option>1 hour</option>
            </select>
          </label>
          <label className="toggle-row plain-toggle">
            <span>
              <strong>Work without prompting</strong>
              <small>Agents wait for your next message</small>
            </span>
            <input type="checkbox" />
          </label>
        </section>
      </div>
    );
  }

  if (tab === "billing") {
    return (
      <div className="settings-page">
        <div className="settings-page-head">
          <h1>Billing</h1>
          <p>Plan and payment details</p>
        </div>
        <section className="settings-block">
          <h2>Current plan</h2>
          <div className="settings-line">
            <span>Plan</span>
            <strong>No plan</strong>
          </div>
          <div className="settings-line">
            <span>Credits</span>
            <strong>$0</strong>
          </div>
          <button className="button solid" type="button">
            Manage billing
          </button>
        </section>
      </div>
    );
  }

  if (tab === "notifications") {
    return (
      <div className="settings-page">
        <div className="settings-page-head">
          <h1>Notifications</h1>
          <p>Email updates for team activity</p>
        </div>
        <section className="settings-block notification-block">
          <div>
            <h2>My team updates</h2>
            <p>Request and readiness emails for custom teams</p>
          </div>
          <label className="switch">
            <input type="checkbox" checked={emailDigest} onChange={(event) => setEmailDigest(event.target.checked)} />
            <span />
          </label>
          <strong>{emailDigest ? "Enabled" : "Disabled"}</strong>
        </section>
      </div>
    );
  }

  if (tab === "memory") {
    return (
      <div className="settings-page">
        <div className="settings-page-head">
          <h1>Memory</h1>
          <p>Reusable business context for agents</p>
        </div>
        <section className="settings-block notification-block">
          <div>
            <h2>Workspace memory</h2>
            <p>Keep useful context for future Business AI work</p>
          </div>
          <label className="switch">
            <input type="checkbox" checked={memoryEnabled} onChange={(event) => setMemoryEnabled(event.target.checked)} />
            <span />
          </label>
          <strong>{memoryEnabled ? "Enabled" : "Disabled"}</strong>
        </section>
      </div>
    );
  }

  if (tab === "connected") {
    return (
      <div className="settings-page">
        <div className="settings-page-head">
          <h1>Connected apps</h1>
          <p>Connect Telegram and other tools your agents can use</p>
        </div>
        <section className="settings-block connected-summary">
          <span>{(user?.google_connected ? 1 : 0) + (telegramConnected ? 1 : 0) + (telegramBotConnected ? 1 : 0)} of 4 connected</span>
          <button className="button" type="button" onClick={loadIntegrations}>
            <Clock size={15} /> Refresh
          </button>
        </section>
        <h3 className="settings-section-title">Communication</h3>
        <div className="connected-grid">
          <ConnectionCard name="Google" copy="Read, search, send, and draft Gmail messages." status={user?.google_connected ? "Connected" : "Ready"} />
          <ConnectionCard
            name="Telegram"
            copy="Connect a Telegram account token for direct team updates."
            token={telegramToken}
            setToken={setTelegramToken}
            connected={telegramConnected}
            onConnect={() => connectTelegram("account")}
          />
          <ConnectionCard
            name="Telegram Bot"
            copy="Paste your bot token so agents can post approved messages."
            token={telegramBotToken}
            setToken={setTelegramBotToken}
            target={telegramBotTarget}
            setTarget={setTelegramBotTarget}
            connected={telegramBotConnected}
            statusDetail={telegramBotStatus}
            onConnect={() => connectTelegram("bot")}
          />
          <ConnectionCard name="Instagram" copy="Route social replies and mentions into the team queue." status="Ready" />
        </div>
      </div>
    );
  }

  if (tab === "writing") {
    return (
      <div className="settings-page">
        <div className="settings-page-head">
          <h1>Writing style</h1>
          <p>Choose how agents format replies by default</p>
        </div>
        <section className="settings-block">
          <h2>Writing style</h2>
          <p>Choose how agents format replies by default, without changing the team setup.</p>
        </section>
        <div className="writing-grid">
          {[
            ["Default", "Use the team's normal instructions."],
            ["Terse", "Short answers without preamble."],
            ["Verbose", "Explain reasoning and tradeoffs clearly."],
            ["Formal", "Use a formal register."],
            ["Custom", "Use your own markdown instructions."]
          ].map(([name, copy], index) => (
            <button className={`writing-card ${index === 0 ? "active" : ""}`} type="button" key={name}>
              <h2>{name} {index === 0 && <Check size={16} />}</h2>
              <p>{copy}</p>
            </button>
          ))}
        </div>
        <button className="button solid save-writing" type="button">
          Save
        </button>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-page-head">
        <h1>{tab === "completion" ? "Completion checks" : "Developer access"}</h1>
        <p>{tab === "completion" ? "Review rules before work is marked done" : "API keys and technical controls"}</p>
      </div>
      <section className="settings-block">
        <h2>{tab === "completion" ? "Checks" : "Access"}</h2>
        <p>{tab === "completion" ? "Require agents to confirm output quality before closing work." : "Developer controls will appear here when enabled."}</p>
      </section>
    </div>
  );
}

function ConnectionCard({
  name,
  copy,
  status,
  token,
  setToken,
  target,
  setTarget,
  connected,
  statusDetail,
  onConnect
}: {
  name: string;
  copy: string;
  status?: string;
  token?: string;
  setToken?: (value: string) => void;
  target?: string;
  setTarget?: (value: string) => void;
  connected?: boolean;
  statusDetail?: string;
  onConnect?: () => void;
}) {
  const isTokenCard = Boolean(setToken && onConnect);
  return (
    <article className="connected-card">
      <span className="app-plug">
        <Plug size={18} />
      </span>
      <div>
        <h2>{name}</h2>
        <p>{copy}</p>
        {isTokenCard && (
          <div className="connection-fields">
            <input
              type="password"
              value={token}
              onChange={(event) => setToken?.(event.target.value)}
              placeholder={connected ? "Connected" : "Paste token"}
              disabled={connected}
            />
            {setTarget && (
              <input
                type="text"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder="@channel or chat id"
                disabled={connected}
              />
            )}
            {statusDetail && <small>{statusDetail}</small>}
          </div>
        )}
      </div>
      {isTokenCard ? (
        <button
          className="button solid connect-button"
          type="button"
          onClick={onConnect}
          disabled={connected || !token || token.length < 9 || Boolean(setTarget && !target)}
        >
          {connected ? "Connected" : "Connect"}
        </button>
      ) : (
        <strong className={status === "Connected" ? "connected-status" : ""}>{status}</strong>
      )}
    </article>
  );
}
