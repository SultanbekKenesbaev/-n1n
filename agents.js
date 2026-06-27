import { chatProfiles, redactSensitiveText } from "./agents-kaliya-core.js";

const teamChat = {
  id: "all",
  name: "Team",
  role: "Team",
  color: "#1f2933",
  state: "ready",
  mission: "Общий чат всей команды: Coordinator, Mika, Scout, Dev и Nova отвечают как единая AI-команда.",
  model: "Coordinator gpt-5.5 + agent models",
  tools: "Память, ссылки, файлы, CRM, CSV, фото/видео context",
};

const agents = [
  {
    id: "coordinator",
    name: "Coordinator",
    role: "Lead / Team Orchestrator",
    color: "#4f5bd5",
    state: "ready",
    mission: "Arman-характер: четкий операционный тимлид. Понимает задачу, задает точные вопросы, распределяет работу, проверяет отчеты агентов и собирает финальный результат.",
    model: "gpt-5.5",
    tools: "Память команды, CRM-сводка, ссылки, файлы, финальная сборка",
  },
  {
    id: "mika",
    name: "Mika",
    role: "Sales Strategist / Client Closer",
    color: "#d04f6a",
    state: "ready",
    mission: "Умный продавец-консультант: диагностирует клиента, формирует офферы, отвечает на возражения, пишет переписки и ведет к следующему шагу без давления.",
    model: "gpt-5.4",
    tools: "Sales-память, CRM, входящие лиды, ссылки, файлы",
  },
  {
    id: "scout",
    name: "Scout",
    role: "Content Strategist / Market Researcher",
    color: "#0097a7",
    state: "ready",
    mission: "Контент-стратег и исследователь: находит аудиторию, боли, рыночные углы, хуки, темы, Reels/посты/сторис и связывает контент с бизнес-целью.",
    model: "gpt-5.4",
    tools: "Content-память, ссылки, фото/видео context, рыночные материалы",
  },
  {
    id: "dev",
    name: "Dev",
    role: "Business Analyst / Growth Engineer",
    color: "#13a56f",
    state: "ready",
    mission: "Разбирает бизнес как систему: модель, процессы, воронку, юнит-экономику, метрики, риски, узкие места, гипотезы и план улучшений.",
    model: "gpt-5.5",
    tools: "Business-память, CRM, CSV/таблицы, метрики, ссылки",
  },
  {
    id: "nova",
    name: "Nova",
    role: "Support & Community Operator",
    color: "#c98908",
    state: "ready",
    mission: "Оператор коммуникаций: отвечает на комментарии, Direct/DM, отзывы, негатив, FAQ и поддержку, сохраняет спокойный тон и передает покупательское намерение Mika.",
    model: "gpt-5.4-mini",
    tools: "Support-память, CRM, входящие сообщения, FAQ, комментарии",
  },
];

const chats = [teamChat, ...agents];
const THREAD_STORAGE_VERSION = 1;
const threads = Object.fromEntries(chats.map((chat) => [chat.id, []]));

let selectedChatId = "all";
let pending = false;
let selectedFiles = [];
const accountId = getAccountId();
const sessionId = getSessionId(accountId);

const agentList = document.querySelector("#agentList");
const activeAgentName = document.querySelector("#activeAgentName");
const profileToken = document.querySelector("#profileToken");
const profileName = document.querySelector("#profileName");
const profileRole = document.querySelector("#profileRole");
const profileMission = document.querySelector("#profileMission");
const profileSystem = document.querySelector("#profileSystem");
const agentState = document.querySelector("#agentState");
const conversation = document.querySelector("#conversation");
const activityFeed = document.querySelector("#activityFeed");
const composer = document.querySelector("#composer");
const userMessage = document.querySelector("#userMessage");
const clearBtn = document.querySelector("#clearBtn");
const fileInput = document.querySelector("#fileInput");
const attachmentList = document.querySelector("#attachmentList");

function selectedChat() {
  return chats.find((chat) => chat.id === selectedChatId) || teamChat;
}

function selectedThread() {
  return threads[selectedChatId] || threads.all;
}

function validChatId(chatId) {
  return chats.some((chat) => chat.id === chatId);
}

function renderAgents() {
  agentList.innerHTML = "";
  chats.forEach((agent) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `agent-row ${agent.id === selectedChatId ? "active" : ""}`;
    row.addEventListener("click", () => {
      selectedChatId = agent.id;
      saveThreads();
      render();
    });

    const token = document.createElement("span");
    token.className = "agent-token";
    token.style.background = agent.color;
    token.textContent = agent.id === "all" ? "T" : agent.name.slice(0, 1);

    const meta = document.createElement("span");
    meta.className = "agent-meta";
    const name = document.createElement("span");
    name.className = "agent-name";
    name.textContent = agent.name;
    const role = document.createElement("span");
    role.className = "agent-role";
    role.textContent = agent.role;
    meta.append(name, role);

    const dot = document.createElement("span");
    dot.className = `state-dot ${agent.state === "working" ? "working" : ""}`;

    row.append(token, meta, dot);
    agentList.appendChild(row);
  });
}

