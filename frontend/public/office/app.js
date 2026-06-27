import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.querySelector("#officeCanvas");
const bubbleLayer = document.querySelector("#bubbleLayer");
const rosterList = document.querySelector("#rosterList");
const activityFeed = document.querySelector("#activityFeed");
const activeCount = document.querySelector("#activeCount");
const focusName = document.querySelector("#focusName");
const queueCount = document.querySelector("#queueCount");
const clock = document.querySelector("#clock");
const teamStatus = document.querySelector("#teamStatus");
const viewBtn = document.querySelector("#viewBtn");
const chatTab = document.querySelector("#chatTab");
const activityTab = document.querySelector("#activityTab");
const chatView = document.querySelector("#chatView");
const activityView = document.querySelector("#activityView");
const chatTarget = document.querySelector("#chatTarget");
const chatMessages = document.querySelector("#chatMessages");
const chatComposer = document.querySelector("#chatComposer");
const chatInput = document.querySelector("#chatInput");
const chatSend = document.querySelector("#chatSend");

const AGENT_CHAT_API = "http://127.0.0.1:4173/api/agents/chat";
const AUTH_API =
  window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000";
const CHAT_STORAGE_VERSION = 1;

let accountKey = getGuestAccountKey();
let chatSessionId = getOrCreateChatSessionId(accountKey);
let storageReady = false;

const tasks = [
  "Competitor scan",
  "Launch brief",
  "Pricing memo",
  "Landing copy",
  "QA checklist",
  "Lead scoring",
  "Support digest",
];

const slots = [
  new THREE.Vector3(-3.55, 0, 1.25),
  new THREE.Vector3(-1.65, 0, -1.2),
  new THREE.Vector3(0.6, 0, 0.8),
  new THREE.Vector3(2.85, 0, -1.05),
  new THREE.Vector3(3.75, 0, 1.45),
];

const agents = [
  {
    name: "Coordinator",
    role: "Lead",
    kind: "robot",
    color: "#4f5bd5",
    slot: 2,
    state: "focused",
    bubble: "Routing tasks",
    active: true,
  },
  {
    name: "Mika",
    role: "Strategist",
    kind: "human",
    color: "#d04f6a",
    slot: 0,
    state: "idle",
    bubble: "Ready",
    active: true,
  },
  {
    name: "Scout",
    role: "Research",
    kind: "human",
    color: "#0097a7",
    slot: 1,
    state: "working",
    bubble: "Scanning market",
    active: true,
  },
  {
    name: "Dev",
    role: "Engineer",
    kind: "human",
    color: "#13a56f",
    slot: 3,
    state: "idle",
    bubble: "Standing by",
    active: true,
  },
  {
    name: "Nova",
    role: "Publisher",
    kind: "human",
    color: "#c98908",
    slot: 4,
    state: "idle",
    bubble: "Queue clean",
    active: true,
  },
];

let selectedChatId = "all";
let chatBusy = false;
let chatThreads = createEmptyChatThreads();

const agentStyles = [
  {
    skin: "#aab3c7",
    hair: "#626b83",
    pants: "#5a6278",
    shoes: "#34394b",
    face: "#111827",
    mouth: "#ef3f5a",
  },
  {
    skin: "#f0b889",
    hair: "#f2a15f",
    pants: "#d58352",
    shoes: "#8d6047",
    face: "#1d2433",
    mouth: "#9a4338",
  },
  {
    skin: "#a06f50",
    hair: "#202737",
    pants: "#4669c9",
    shoes: "#915c35",
    face: "#111827",
    mouth: "#6b2f31",
  },
  {
    skin: "#d59668",
    hair: "#232737",
    pants: "#16a085",
    shoes: "#6f4d35",
    face: "#172033",
    mouth: "#7f3a35",
  },
  {
    skin: "#62b37f",
    hair: "#2e3349",
    pants: "#42c6a3",
    shoes: "#7d4d2d",
    face: "#151b2b",
    mouth: "#185f49",
  },
];

let selectedIndex = 0;
let queued = 3;
const bubbles = new Map();

const scene = new THREE.Scene();
scene.background = new THREE.Color("#f4f6f8");

const camera = new THREE.OrthographicCamera(-7, 7, 4.6, -4.6, 0.1, 100);
camera.position.set(7.2, 6.4, 8.6);
camera.lookAt(0, 0.8, 0);