function renderProfile() {
  const chat = selectedChat();
  activeAgentName.textContent = chat.name;
  profileToken.textContent = chat.id === "all" ? "A" : chat.name.slice(0, 1);
  profileToken.style.background = chat.color;
  profileName.textContent = chat.name;
  profileRole.textContent = chat.role;
  profileMission.textContent = chat.mission;
  profileSystem.textContent = `Модель: ${chat.model || "default"} · Инструменты: ${chat.tools || "базовый чат"}`;
  agentState.textContent = pending ? "Thinking" : "Ready";
}

function renderConversation() {
  const messages = selectedThread();
  conversation.innerHTML = "";

  if (messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = selectedChatId === "all"
      ? "Общий чат пуст. Напиши задачу для всей команды."
      : `Чат ${selectedChat().name} пуст. Напиши задачу этому агенту.`;
    conversation.appendChild(empty);
    return;
  }

  messages.forEach((message) => {
    const item = document.createElement("article");
    item.className = `message ${message.type} ${message.phase || ""}`.trim();
    if (message.audience) item.dataset.audience = message.audience;
    const author = document.createElement("strong");
    author.textContent = message.to
      ? `${message.author} → ${displayTarget(message.to)}`
      : message.author;
    if (message.phase) {
      const phase = document.createElement("span");
      phase.className = "message-phase";
      phase.textContent = phaseLabel(message.phase);
      author.appendChild(phase);
    }
    const text = document.createElement("p");
    text.textContent = message.text;
    item.append(author, text);
    conversation.appendChild(item);
  });
  conversation.scrollTop = conversation.scrollHeight;
}

function renderActivity() {
  const recent = chats
    .flatMap((chat) =>
      threads[chat.id]
        .filter((message) => message.type === "agent" || message.type === "error")
        .slice(-2)
        .map((message) => ({ chat, message })),
    )
    .slice(-8)
    .reverse();

  activityFeed.innerHTML = "";
  if (recent.length === 0) {
    const empty = document.createElement("div");
    empty.className = "activity-empty";
    empty.textContent = "Пока нет ответов.";
    activityFeed.appendChild(empty);
    return;
  }

  recent.forEach(({ chat, message }) => {
    const item = document.createElement("article");
    item.className = "activity-item";
    item.style.borderLeftColor = chat.color;
    const title = document.createElement("strong");
    title.textContent = message.author;
    const body = document.createElement("p");
    body.textContent = message.text.slice(0, 120);
    item.append(title, body);
    activityFeed.appendChild(item);
  });
}

function appendMessage(chatId, message) {
  if (!threads[chatId]) {
    threads[chatId] = [];
  }
  threads[chatId].push(message);
  saveThreads();
}

function setAgentState(chatId, state) {
  const agent = chats.find((item) => item.id === chatId);
  if (agent) agent.state = state;
}

async function sendMessage(text) {
  if (pending) return;

  const cleanText = redactSensitiveText(text || "Проанализируй вложение.");
  const chatId = selectedChatId;
  const chat = selectedChat();
  const filesForRequest = selectedFiles.slice();
  const attachmentNote = filesForRequest.length
    ? `\n\nВложения: ${filesForRequest.map((file) => file.name).join(", ")}`
    : "";
  const userEntry = { author: "Вы", type: "user", text: cleanText + attachmentNote };
  appendMessage(chatId, userEntry);

  pending = true;
  setAgentState(chatId, "working");
  appendMessage(chatId, {
    author: chat.name,
    type: "loading",
    text: "Думает...",
  });
  render();

  try {
    const result = await requestAgentReply(chatId, cleanText, threadForApi(chatId), filesForRequest);
    const messages = normalizeReplyMessages(result, chat.name);
    replaceLastLoading(chatId, messages[0]);
    messages.slice(1).forEach((message) => appendMessage(chatId, message));
    selectedFiles = [];
    fileInput.value = "";
  } catch (error) {
    const detail = error instanceof Error ? error.message : "AI backend error";
    replaceLastLoading(chatId, {
      author: "System",
      type: "error",
      text: detail,
    });
  } finally {
    pending = false;
    setAgentState(chatId, "ready");
    render();
  }
}

function normalizeReplyMessages(result, fallbackAuthor) {
  const source = Array.isArray(result.messages) && result.messages.length > 0
    ? result.messages
    : [{ author: fallbackAuthor, text: result.reply || "" }];
  return source.map((message) => ({
    author: message.author || fallbackAuthor,
    type: message.type || "agent",
    text: message.text || "",
    phase: message.phase || "",
    audience: message.audience || "",
    from: message.from || "",
    to: message.to || "",
    isFinal: Boolean(message.isFinal),
    runId: message.runId || "",
  })).filter((message) => message.text.trim());
}