let renderer = null;
let controls = null;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.8, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minZoom = 0.58;
  controls.maxZoom = 1.85;
  controls.minPolarAngle = Math.PI * 0.18;
  controls.maxPolarAngle = Math.PI * 0.5;
  controls.update();
} catch (error) {
  canvas.dataset.webgl = "unavailable";
  canvas.hidden = true;
  console.warn("3D workspace disabled because WebGL is unavailable.", error);
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const ambient = new THREE.HemisphereLight("#ffffff", "#9ca3af", 2.8);
scene.add(ambient);

const sun = new THREE.DirectionalLight("#ffffff", 3.2);
sun.position.set(5, 8, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 28;
sun.shadow.camera.left = -10;
sun.shadow.camera.right = 10;
sun.shadow.camera.top = 10;
sun.shadow.camera.bottom = -10;
scene.add(sun);

const root = new THREE.Group();
scene.add(root);

const clickTargets = [];

function createCanvasTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 512;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#edf1f5";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "#d7dee9";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(79, 91, 213, 0.08)";
  ctx.fillRect(0, 192, 512, 64);
  ctx.fillStyle = "rgba(0, 151, 167, 0.08)";
  ctx.fillRect(192, 0, 64, 512);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 1.4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addOffice() {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(12.8, 0.32, 8.2),
    new THREE.MeshStandardMaterial({
      map: createCanvasTexture(),
      roughness: 0.75,
      metalness: 0.05,
    }),
  );
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  root.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({
    color: "#aeb7c6",
    roughness: 0.8,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: "#dbe4f2",
    roughness: 0.65,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: "#d8e7ff",
    transparent: true,
    opacity: 0.55,
    roughness: 0.35,
  });

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(12.8, 2.5, 0.3), wallMat);
  backWall.position.set(0, 1, -4.25);
  backWall.receiveShadow = true;
  root.add(backWall);

  const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.5, 8.2), wallMat);
  sideWall.position.set(-6.55, 1, 0);
  sideWall.receiveShadow = true;
  root.add(sideWall);

  const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.56, 8.2), trimMat);
  rightRail.position.set(6.48, 0.14, 0);
  rightRail.receiveShadow = true;
  root.add(rightRail);

  const frontRail = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.28, 0.22), trimMat);
  frontRail.position.set(0, 0.02, 4.04);
  frontRail.receiveShadow = true;
  root.add(frontRail);

  for (let i = 0; i < 4; i += 1) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.78, 0.08), glassMat);
    panel.position.set(-3.9 + i * 2.2, 1.55, -4.46);
    root.add(panel);
  }

  const accentMat = new THREE.MeshStandardMaterial({
    color: "#4f5bd5",
    roughness: 0.55,
  });

  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.54, 0.16), accentMat);
  sign.position.set(-2.7, 1.82, -4.54);
  sign.castShadow = true;
  root.add(sign);

  slots.forEach((slot, index) => {
    addDesk(slot.x + (index % 2 === 0 ? 0.55 : -0.55), slot.z - 0.5, index);
    addPad(slot, agents[index]?.color || "#4f5bd5");
  });
}

function addDesk(x, z, index) {
  const deskMat = new THREE.MeshStandardMaterial({
    color: index % 2 ? "#4f6f82" : "#7b6655",
    roughness: 0.7,
  });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.28, 0.76), deskMat);
  desk.position.set(x, 0.23, z);
  desk.castShadow = true;
  desk.receiveShadow = true;
  root.add(desk);

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.44, 0.08),
    new THREE.MeshStandardMaterial({
      color: index % 2 ? "#0097a7" : "#4f5bd5",
      emissive: index % 2 ? "#00363b" : "#1a1f66",
      emissiveIntensity: 0.45,
      roughness: 0.35,
    }),
  );
  screen.position.set(x, 0.66, z - 0.18);
  screen.castShadow = true;
  root.add(screen);
}

function addPad(slot, color) {
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(0.58, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(slot.x, 0.011, slot.z);
  root.add(pad);
}

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0.02,
    emissive: options.emissive || "#000000",
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function lerpAngle(from, to, amount) {
  const fullTurn = Math.PI * 2;
  const delta = ((((to - from) % fullTurn) + Math.PI * 3) % fullTurn) - Math.PI;
  return from + delta * amount;
}

function addBox(parent, width, height, depth, color, position, options) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material(color, options),
  );
  mesh.position.set(position.x, position.y, position.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addPivotedLimb(parent, pivotPosition, size, color, options) {
  const pivot = new THREE.Group();
  pivot.position.set(pivotPosition.x, pivotPosition.y, pivotPosition.z);
  parent.add(pivot);

  const mesh = addBox(
    pivot,
    size.x,
    size.y,
    size.z,
    color,
    new THREE.Vector3(0, -size.y / 2, 0),
    options,
  );
  return { pivot, mesh };
}

function createAgentRig(agent, index) {
  const style = agentStyles[index % agentStyles.length];
  const isRobot = agent.kind === "robot";
  const rigRoot = new THREE.Group();
  rigRoot.name = `${agent.name}Rig`;
  rigRoot.scale.setScalar(isRobot ? 1.02 : 0.98);

  const torso = new THREE.Group();
  torso.position.y = 0.94;
  rigRoot.add(torso);

  const bodyColor = isRobot ? "#737b91" : agent.color;
  const body = addBox(torso, 0.64, 0.76, 0.4, bodyColor, new THREE.Vector3(0, 0, 0), {
    roughness: isRobot ? 0.45 : 0.68,
    metalness: isRobot ? 0.28 : 0.02,
  });

  if (isRobot) {
    addBox(torso, 0.7, 0.1, 0.43, "#ef3f5a", new THREE.Vector3(0, 0.25, 0.03), {
      emissive: "#4d0d16",
      emissiveIntensity: 0.25,
    });
    addBox(torso, 0.52, 0.08, 0.44, "#ef3f5a", new THREE.Vector3(0, -0.08, 0.04), {
      emissive: "#4d0d16",
      emissiveIntensity: 0.2,
    });
  } else {
    addBox(torso, 0.42, 0.12, 0.42, "#ffffff", new THREE.Vector3(0, 0.28, 0.015), {
      roughness: 0.82,
    });
  }

  const head = new THREE.Group();
  head.position.y = 1.5;
  rigRoot.add(head);

  const headColor = isRobot ? "#aeb7c6" : style.skin;
  addBox(head, 0.56, 0.52, 0.5, headColor, new THREE.Vector3(0, 0, 0), {
    roughness: isRobot ? 0.5 : 0.75,
    metalness: isRobot ? 0.18 : 0.02,
  });

  if (isRobot) {
    addBox(head, 0.38, 0.08, 0.53, "#ef3f5a", new THREE.Vector3(0, 0.28, 0), {
      emissive: "#4d0d16",
      emissiveIntensity: 0.3,
    });
  } else {
    addBox(head, 0.58, 0.16, 0.54, style.hair, new THREE.Vector3(0, 0.28, -0.02), {
      roughness: 0.78,
    });
    addBox(head, 0.2, 0.18, 0.16, style.hair, new THREE.Vector3(-0.19, 0.15, 0.22), {
      roughness: 0.78,
    });
  }

  const faceZ = 0.262;
  const eyeColor = isRobot ? "#f7fbff" : style.face;
  const leftEye = addBox(head, 0.055, 0.08, 0.02, eyeColor, new THREE.Vector3(-0.12, 0.05, faceZ), {
    emissive: isRobot ? "#e9f8ff" : "#000000",
    emissiveIntensity: isRobot ? 0.45 : 0,
  });
  const rightEye = addBox(head, 0.055, 0.08, 0.02, eyeColor, new THREE.Vector3(0.12, 0.05, faceZ), {
    emissive: isRobot ? "#e9f8ff" : "#000000",
    emissiveIntensity: isRobot ? 0.45 : 0,
  });
  const mouth = addBox(head, 0.17, 0.03, 0.022, style.mouth, new THREE.Vector3(0, -0.12, faceZ + 0.004), {
    emissive: isRobot ? "#6f111b" : "#000000",
    emissiveIntensity: isRobot ? 0.25 : 0,
  });

  const armColor = isRobot ? "#8c96aa" : style.skin;
  const leftArm = addPivotedLimb(
    rigRoot,
    new THREE.Vector3(-0.43, 1.2, 0),
    new THREE.Vector3(0.18, 0.68, 0.22),
    armColor,
    { roughness: isRobot ? 0.48 : 0.75, metalness: isRobot ? 0.18 : 0.02 },
  );
  const rightArm = addPivotedLimb(
    rigRoot,
    new THREE.Vector3(0.43, 1.2, 0),
    new THREE.Vector3(0.18, 0.68, 0.22),
    armColor,
    { roughness: isRobot ? 0.48 : 0.75, metalness: isRobot ? 0.18 : 0.02 },
  );

  if (!isRobot) {
    addBox(leftArm.pivot, 0.2, 0.24, 0.24, agent.color, new THREE.Vector3(0, -0.1, 0), {
      roughness: 0.68,
    });
    addBox(rightArm.pivot, 0.2, 0.24, 0.24, agent.color, new THREE.Vector3(0, -0.1, 0), {
      roughness: 0.68,
    });
  }

  const legColor = isRobot ? "#666f84" : style.pants;
  const leftLeg = addPivotedLimb(
    rigRoot,
    new THREE.Vector3(-0.18, 0.58, 0),
    new THREE.Vector3(0.22, 0.68, 0.25),
    legColor,
    { roughness: isRobot ? 0.5 : 0.72, metalness: isRobot ? 0.12 : 0.02 },
  );
  const rightLeg = addPivotedLimb(
    rigRoot,
    new THREE.Vector3(0.18, 0.58, 0),
    new THREE.Vector3(0.22, 0.68, 0.25),
    legColor,
    { roughness: isRobot ? 0.5 : 0.72, metalness: isRobot ? 0.12 : 0.02 },
  );

  addBox(leftLeg.pivot, 0.27, 0.12, 0.34, style.shoes, new THREE.Vector3(0, -0.72, 0.06), {
    roughness: 0.72,
  });
  addBox(rightLeg.pivot, 0.27, 0.12, 0.34, style.shoes, new THREE.Vector3(0, -0.72, 0.06), {
    roughness: 0.72,
  });

  return {
    root: rigRoot,
    torso,
    body,
    head,
    leftArm: leftArm.pivot,
    rightArm: rightArm.pivot,
    leftLeg: leftLeg.pivot,
    rightLeg: rightLeg.pivot,
    leftEye,
    rightEye,
    mouth,
  };
}

function createAgentModel(agent) {
  const holder = new THREE.Group();
  const index = agents.indexOf(agent);
  holder.userData.agentIndex = index;
  holder.position.copy(slots[agent.slot]);
  holder.userData.target = slots[agent.slot].clone();
  scene.add(holder);
  agent.group = holder;

  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.72, 2.15, 16),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hit.position.y = 1;
  hit.userData.agentIndex = index;
  holder.add(hit);
  clickTargets.push(hit);

  const rig = createAgentRig(agent, index);
  holder.add(rig.root);
  holder.userData.rig = rig;
}