function threadForApi(chatId) {
  return threads[chatId]
    .filter((message) => message.type === "user" || message.type === "agent")
    .slice(-10)
    .map((message) => ({
      role: message.type === "user" ? "user" : "assistant",
      author: message.author,
      text: message.text,
    }));
}

function replaceLastLoading(chatId, replacement) {
  const thread = threads[chatId];
  const index = thread.map((message) => message.type).lastIndexOf("loading");
  if (index >= 0) {
    thread.splice(index, 1, replacement);
    saveThreads();
    return;
  }
  thread.push(replacement);
  saveThreads();
}

async function requestAgentReply(agentId, message, history, files) {
  const payload = {
    agentId,
    message,
    history,
    sessionId,
    accountId,
    profiles: chatProfiles,
  };
  const request = files.length
    ? multipartRequest(payload, files)
    : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      };
  const response = await fetch("/api/agents/chat", request);

  let responsePayload = null;
  try {
    responsePayload = await response.json();
  } catch {
    responsePayload = {};
  }

  if (!response.ok) {
    throw new Error(responsePayload.error || `HTTP ${response.status}`);
  }
  if (!responsePayload.reply) {
    throw new Error("AI вернул пустой ответ.");
  }
  return responsePayload;
}

function multipartRequest(payload, files) {
  const body = new FormData();
  body.append("payload", JSON.stringify(payload));
  files.forEach((file) => body.append("files", file, file.name));
  return { method: "POST", body };
}

function clearChat() {
  threads[selectedChatId].splice(0);
  saveThreads();
  render();
}

function render() {
  renderAgents();
  renderProfile();
  renderConversation();
  renderActivity();
  renderAttachments();
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = userMessage.value.trim();
  if (!text && selectedFiles.length === 0) return;
  userMessage.value = "";
  sendMessage(text || "Проанализируй вложение.");
});

clearBtn.addEventListener("click", clearChat);
fileInput.addEventListener("change", () => {
  selectedFiles = Array.from(fileInput.files || []);
  renderAttachments();
});

loadThreads();
render();

window.kaliyaAgentsDebug = {
  agents,
  chats,
  threads,
  accountId,
  sessionId,
};

function randomStorageId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep the chat usable when localStorage is blocked.
  }
}

function getAccountId() {
  const key = "n1n-agent-account-id";
  const existing = safeStorageGet(key);
  if (existing) return existing;
  const next = `standalone-${randomStorageId()}`;
  safeStorageSet(key, next);
  return next;
}

function getSessionId(nextAccountId) {
  const key = `n1n-agent-session-id:${nextAccountId}`;
  const existing = safeStorageGet(key);
  if (existing) return existing;
  const next = `agents-${nextAccountId}-${randomStorageId()}`;
  safeStorageSet(key, next);
  return next;
}

function threadsStorageKey() {
  return `n1n-agent-threads-v${THREAD_STORAGE_VERSION}:${accountId}`;
}

function serializeThreads() {
  return Object.fromEntries(
    Object.entries(threads).map(([chatId, thread]) => [
      chatId,
      thread
        .filter((message) => message?.text && message.type !== "loading")
        .slice(-120),
    ]),
  );
}

function saveThreads() {
  safeStorageSet(
    threadsStorageKey(),
    JSON.stringify({
      selectedChatId,
      threads: serializeThreads(),
    }),
  );
}

function loadThreads() {
  const raw = safeStorageGet(threadsStorageKey());
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (parsed?.threads && typeof parsed.threads === "object") {
    Object.entries(parsed.threads).forEach(([chatId, thread]) => {
      if (!validChatId(chatId) || !Array.isArray(thread)) return;
      threads[chatId] = thread
        .filter((message) => message && typeof message.text === "string")
        .map((message) => ({
          author: String(message.author || "Agent"),
          type: ["user", "agent", "error"].includes(message.type) ? message.type : "agent",
          text: String(message.text || ""),
          phase: String(message.phase || ""),
          audience: String(message.audience || ""),
          from: String(message.from || ""),
          to: String(message.to || ""),
          isFinal: Boolean(message.isFinal),
          runId: String(message.runId || ""),
        }));
    });
  }
  if (validChatId(parsed?.selectedChatId)) {
    selectedChatId = parsed.selectedChatId;
  }
}

function renderAttachments() {
  attachmentList.innerHTML = "";
  selectedFiles.forEach((file, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "attachment-chip";
    chip.textContent = `${file.name} · ${formatBytes(file.size)}`;
    chip.addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      renderAttachments();
    });
    attachmentList.appendChild(chip);
  });
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function phaseLabel(phase) {
  return {
    routing: "маршрут",
    internal: "внутри",
    question: "вопрос",
    final: "финал",
    tool: "tool",
  }[phase] || phase;
}

function displayTarget(target) {
  if (target === "team") return "Team";
  const chat = chats.find((item) => item.id === target);
  return chat ? chat.name : target;
}