function colorForState(state) {
  if (state === "working") return "working";
  if (state === "happy") return "happy";
  if (state === "focused") return "focused";
  return "";
}

function renderRoster() {
  rosterList.innerHTML = "";
  const visible = agents.filter((agent) => agent.active).length;
  activeCount.textContent = `${visible} / ${agents.length}`;
  teamStatus.textContent = `${visible} agents online`;

  agents.forEach((agent, index) => {
    const row = document.createElement("button");
    row.className = `agent-row ${selectedIndex === index ? "active" : ""}`;
    row.type = "button";
    row.disabled = !agent.active;
    row.addEventListener("click", () => selectAgent(index));

    row.innerHTML = `
      <span class="agent-token" style="background:${agent.color}">${agent.name.slice(0, 1)}</span>
      <span class="agent-meta">
        <span class="agent-name">${agent.name}</span>
        <span class="agent-role">${agent.role}</span>
      </span>
      <span class="status-dot ${colorForState(agent.state)}"></span>
    `;

    if (!agent.active) row.style.opacity = "0.45";
    rosterList.appendChild(row);
  });
}

function agentChatId(agent) {
  return agent.name.toLowerCase();
}

function agentByChatId(chatId) {
  if (chatId === "all") return null;
  return agents.find((agent) => agentChatId(agent) === chatId) || null;
}

function chatColor(chatId, author) {
  if (chatId === "user") return "#4f5bd5";
  const agent = agentByChatId(chatId) || agents.find((item) => item.name === author);
  return agent?.color || "#4f5bd5";
}

function chatInitial(author) {
  return author === "You" ? "You" : author.slice(0, 1);
}

function currentChatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function validChatId(chatId) {
  return chatId === "all" || agents.some((agent) => agentChatId(agent) === chatId);
}

function createEmptyChatThreads() {
  return new Map([["all", []]]);
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
    // Storage can be unavailable in strict/private browser modes.
  }
}

function randomStorageId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getGuestAccountKey() {
  const key = "rebly-office-guest-account";
  const existing = safeStorageGet(key);
  if (existing) return existing;
  const next = `guest-${randomStorageId()}`;
  safeStorageSet(key, next);
  return next;
}

function getOrCreateChatSessionId(nextAccountKey) {
  const key = `rebly-office-session:${nextAccountKey}`;
  const existing = safeStorageGet(key);
  if (existing) return existing;
  const next = `office-${nextAccountKey}-${randomStorageId()}`;
  safeStorageSet(key, next);
  return next;
}

function chatStorageKey(nextAccountKey = accountKey) {
  return `rebly-office-chat-v${CHAT_STORAGE_VERSION}:${nextAccountKey}`;
}

function serializeChatThreads() {
  return Object.fromEntries(
    [...chatThreads.entries()].map(([chatId, thread]) => [
      chatId,
      thread
        .filter((message) => message?.text && message.text !== "Thinking...")
        .slice(-120),
    ]),
  );
}

function hydrateChatThreads(value) {
  const next = createEmptyChatThreads();
  if (!value || typeof value !== "object") return next;
  Object.entries(value).forEach(([chatId, thread]) => {
    if (!validChatId(chatId) || !Array.isArray(thread)) return;
    next.set(
      chatId,
      thread
        .filter((message) => message && typeof message.text === "string")
        .map((message) => ({
          author: String(message.author || "Agent"),
          type: message.type === "user" ? "user" : "agent",
          from: String(message.from || ""),
          text: String(message.text || ""),
          time: String(message.time || ""),
          pendingPublish: normalizePendingPublish(message.pendingPublish),
        })),
    );
  });
  return next;
}

function normalizePendingPublish(value) {
  if (!value || typeof value !== "object" || typeof value.text !== "string") return null;
  return {
    platform: value.platform === "telegram" ? "telegram" : "telegram",
    status: String(value.status || "approval_required"),
    text: String(value.text || ""),
    runId: String(value.runId || ""),
    source: String(value.source || "team"),
    error: String(value.error || ""),
  };
}

function saveChatState() {
  if (!storageReady) return;
  safeStorageSet(
    chatStorageKey(),
    JSON.stringify({
      selectedChatId,
      threads: serializeChatThreads(),
    }),
  );
}

function loadChatState(nextAccountKey) {
  accountKey = nextAccountKey;
  chatSessionId = getOrCreateChatSessionId(accountKey);
  storageReady = false;

  const raw = safeStorageGet(chatStorageKey(accountKey));
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  chatThreads = hydrateChatThreads(parsed?.threads);
  selectedChatId = validChatId(parsed?.selectedChatId) ? parsed.selectedChatId : "all";
  storageReady = true;
}

async function resolveAccountContext() {
  try {
    const response = await fetch(`${AUTH_API}/api/auth/me`, { credentials: "include" });
    if (!response.ok) return;
    const payload = await response.json();
    const userId = payload?.user?.id;
    if (!userId) return;
    const nextAccountKey = `user-${userId}`;
    if (nextAccountKey === accountKey) return;
    loadChatState(nextAccountKey);
    renderChatTargets();
    renderChatMessages();
  } catch {
    // Keep guest-local persistence if the auth backend is not reachable.
  }
}

function selectedThread() {
  if (!chatThreads.has(selectedChatId)) {
    chatThreads.set(selectedChatId, []);
  }
  return chatThreads.get(selectedChatId);
}

function renderChatTargets() {
  chatTarget.innerHTML = "";
  const targets = [
    { id: "all", label: "Team" },
    ...agents.map((agent) => ({ id: agentChatId(agent), label: agent.name })),
  ];
  targets.forEach((target) => {
    const option = document.createElement("option");
    option.value = target.id;
    option.textContent = target.label;
    chatTarget.appendChild(option);
  });
  chatTarget.value = selectedChatId;
}

function renderChatMessages() {
  const thread = selectedThread();
  chatMessages.innerHTML = "";

  if (thread.length === 0) {
    const empty = document.createElement("div");
    empty.className = "chat-bubble";
    empty.textContent =
      selectedChatId === "all"
        ? "Team chat is ready. Ask the agents to coordinate."
        : `Chat with ${agentByChatId(selectedChatId)?.name || "agent"} is ready.`;
    chatMessages.appendChild(empty);
    return;
  }

  thread.forEach((message) => {
    const row = document.createElement("article");
    row.className = `chat-message ${message.type === "user" ? "user" : "agent"}`;

    const avatar = document.createElement("span");
    avatar.className = "chat-avatar";
    avatar.style.background = chatColor(message.type === "user" ? "user" : message.from, message.author);
    avatar.textContent = chatInitial(message.author);

    const body = document.createElement("div");
    body.className = "chat-message-body";

    const head = document.createElement("div");
    head.className = "chat-message-head";
    const author = document.createElement("strong");
    author.textContent = message.author;
    const time = document.createElement("time");
    time.textContent = message.time || currentChatTime();
    head.append(author, time);

    const bubble = document.createElement("p");
    bubble.className = "chat-bubble";
    bubble.textContent = message.text;

    body.append(head, bubble);
    if (message.pendingPublish) {
      body.append(createPublishCard(selectedChatId, message));
    }
    row.append(avatar, body);
    chatMessages.appendChild(row);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function createPublishCard(chatId, message) {
  const pending = message.pendingPublish;
  const card = document.createElement("div");
  card.className = `publish-card ${pending.status}`;

  const title = document.createElement("strong");
  title.textContent = "Telegram publish";
  const preview = document.createElement("p");
  preview.textContent = pending.text;

  const action = document.createElement("button");
  action.type = "button";
  action.textContent = publishButtonText(pending.status);
  action.disabled = pending.status === "publishing" || pending.status === "published";
  action.addEventListener("click", () => publishPendingMessage(chatId, message));

  card.append(title, preview, action);
  if (pending.error) {
    const error = document.createElement("small");
    error.textContent = pending.error;
    card.appendChild(error);
  }
  return card;
}

function publishButtonText(status) {
  if (status === "publishing") return "Publishing...";
  if (status === "published") return "Published";
  if (status === "error") return "Retry publish";
  return "Publish";
}

function appendChatMessage(chatId, message) {
  if (!chatThreads.has(chatId)) {
    chatThreads.set(chatId, []);
  }
  const entry = {
    time: currentChatTime(),
    ...message,
  };
  chatThreads.get(chatId).push(entry);
  saveChatState();
  if (chatId === selectedChatId) renderChatMessages();
  return entry;
}

function replaceChatMessage(chatId, current, next) {
  const thread = chatThreads.get(chatId) || [];
  const index = thread.indexOf(current);
  if (index >= 0) {
    thread.splice(index, 1, { time: currentChatTime(), ...next });
    saveChatState();
  }
  if (chatId === selectedChatId) renderChatMessages();
}

function normalizeAgentMessages(result, fallbackChatId) {
  const source = Array.isArray(result.messages) && result.messages.length
    ? result.messages
    : [{ author: agentByChatId(fallbackChatId)?.name || "Coordinator", text: result.reply || "" }];

  return source
    .filter((message) => message?.text)
    .map((message) => ({
      author: message.author || agentByChatId(message.from)?.name || "Coordinator",
      type: "agent",
      from: message.from || fallbackChatId,
      text: message.text,
    }));
}

function agentErrorReply(error) {
  const detail = error instanceof Error ? error.message : "AI backend error";
  return {
    author: "System",
    from: "system",
    text: `AI backend не ответил: ${detail}`,
  };
}

function setPanelTab(tab) {
  const showChat = tab === "chat";
  chatTab.classList.toggle("active", showChat);
  activityTab.classList.toggle("active", !showChat);
  chatTab.setAttribute("aria-selected", String(showChat));
  activityTab.setAttribute("aria-selected", String(!showChat));
  chatView.hidden = !showChat;
  activityView.hidden = showChat;
}

async function requestAgentChat(chatId, text) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 90000);
  try {
    const history = selectedThread()
      .filter((message) => message.text !== "Thinking...")
      .slice(-12)
      .map((message) => ({
        role: message.type === "user" ? "user" : "assistant",
        author: message.author,
        text: message.text,
      }));
    const response = await fetch(AGENT_CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: chatId,
        message: text,
        history,
        sessionId: chatSessionId,
        accountId: accountKey,
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function sendChatMessage(event) {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || chatBusy) return;

  const chatId = selectedChatId;
  chatInput.value = "";
  appendChatMessage(chatId, { author: "You", type: "user", from: "user", text });
  const loading = appendChatMessage(chatId, {
    author: chatId === "all" ? "Coordinator" : agentByChatId(chatId)?.name || "Agent",
    type: "agent",
    from: chatId === "all" ? "coordinator" : chatId,
    text: "Thinking...",
  });

  chatBusy = true;
  chatSend.disabled = true;
  addActivity(agents[selectedIndex], "chat", chatId === "all" ? "Team chat received a new request." : `${agentByChatId(chatId)?.name || "Agent"} received a direct message.`);

  try {
    const result = await requestAgentChat(chatId, text);
    const replies = normalizeAgentMessages(result, chatId);
    replaceChatMessage(chatId, loading, replies[0] || agentErrorReply(new Error("AI вернул пустой ответ.")));
    replies.slice(1).forEach((reply) => appendChatMessage(chatId, reply));
    if (result.pendingPublish?.text) {
      appendChatMessage(chatId, {
        author: "Nova",
        type: "agent",
        from: "nova",
        text: "Публикация готова. Проверь текст и нажми Publish, когда можно отправлять в Telegram.",
        pendingPublish: result.pendingPublish,
      });
    }
  } catch (error) {
    replaceChatMessage(chatId, loading, agentErrorReply(error));
  } finally {
    chatBusy = false;
    chatSend.disabled = false;
  }
}

async function publishPendingMessage(chatId, message) {
  const pending = message.pendingPublish;
  if (!pending?.text) return;
  pending.status = "publishing";
  pending.error = "";
  saveChatState();
  renderChatMessages();
  try {
    const response = await fetch(`${AUTH_API}/api/publish/telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        text: pending.text,
        run_id: pending.runId,
        source: pending.source,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.detail || `HTTP ${response.status}`);
    }
    pending.status = "published";
    saveChatState();
    appendChatMessage(chatId, {
      author: "Nova",
      type: "agent",
      from: "nova",
      text: "Опубликовано в Telegram.",
    });
  } catch (error) {
    pending.status = "error";
    pending.error = error instanceof Error ? error.message : "Telegram publish failed";
    saveChatState();
    renderChatMessages();
  }
}

function addActivity(agent, action, detail) {
  const item = document.createElement("article");
  item.className = "activity-item";
  item.style.borderLeftColor = agent.color;
  const now = new Date();
  item.innerHTML = `
    <strong>${agent.name} · ${action}</strong>
    <p>${detail}</p>
    <small>${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
  `;
  activityFeed.prepend(item);
  while (activityFeed.children.length > 12) {
    activityFeed.lastElementChild.remove();
  }
}

function selectAgent(index) {
  if (!agents[index]?.active) return;
  selectedIndex = index;
  const agent = agents[index];
  focusName.textContent = agent.name;
  selectedChatId = agentChatId(agent);
  saveChatState();
  agent.state = agent.state === "working" ? "working" : "focused";
  agent.bubble = agent.state === "working" ? agent.bubble : "Focused";
  addActivity(agent, "selected", `${agent.role} is now in focus.`);
  renderRoster();
  renderChatTargets();
  renderChatMessages();
}

function assignTask(index = selectedIndex) {
  const agent = agents[index];
  if (!agent || !agent.active) return;
  const task = tasks[Math.floor(Math.random() * tasks.length)];
  agent.state = "working";
  agent.bubble = task;
  queued = Math.max(0, queued - 1);
  queueCount.textContent = String(queued).padStart(2, "0");
  setAgentTarget(agent, randomAdjacentSlot(agent.slot));
  addActivity(agent, "working", task);
  renderRoster();

  window.setTimeout(() => {
    if (!agent.active) return;
    agent.state = "happy";
    agent.bubble = "Done";
    queued += 1;
    queueCount.textContent = String(queued).padStart(2, "0");
    addActivity(agent, "completed", `${task} moved to review.`);
    renderRoster();
  }, 4200);
}

function setAgentTarget(agent, slotIndex) {
  agent.slot = slotIndex;
  agent.group?.userData.target.copy(slots[slotIndex]);
}

function randomAdjacentSlot(current) {
  const candidates = slots.map((_, index) => index).filter((index) => index !== current);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function shuffleTeam() {
  const order = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
  agents.forEach((agent, index) => {
    if (!agent.active) return;
    agent.state = "focused";
    agent.bubble = "Moving";
    setAgentTarget(agent, order[index % order.length]);
  });
  addActivity(agents[selectedIndex], "moved", "Workspace seats rotated.");
  renderRoster();
}

function celebrateTeam() {
  agents.forEach((agent) => {
    if (!agent.active) return;
    agent.state = "happy";
    agent.bubble = "Nice";
  });
  addActivity(agents[selectedIndex], "win", "Team milestone recorded.");
  renderRoster();
}

function hireAgent() {
  const inactive = agents.find((agent) => !agent.active);
  if (inactive) {
    inactive.active = true;
    inactive.state = "focused";
    inactive.bubble = "Joined";
    if (inactive.group) {
      inactive.group.visible = true;
      inactive.group.position.set(6.8, 0, 3.2);
      inactive.group.userData.target.copy(slots[inactive.slot]);
    }
    addActivity(inactive, "hired", `${inactive.role} joined the team.`);
  } else {
    const target = agents[selectedIndex];
    target.state = "focused";
    target.bubble = "Capacity full";
    addActivity(target, "capacity", "All seats are already filled.");
  }
  renderRoster();
}

function resetView() {
  if (!controls) return;
  camera.position.set(7.2, 6.4, 8.6);
  camera.zoom = 1;
  controls.target.set(0, 0.8, 0);
  resize();
  controls.update();
}

function updateBubble(agent) {
  let element = bubbles.get(agent.name);
  if (!element) {
    element = document.createElement("div");
    element.className = "speech-bubble";
    bubbleLayer.appendChild(element);
    bubbles.set(agent.name, element);
  }

  if (!agent.active || !agent.group) {
    element.classList.remove("visible");
    return;
  }

  const point = agent.group.position.clone();
  point.y += 2.25;
  point.project(camera);
  const x = (point.x * 0.5 + 0.5) * bubbleLayer.clientWidth;
  const y = (-point.y * 0.5 + 0.5) * bubbleLayer.clientHeight;

  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  element.style.setProperty("--bubble-lift", "8px");
  element.innerHTML = `<strong>${agent.name}</strong>${agent.bubble}`;
  element.classList.toggle(
    "visible",
    agent.state === "working" || agent.state === "happy" || agent.state === "focused",
  );
}

function resolveBubbleCollisions() {
  const visible = [...bubbles.values()].filter((element) =>
    element.classList.contains("visible"),
  );
  visible.forEach((element) => element.style.setProperty("--bubble-lift", "8px"));

  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    const rects = visible.map((element) => ({
      element,
      rect: element.getBoundingClientRect(),
    }));

    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        const overlapsX = a.rect.left < b.rect.right && a.rect.right > b.rect.left;
        const overlapsY = a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top;
        if (!overlapsX || !overlapsY) continue;

        const topElement = a.rect.top <= b.rect.top ? a.element : b.element;
        const overlap = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        const currentLift =
          Number.parseFloat(topElement.style.getPropertyValue("--bubble-lift")) || 8;
        topElement.style.setProperty("--bubble-lift", `${currentLift + overlap + 8}px`);
        changed = true;
      }
    }

    if (!changed) return;
  }
}

function animateRig(rig, agent, moving, elapsed, index) {
  const gait = Math.sin(elapsed * (moving ? 10 : 6) + index * 0.7);
  const smallGait = Math.sin(elapsed * 7.2 + index);
  const idle = Math.sin(elapsed * 2.1 + index * 0.9);
  const working = agent.state === "working";
  const happy = agent.state === "happy";
  const focused = agent.state === "focused";

  rig.root.rotation.z = happy ? Math.sin(elapsed * 7 + index) * 0.055 : idle * 0.012;
  rig.torso.rotation.z = moving ? gait * 0.035 : idle * 0.018;
  rig.head.rotation.x = working ? -0.12 + smallGait * 0.035 : idle * 0.035;
  rig.head.rotation.z = happy ? Math.sin(elapsed * 8 + index) * 0.09 : idle * 0.025;

  const stride = moving ? 0.62 : working ? 0.12 : 0;
  rig.leftLeg.rotation.x = gait * stride;
  rig.rightLeg.rotation.x = -gait * stride;
  rig.leftLeg.rotation.z = moving ? 0.02 : 0;
  rig.rightLeg.rotation.z = moving ? -0.02 : 0;

  if (happy) {
    rig.leftArm.rotation.x = -0.45 + smallGait * 0.18;
    rig.rightArm.rotation.x = -0.45 - smallGait * 0.18;
    rig.leftArm.rotation.z = 0.88 + smallGait * 0.12;
    rig.rightArm.rotation.z = -0.88 - smallGait * 0.12;
  } else if (moving) {
    rig.leftArm.rotation.x = -gait * 0.58;
    rig.rightArm.rotation.x = gait * 0.58;
    rig.leftArm.rotation.z = 0.08;
    rig.rightArm.rotation.z = -0.08;
  } else if (working) {
    rig.leftArm.rotation.x = -0.48 + smallGait * 0.2;
    rig.rightArm.rotation.x = 0.34 - smallGait * 0.22;
    rig.leftArm.rotation.z = 0.12;
    rig.rightArm.rotation.z = -0.16;
  } else {
    rig.leftArm.rotation.x = focused ? -0.18 + idle * 0.06 : idle * 0.045;
    rig.rightArm.rotation.x = focused ? 0.18 - idle * 0.06 : -idle * 0.045;
    rig.leftArm.rotation.z = 0.08;
    rig.rightArm.rotation.z = -0.08;
  }

  const blink = Math.sin(elapsed * 3.3 + index * 1.7) > 0.965;
  rig.leftEye.scale.y = blink ? 0.16 : 1;
  rig.rightEye.scale.y = blink ? 0.16 : 1;

  if (happy) {
    rig.mouth.scale.x = 1.45 + Math.sin(elapsed * 6 + index) * 0.12;
    rig.mouth.scale.y = 1.45;
  } else if (working) {
    rig.mouth.scale.x = 0.75 + Math.sin(elapsed * 9 + index) * 0.08;
    rig.mouth.scale.y = 0.72;
  } else {
    rig.mouth.scale.x = 1 + idle * 0.06;
    rig.mouth.scale.y = 1;
  }
}

function updateAgents(delta, elapsed) {
  agents.forEach((agent, index) => {
    const group = agent.group;
    if (!group) return;
    group.visible = agent.active;
    if (!agent.active) return;

    const target = group.userData.target;
    const previousX = group.position.x;
    const previousZ = group.position.z;
    const lerpAmount = 1 - Math.exp(-delta * 2.8);
    group.position.x = THREE.MathUtils.lerp(group.position.x, target.x, lerpAmount);
    group.position.z = THREE.MathUtils.lerp(group.position.z, target.z, lerpAmount);

    if (Math.abs(group.position.x - target.x) < 0.004) group.position.x = target.x;
    if (Math.abs(group.position.z - target.z) < 0.004) group.position.z = target.z;

    const travelDistance = Math.hypot(group.position.x - previousX, group.position.z - previousZ);
    const distanceToTarget = Math.hypot(group.position.x - target.x, group.position.z - target.z);
    const moving = travelDistance > 0.001 || distanceToTarget > 0.035;

    const desiredAngle = moving
      ? Math.atan2(target.x - group.position.x, target.z - group.position.z)
      : Math.atan2(camera.position.x - group.position.x, camera.position.z - group.position.z);
    const turnSpeed = moving ? 8 : 2.4;
    group.rotation.y = lerpAngle(
      group.rotation.y,
      desiredAngle,
      1 - Math.exp(-delta * turnSpeed),
    );

    const bobPower =
      moving ? 0.14 : agent.state === "working" ? 0.08 : agent.state === "happy" ? 0.17 : 0.045;
    const bobSpeed =
      moving ? 10 : agent.state === "working" ? 8.5 : agent.state === "happy" ? 9 : 3.2;
    group.position.y = Math.sin(elapsed * bobSpeed + index) * bobPower;

    const rig = group.userData.rig;
    if (rig) animateRig(rig, agent, moving, elapsed, index);

    updateBubble(agent);
  });
  resolveBubbleCollisions();
}

function onCanvasClick(event) {
  if (!renderer) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(clickTargets, false);
  if (hits.length) {
    selectAgent(hits[0].object.userData.agentIndex);
  }
}

function resize() {
  if (!renderer) return;
  const { clientWidth, clientHeight } = canvas.parentElement;
  renderer.setSize(clientWidth, clientHeight, false);
  const aspect = clientWidth / Math.max(clientHeight, 1);
  const viewHeight = aspect < 0.9 ? 15.4 : clientWidth < 720 ? 11.2 : 9.2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.left = (-viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.updateProjectionMatrix();
}

function updateClock() {
  clock.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startAutomation() {
  window.setInterval(() => {
    const active = agents
      .map((agent, index) => ({ agent, index }))
      .filter(({ agent }) => agent.active);
    const pick = active[Math.floor(Math.random() * active.length)];
    if (pick) assignTask(pick.index);
  }, 12000);
}

function animate() {
  if (!renderer || !controls) return;
  const elapsed = clockTimer.getElapsedTime();
  const delta = Math.min(clockTimer.getDelta(), 0.05);
  updateAgents(delta, elapsed);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

const clockTimer = new THREE.Clock();

if (renderer) {
  addOffice();
  agents.forEach(createAgentModel);
}
loadChatState(accountKey);

document.querySelector("#assignBtn").addEventListener("click", () => assignTask());
document.querySelector("#shuffleBtn").addEventListener("click", shuffleTeam);
document.querySelector("#celebrateBtn").addEventListener("click", celebrateTeam);
document.querySelector("#hireBtn").addEventListener("click", hireAgent);
viewBtn.addEventListener("click", resetView);
canvas.addEventListener("click", onCanvasClick);
window.addEventListener("resize", resize);
chatTab.addEventListener("click", () => setPanelTab("chat"));
activityTab.addEventListener("click", () => setPanelTab("activity"));
chatTarget.addEventListener("change", () => {
  selectedChatId = chatTarget.value;
  saveChatState();
  renderChatMessages();
});
chatComposer.addEventListener("submit", sendChatMessage);

renderRoster();
renderChatTargets();
renderChatMessages();
resolveAccountContext();
addActivity(agents[0], "online", "Workspace cell is ready.");
addActivity(agents[2], "working", "Scanning market signals.");
updateClock();
window.setInterval(updateClock, 15000);
resize();
startAutomation();
animate();

window.agentOfficeDebug = { agents, camera, controls, renderer, scene };
