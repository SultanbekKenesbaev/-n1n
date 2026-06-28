import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const officeParams = new URLSearchParams(window.location.search);
const isDashboardEmbed = officeParams.get("embed") === "dashboard";
document.body.classList.toggle("embedded-dashboard", isDashboardEmbed);

const workspace = document.querySelector(".workspace");
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
const chatResizeHandle = document.querySelector("#chatResizeHandle");

const AGENT_CHAT_API = "http://127.0.0.1:4173/api/agents/chat";
const AUTH_API =
  window.location.hostname === "localhost" ? "http://localhost:8000" : "http://127.0.0.1:8000";
const CHAT_STORAGE_VERSION = 2;
const CHAT_WIDTH_STORAGE_KEY = "rebly-office-chat-width";
const CHAT_WIDTH_MIN = 280;
const CHAT_WIDTH_MAX = 520;
const MAIN_WIDTH_MIN = 520;

let accountKey = getGuestAccountKey();
let chatSessionId = getOrCreateChatSessionId(accountKey);
let storageReady = false;

const tasks = [
  "Route request",
  "Check context",
  "Prepare report",
  "Review answer",
  "Draft reply",
];

const teamProfile = {
  id: "all",
  name: "Team",
  role: "AI crew",
  color: "#1f2933",
  state: "focused",
  bubble: "Ready",
  active: true,
};

const rooms = {
  open: {
    name: "Open Space",
    center: new THREE.Vector3(0, 0, -2.45),
    size: { x: 13.8, z: 5.95 },
    bounds: { minX: -6.75, maxX: 6.75, minZ: -5.35, maxZ: 0.25 },
  },
  kitchen: {
    name: "Kitchen",
    center: new THREE.Vector3(-3.55, 0, 3.05),
    size: { x: 6.8, z: 5.05 },
    bounds: { minX: -6.75, maxX: -0.35, minZ: 0.65, maxZ: 5.35 },
  },
  relax: {
    name: "Relax Room",
    center: new THREE.Vector3(3.55, 0, 3.05),
    size: { x: 6.8, z: 5.05 },
    bounds: { minX: 0.35, maxX: 6.75, minZ: 0.65, maxZ: 5.35 },
  },
};

const workStations = [
  {
    point: new THREE.Vector3(-5.05, 0, -2.15),
    desk: new THREE.Vector3(-4.65, 0, -2.85),
    rotation: -0.08,
    color: "#d04f6a",
    activity: "Campaign desk",
  },
  {
    point: new THREE.Vector3(-2.25, 0, -3.45),
    desk: new THREE.Vector3(-1.9, 0, -4.05),
    rotation: 0.03,
    color: "#0097a7",
    activity: "Research pod",
  },
  {
    point: new THREE.Vector3(0.05, 0, -1.35),
    desk: new THREE.Vector3(0.45, 0, -1.95),
    rotation: -0.04,
    color: "#4f5bd5",
    activity: "Command desk",
  },
  {
    point: new THREE.Vector3(2.65, 0, -3.25),
    desk: new THREE.Vector3(3.05, 0, -3.85),
    rotation: 0.05,
    color: "#13a56f",
    activity: "Build desk",
  },
  {
    point: new THREE.Vector3(4.75, 0, -1.35),
    desk: new THREE.Vector3(5.1, 0, -1.95),
    rotation: -0.06,
    color: "#c98908",
    activity: "Support desk",
  },
];

const slots = workStations.map((station) => station.point.clone());

const roomGateways = {
  open: new THREE.Vector3(0, 0, 0.15),
  kitchen: new THREE.Vector3(-2.7, 0, 0.95),
  relax: new THREE.Vector3(2.7, 0, 0.95),
};

const idleDestinations = [
  {
    id: "kitchen-coffee",
    room: "kitchen",
    kind: "coffee",
    point: new THREE.Vector3(-5.55, 0, 2.0),
    face: new THREE.Vector3(-5.9, 0, 1.3),
    bubbles: ["Coffee?", "Taking coffee"],
  },
  {
    id: "kitchen-table",
    room: "kitchen",
    kind: "talk",
    point: new THREE.Vector3(-3.65, 0, 4.15),
    face: new THREE.Vector3(-2.85, 0, 4.15),
    bubbles: ["Quick sync", "Menu break"],
  },
  {
    id: "kitchen-snack",
    room: "kitchen",
    kind: "coffee",
    point: new THREE.Vector3(-1.75, 0, 2.75),
    face: new THREE.Vector3(-2.35, 0, 2.95),
    bubbles: ["Snack ready", "Recharge"],
  },
  {
    id: "relax-sofa",
    room: "relax",
    kind: "rest",
    point: new THREE.Vector3(2.35, 0, 3.1),
    face: new THREE.Vector3(5.85, 0, 2.65),
    bubbles: ["Reset", "Thinking"],
  },
  {
    id: "relax-tv",
    room: "relax",
    kind: "screen",
    point: new THREE.Vector3(4.75, 0, 3.9),
    face: new THREE.Vector3(6.55, 0, 2.4),
    bubbles: ["Watching metrics", "Reviewing"],
  },
  {
    id: "relax-books",
    room: "relax",
    kind: "read",
    point: new THREE.Vector3(5.9, 0, 4.55),
    face: new THREE.Vector3(6.4, 0, 4.35),
    bubbles: ["Reading notes", "Learning"],
  },
  {
    id: "open-whiteboard",
    room: "open",
    kind: "talk",
    point: new THREE.Vector3(1.45, 0, -4.65),
    face: new THREE.Vector3(2.4, 0, -5.2),
    bubbles: ["Plan next", "Board check"],
  },
  {
    id: "open-plants",
    room: "open",
    kind: "talk",
    point: new THREE.Vector3(-0.65, 0, -0.25),
    face: new THREE.Vector3(0.55, 0, -0.35),
    bubbles: ["Team sync", "Discussing"],
  },
  {
    id: "open-window",
    room: "open",
    kind: "focused",
    point: new THREE.Vector3(-5.95, 0, -4.65),
    face: new THREE.Vector3(-6.65, 0, -4.4),
    bubbles: ["Market notes", "Thinking"],
  },
];

const agents = [
  {
    id: "coordinator",
    name: "Atlas",
    role: "Coordinator",
    kind: "robot",
    color: "#4f5bd5",
    avatar: "/images/agents/coordinator.png",
    slot: 2,
    state: "focused",
    bubble: "Ready",
    active: true,
  },
  {
    id: "mika",
    name: "Ava",
    role: "Clients",
    kind: "human",
    color: "#d04f6a",
    avatar: "/images/agents/mika.png",
    slot: 0,
    state: "idle",
    bubble: "Ready",
    active: true,
  },
  {
    id: "scout",
    name: "Scout",
    role: "Market",
    kind: "human",
    color: "#0097a7",
    avatar: "/images/agents/scout.png",
    slot: 1,
    state: "idle",
    bubble: "Ready",
    active: true,
  },
  {
    id: "dev",
    name: "Dex",
    role: "Developer",
    kind: "human",
    color: "#13a56f",
    avatar: "/images/agents/dev.png",
    slot: 3,
    state: "idle",
    bubble: "Ready",
    active: true,
  },
  {
    id: "nova",
    name: "Echo",
    role: "Support",
    kind: "human",
    color: "#c98908",
    avatar: "/images/agents/nova.png",
    slot: 4,
    state: "idle",
    bubble: "Ready",
    active: true,
  },
];

const legacyAuthorToAgentId = {
  Coordinator: "coordinator",
  Atlas: "coordinator",
  Mika: "mika",
  Ava: "mika",
  Scout: "scout",
  Dev: "dev",
  Dex: "dev",
  Nova: "nova",
  Echo: "nova",
};

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
camera.position.set(9.8, 8.1, 10.8);
camera.lookAt(0, 0.7, 0.2);

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
  controls.target.set(0, 0.7, 0.2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minZoom = 0.5;
  controls.maxZoom = 2.05;
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
const gltfLoader = new GLTFLoader();
const gltfCache = new Map();
const loadedAssetNames = new Set();
let teamWorkActive = false;
let teamWorkTimer = null;
let roamingTimer = null;

function createCanvasTexture(
  base = "#edf1f5",
  line = "#d7dee9",
  accents = [
    { color: "rgba(79, 91, 213, 0.08)", x: 0, y: 192, w: 512, h: 64 },
    { color: "rgba(0, 151, 167, 0.08)", x: 192, y: 0, w: 64, h: 512 },
  ],
  repeat = { x: 2.2, y: 1.4 },
) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 512;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = line;
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
  accents.forEach((accent) => {
    ctx.fillStyle = accent.color;
    ctx.fillRect(accent.x, accent.y, accent.w, accent.h);
  });

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat.x, repeat.y);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWoodTexture(base = "#d9b27e", line = "#b98756") {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 512;
  textureCanvas.height = 512;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  for (let y = 0; y < 512; y += 58) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y + 18 * Math.sin(y * 0.03));
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  for (let x = 36; x < 512; x += 82) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 16, 512);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.8, 1.45);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addOffice() {
  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(14.8, 0.34, 11.35),
    new THREE.MeshStandardMaterial({
      color: "#dbeafe",
      roughness: 0.68,
    }),
  );
  foundation.position.y = -0.32;
  foundation.receiveShadow = true;
  root.add(foundation);

  addRoomFloor(rooms.open, createCanvasTexture("#eef3f8", "#d8e2ee", [], { x: 2.7, y: 1.15 }));
  addRoomFloor(rooms.kitchen, createWoodTexture("#efd3a7", "#c99a64"));
  addRoomFloor(rooms.relax, createWoodTexture("#e1c09a", "#b98761"));

  addRoomShell();
  addOpenSpaceRoom();
  addKitchenRoom();
  addRelaxRoom();
  addRoomLights();
}

function addRoomFloor(room, texture) {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(room.size.x, 0.2, room.size.z),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.78,
      metalness: 0.03,
    }),
  );
  floor.position.set(room.center.x, -0.08, room.center.z);
  floor.receiveShadow = true;
  root.add(floor);
  return floor;
}

function addRoomShell() {
  const wallMat = new THREE.MeshStandardMaterial({
    color: "#d7e1ee",
    roughness: 0.82,
  });
  const innerWallMat = new THREE.MeshStandardMaterial({
    color: "#eef3f8",
    roughness: 0.78,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: "#cbd7e6",
    roughness: 0.62,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: "#d7ecff",
    transparent: true,
    opacity: 0.46,
    roughness: 0.2,
  });

  addWallBlock(14.8, 2.55, 0.3, new THREE.Vector3(0, 1.05, -5.62), wallMat);
  addWallBlock(0.3, 2.55, 11.35, new THREE.Vector3(-7.38, 1.05, 0), wallMat);
  addWallBlock(0.22, 0.58, 11.35, new THREE.Vector3(7.36, 0.16, 0), trimMat);
  addWallBlock(14.8, 0.34, 0.22, new THREE.Vector3(0, 0.03, 5.58), trimMat);
  addWallBlock(0.22, 0.34, 11.35, new THREE.Vector3(7.36, 0.03, 0), trimMat);

  addWallBlock(5.35, 1.45, 0.2, new THREE.Vector3(-4.6, 0.62, 0.4), innerWallMat);
  addWallBlock(5.35, 1.45, 0.2, new THREE.Vector3(4.6, 0.62, 0.4), innerWallMat);
  addWallBlock(0.2, 1.45, 3.35, new THREE.Vector3(0, 0.62, 2.65), innerWallMat);

  addWallBlock(1.5, 0.16, 0.12, new THREE.Vector3(-2.05, 1.45, 0.35), trimMat);
  addWallBlock(1.5, 0.16, 0.12, new THREE.Vector3(2.05, 1.45, 0.35), trimMat);
  addWallBlock(0.12, 0.16, 1.2, new THREE.Vector3(0, 1.45, 0.85), trimMat);

  for (let i = 0; i < 5; i += 1) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.78, 0.08), glassMat);
    panel.position.set(-5.4 + i * 2.45, 1.62, -5.78);
    root.add(panel);
  }

  addSignPlane("OPEN SPACE", "work / collaborate / ship", "#4f5bd5", 3.25, 0.78, -4.8, 1.86, -5.8);
  addSignPlane("KITCHEN", "coffee / snacks", "#f59e0b", 2.4, 0.62, -4.9, 1.5, 0.28);
  addSignPlane("RELAX ROOM", "rest / recharge", "#10b981", 2.55, 0.62, 4.9, 1.5, 0.28);
}

function addOpenSpaceRoom() {
  workStations.forEach((station, index) => {
    addDesk(station.desk.x, station.desk.z, index, station.rotation, station.color);
    addPad(station.point, agents[index]?.color || station.color);
  });

  addWhiteboard(2.75, -5.43, 3.7, 1.15, "TASKS", ["PLAN", "BUILD", "TEST", "DEPLOY"]);
  addWallScreen(-4.7, -5.44, 3.2, 1.0);
  addPlantDivider(-0.85, -0.55, 2.0);
  addPlantDivider(1.15, -0.55, 2.0);
  addShelf(6.1, -4.35, 0.75, Math.PI * 0.5);
  addFloorPlant(5.75, -0.45, 0.75);
  addFloorPlant(-6.05, -0.55, 0.65);
}

function addKitchenRoom() {
  addKitchenCounter(-6.15, 1.6, 0);
  addKitchenCounter(-5.05, 1.6, 1);
  addKitchenCounter(-3.95, 1.6, 2);
  addFridge(-6.15, 3.45);
  addCoffeeMachine(-5.02, 1.2);
  addSink(-4.05, 1.16);
  addDiningSet(-3.55, 4.2);
  addWaterCooler(-1.0, 1.35);
  addShelf(-6.85, 4.65, 0.62, Math.PI * 0.5);

  addFoodModel("cup-coffee", new THREE.Vector3(-5.0, 0.82, 1.05), 0.18, 0.2);
  addFoodModel("mug", new THREE.Vector3(-3.45, 0.74, 4.2), 0.18, -0.4);
  addFoodModel("plate", new THREE.Vector3(-3.2, 0.75, 4.05), 0.2, 0);
  addFoodModel("apple", new THREE.Vector3(-3.75, 0.82, 4.2), 0.16, 0.4);
  addFoodModel("banana", new THREE.Vector3(-3.95, 0.82, 4.0), 0.16, 1.1);
  addFoodModel("donut", new THREE.Vector3(-2.95, 0.82, 4.34), 0.15, 0.2);
}

function addRelaxRoom() {
  addRug(3.65, 3.55, 3.4, 2.45, "#c7d2fe", 0.15);
  addSofa(2.2, 3.2, 0.0);
  addLoungeChair(4.35, 4.35, -0.6);
  addCoffeeTable(3.45, 3.65);
  addTvStand(6.12, 2.55);
  addShelf(6.25, 4.6, 0.72, Math.PI * 0.5);
  addFloorLamp(1.05, 4.75);
  addFloorPlant(1.25, 2.0, 0.62);
  addBeanBag(4.95, 2.0);
  addFoodModel("cup", new THREE.Vector3(3.25, 0.62, 3.56), 0.16, 0);
  addFoodModel("bowl", new THREE.Vector3(3.6, 0.63, 3.72), 0.16, 0.3);
}

function addRoomLights() {
  addPendant(-4.0, 2.75, -2.25, "#fff5d6");
  addPendant(2.5, 2.75, -2.25, "#fff5d6");
  addPendant(-3.5, 2.55, 3.35, "#fff0c7");
  addPendant(3.9, 2.55, 3.45, "#f1f5ff");
}

function addWallBlock(width, height, depth, position, mat) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  wall.position.copy(position);
  wall.castShadow = true;
  wall.receiveShadow = true;
  root.add(wall);
  return wall;
}

function createSignTexture(title, subtitle, accent = "#4f5bd5") {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 768;
  textureCanvas.height = 256;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 768, 256);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 18, 256);
  ctx.fillStyle = "#111827";
  ctx.font = "800 58px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI'";
  ctx.fillText(title, 54, 105);
  ctx.fillStyle = "#64748b";
  ctx.font = "600 30px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI'";
  ctx.fillText(subtitle, 56, 162);
  ctx.fillStyle = "rgba(79, 91, 213, 0.08)";
  ctx.fillRect(54, 190, 560, 18);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addSignPlane(title, subtitle, accent, width, height, x, y, z) {
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: createSignTexture(title, subtitle, accent),
      transparent: true,
    }),
  );
  sign.position.set(x, y, z);
  root.add(sign);
  return sign;
}

function addWhiteboard(x, z, width, height, title, lines) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 768;
  textureCanvas.height = 384;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, 768, 384);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 12;
  ctx.strokeRect(18, 18, 732, 348);
  ctx.fillStyle = "#111827";
  ctx.font = "800 52px ui-sans-serif, system-ui";
  ctx.fillText(title, 58, 82);
  ctx.font = "600 34px ui-sans-serif, system-ui";
  lines.forEach((line, index) => {
    ctx.fillText(`• ${line}`, 62, 145 + index * 48);
  });
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(430, 120);
  ctx.lineTo(620, 285);
  ctx.stroke();
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i % 2 ? "#fbbf24" : "#f87171";
    ctx.fillRect(585 + (i % 2) * 58, 125 + i * 36, 34, 34);
  }
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  board.position.set(x, 1.62, z);
  root.add(board);
  return board;
}

function addWallScreen(x, z, width, height) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 768;
  textureCanvas.height = 256;
  const ctx = textureCanvas.getContext("2d");
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, 768, 256);
  ctx.fillStyle = "#38bdf8";
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 18;
  ctx.font = "800 58px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("AI AGENTS", 54, 110);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#dbeafe";
  ctx.font = "600 28px ui-sans-serif, system-ui";
  ctx.fillText("WORK. COLLABORATE. EVOLVE.", 58, 165);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  screen.position.set(x, 1.72, z);
  root.add(screen);
  return screen;
}

function addDesk(x, z, index, rotation = 0, accent = "#4f5bd5") {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  root.add(group);

  addBox(group, 1.58, 0.18, 0.86, "#9b7a58", new THREE.Vector3(0, 0.56, 0), {
    roughness: 0.68,
  });
  addBox(group, 1.7, 0.07, 0.94, "#6f5845", new THREE.Vector3(0, 0.71, 0), {
    roughness: 0.62,
  });
  [-0.64, 0.64].forEach((legX) => {
    [-0.32, 0.32].forEach((legZ) => {
      addBox(group, 0.08, 0.56, 0.08, "#2f3a4a", new THREE.Vector3(legX, 0.28, legZ), {
        roughness: 0.55,
      });
    });
  });

  addMonitor(group, -0.18, -0.18, accent);
  addBox(group, 0.52, 0.035, 0.18, "#1f2937", new THREE.Vector3(0.26, 0.75, 0.22), {
    roughness: 0.45,
  });
  addBox(group, 0.22, 0.025, 0.18, "#334155", new THREE.Vector3(-0.52, 0.75, 0.22), {
    roughness: 0.45,
  });
  addOfficeChair(group, -0.15, 0.72, index);
  addDeskLamp(group, 0.64, -0.22, accent);
  if (index % 2 === 0) {
    addFoodModel("cup-coffee", new THREE.Vector3(x + 0.42, 0.83, z + 0.1), 0.13, 0.4);
  }
  return group;
}

function addMonitor(parent, x, z, accent) {
  addBox(parent, 0.08, 0.22, 0.08, "#1f2937", new THREE.Vector3(x, 0.88, z + 0.04), {
    roughness: 0.5,
  });
  addBox(parent, 0.56, 0.05, 0.24, "#111827", new THREE.Vector3(x, 0.76, z + 0.08), {
    roughness: 0.5,
  });
  addBox(parent, 0.7, 0.5, 0.08, "#1e293b", new THREE.Vector3(x, 1.08, z), {
    roughness: 0.4,
  });
  addBox(parent, 0.56, 0.36, 0.024, accent, new THREE.Vector3(x, 1.08, z - 0.045), {
    roughness: 0.35,
    emissive: accent,
    emissiveIntensity: 0.32,
  });
}

function addOfficeChair(parent, x, z, index) {
  const color = index % 2 ? "#334155" : "#475569";
  addBox(parent, 0.48, 0.16, 0.46, color, new THREE.Vector3(x, 0.35, z), { roughness: 0.65 });
  addBox(parent, 0.48, 0.58, 0.14, color, new THREE.Vector3(x, 0.72, z + 0.2), {
    roughness: 0.65,
  });
  addBox(parent, 0.1, 0.33, 0.1, "#1f2937", new THREE.Vector3(x, 0.17, z), {
    roughness: 0.5,
  });
}

function addDeskLamp(parent, x, z, accent) {
  addBox(parent, 0.08, 0.34, 0.08, "#475569", new THREE.Vector3(x, 0.94, z), {
    roughness: 0.45,
  });
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.18, 18),
    new THREE.MeshStandardMaterial({
      color: "#f8fafc",
      emissive: accent,
      emissiveIntensity: 0.18,
      roughness: 0.5,
    }),
  );
  shade.position.set(x, 1.18, z);
  shade.rotation.x = Math.PI;
  shade.castShadow = true;
  parent.add(shade);
}

function addPad(slot, color) {
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(0.58, 36),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(slot.x, 0.025, slot.z);
  root.add(pad);
}

function addPlantDivider(x, z, width) {
  addBox(root, width, 0.5, 0.42, "#d6d3d1", new THREE.Vector3(x, 0.26, z), {
    roughness: 0.78,
  });
  for (let i = 0; i < 5; i += 1) {
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.65, 8),
      new THREE.MeshStandardMaterial({ color: i % 2 ? "#15803d" : "#22c55e", roughness: 0.7 }),
    );
    leaf.position.set(x - width * 0.38 + i * (width / 4.5), 0.8, z);
    leaf.rotation.x = 0.25 + i * 0.08;
    leaf.rotation.z = i % 2 ? 0.35 : -0.35;
    leaf.castShadow = true;
    root.add(leaf);
  }
}

function addFloorPlant(x, z, scale = 0.7) {
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26 * scale, 0.34 * scale, 0.42 * scale, 16),
    new THREE.MeshStandardMaterial({ color: "#8b5e3c", roughness: 0.78 }),
  );
  pot.position.set(x, 0.22 * scale, z);
  pot.castShadow = true;
  pot.receiveShadow = true;
  root.add(pot);
  for (let i = 0; i < 7; i += 1) {
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.09 * scale, 0.75 * scale, 8),
      new THREE.MeshStandardMaterial({ color: i % 2 ? "#16a34a" : "#65a30d", roughness: 0.72 }),
    );
    leaf.position.set(x, 0.72 * scale, z);
    leaf.rotation.z = (i / 7) * Math.PI * 2;
    leaf.rotation.x = 0.35;
    leaf.castShadow = true;
    root.add(leaf);
  }
}

function addShelf(x, z, scale = 0.72, rotation = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);
  root.add(group);
  addBox(group, 0.9, 1.65, 0.28, "#5b4636", new THREE.Vector3(0, 0.82, 0), { roughness: 0.68 });
  addBox(group, 0.8, 1.46, 0.24, "#f8fafc", new THREE.Vector3(0, 0.86, -0.02), {
    roughness: 0.8,
  });
  for (let i = 0; i < 4; i += 1) {
    addBox(group, 0.82, 0.055, 0.3, "#6f5845", new THREE.Vector3(0, 0.32 + i * 0.38, 0), {
      roughness: 0.65,
    });
  }
  for (let i = 0; i < 9; i += 1) {
    addBox(
      group,
      0.07,
      0.27 + (i % 3) * 0.04,
      0.18,
      ["#4f5bd5", "#ef4444", "#10b981", "#f59e0b"][i % 4],
      new THREE.Vector3(-0.32 + i * 0.08, 0.44 + (i % 3) * 0.38, -0.16),
      { roughness: 0.7 },
    );
  }
}

function addKitchenCounter(x, z, index) {
  addBox(root, 1.0, 0.74, 0.68, "#d6a86e", new THREE.Vector3(x, 0.37, z), { roughness: 0.7 });
  addBox(root, 1.04, 0.08, 0.72, "#f8fafc", new THREE.Vector3(x, 0.78, z), { roughness: 0.45 });
  addBox(root, 0.08, 0.55, 0.03, "#b77943", new THREE.Vector3(x - 0.24, 0.38, z - 0.35), {
    roughness: 0.7,
  });
  addBox(root, 0.08, 0.55, 0.03, "#b77943", new THREE.Vector3(x + 0.24, 0.38, z - 0.35), {
    roughness: 0.7,
  });
  if (index === 2) {
    addBox(root, 0.4, 0.06, 0.34, "#94a3b8", new THREE.Vector3(x, 0.84, z), {
      roughness: 0.35,
      metalness: 0.2,
    });
  }
}

function addFridge(x, z) {
  addBox(root, 0.74, 1.55, 0.64, "#e2e8f0", new THREE.Vector3(x, 0.78, z), {
    roughness: 0.45,
    metalness: 0.08,
  });
  addBox(root, 0.03, 1.18, 0.04, "#64748b", new THREE.Vector3(x - 0.33, 0.78, z - 0.34), {
    roughness: 0.45,
  });
  addBox(root, 0.64, 0.035, 0.04, "#cbd5e1", new THREE.Vector3(x, 1.12, z - 0.35), {
    roughness: 0.45,
  });
}

function addCoffeeMachine(x, z) {
  addBox(root, 0.42, 0.36, 0.28, "#1f2937", new THREE.Vector3(x, 0.98, z), {
    roughness: 0.35,
  });
  addBox(root, 0.24, 0.12, 0.04, "#38bdf8", new THREE.Vector3(x, 1.05, z - 0.16), {
    emissive: "#0ea5e9",
    emissiveIntensity: 0.35,
    roughness: 0.35,
  });
}

function addSink(x, z) {
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.23, 0.2, 0.08, 24),
    new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.35, metalness: 0.25 }),
  );
  bowl.position.set(x, 0.88, z);
  bowl.castShadow = true;
  root.add(bowl);
  addBox(root, 0.07, 0.28, 0.06, "#64748b", new THREE.Vector3(x + 0.24, 1.02, z), {
    roughness: 0.35,
    metalness: 0.2,
  });
}

function addDiningSet(x, z) {
  addBox(root, 1.75, 0.12, 1.05, "#f2d4a3", new THREE.Vector3(x, 0.62, z), { roughness: 0.7 });
  [-0.62, 0.62].forEach((legX) => {
    [-0.35, 0.35].forEach((legZ) => {
      addBox(root, 0.08, 0.58, 0.08, "#ad7f51", new THREE.Vector3(x + legX, 0.31, z + legZ), {
        roughness: 0.68,
      });
    });
  });
  [
    [x - 1.0, z, Math.PI * 0.5],
    [x + 1.0, z, -Math.PI * 0.5],
    [x, z - 0.72, 0],
    [x, z + 0.72, Math.PI],
  ].forEach(([cx, cz, rotation], index) => {
    const group = new THREE.Group();
    group.position.set(cx, 0, cz);
    group.rotation.y = rotation;
    root.add(group);
    addBox(group, 0.42, 0.12, 0.42, "#e2e8f0", new THREE.Vector3(0, 0.34, 0), {
      roughness: 0.72,
    });
    addBox(group, 0.42, 0.48, 0.1, index % 2 ? "#d1d5db" : "#f8fafc", new THREE.Vector3(0, 0.66, 0.2), {
      roughness: 0.72,
    });
  });
}

function addWaterCooler(x, z) {
  addBox(root, 0.34, 0.72, 0.34, "#e2e8f0", new THREE.Vector3(x, 0.36, z), { roughness: 0.58 });
  const bottle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.52, 18),
    new THREE.MeshStandardMaterial({
      color: "#bae6fd",
      transparent: true,
      opacity: 0.72,
      roughness: 0.2,
    }),
  );
  bottle.position.set(x, 0.98, z);
  bottle.castShadow = true;
  root.add(bottle);
}

function addRug(x, z, width, depth, color, opacity = 0.2) {
  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.035, depth),
    new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness: 0.9,
    }),
  );
  rug.position.set(x, 0.035, z);
  rug.receiveShadow = true;
  root.add(rug);
}

function addSofa(x, z, rotation) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  root.add(group);
  addBox(group, 1.7, 0.42, 0.62, "#94a3b8", new THREE.Vector3(0, 0.35, 0), { roughness: 0.78 });
  addBox(group, 1.72, 0.76, 0.22, "#64748b", new THREE.Vector3(0, 0.68, 0.3), { roughness: 0.78 });
  addBox(group, 0.24, 0.48, 0.68, "#64748b", new THREE.Vector3(-0.96, 0.44, 0), { roughness: 0.78 });
  addBox(group, 0.24, 0.48, 0.68, "#64748b", new THREE.Vector3(0.96, 0.44, 0), { roughness: 0.78 });
  addBox(group, 0.38, 0.18, 0.14, "#facc15", new THREE.Vector3(-0.32, 0.72, -0.18), {
    roughness: 0.78,
  });
  addBox(group, 0.38, 0.18, 0.14, "#38bdf8", new THREE.Vector3(0.28, 0.72, -0.18), {
    roughness: 0.78,
  });
}

function addLoungeChair(x, z, rotation) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  root.add(group);
  addBox(group, 0.64, 0.32, 0.72, "#a78bfa", new THREE.Vector3(0, 0.32, 0), { roughness: 0.78 });
  addBox(group, 0.66, 0.68, 0.18, "#7c3aed", new THREE.Vector3(0, 0.68, 0.28), { roughness: 0.78 });
}

function addCoffeeTable(x, z) {
  addBox(root, 1.2, 0.12, 0.64, "#7c5f46", new THREE.Vector3(x, 0.46, z), { roughness: 0.68 });
  addBox(root, 1.28, 0.04, 0.72, "#e2e8f0", new THREE.Vector3(x, 0.55, z), {
    roughness: 0.25,
    metalness: 0.08,
  });
  [-0.48, 0.48].forEach((legX) => {
    [-0.22, 0.22].forEach((legZ) => {
      addBox(root, 0.07, 0.42, 0.07, "#4b5563", new THREE.Vector3(x + legX, 0.24, z + legZ), {
        roughness: 0.55,
      });
    });
  });
}

function addTvStand(x, z) {
  addBox(root, 1.6, 0.34, 0.46, "#6f5845", new THREE.Vector3(x, 0.24, z), { roughness: 0.68 });
  const tv = new THREE.Mesh(
    new THREE.BoxGeometry(1.48, 0.84, 0.08),
    new THREE.MeshStandardMaterial({
      color: "#111827",
      roughness: 0.35,
      emissive: "#12213d",
      emissiveIntensity: 0.45,
    }),
  );
  tv.position.set(x, 0.92, z - 0.24);
  tv.castShadow = true;
  root.add(tv);
  addBox(root, 1.18, 0.56, 0.025, "#4f5bd5", new THREE.Vector3(x, 0.92, z - 0.29), {
    emissive: "#4f5bd5",
    emissiveIntensity: 0.28,
    roughness: 0.35,
  });
}

function addFloorLamp(x, z) {
  addBox(root, 0.08, 1.15, 0.08, "#475569", new THREE.Vector3(x, 0.62, z), {
    roughness: 0.45,
  });
  const shade = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.38, 24),
    new THREE.MeshStandardMaterial({
      color: "#fef3c7",
      emissive: "#fde68a",
      emissiveIntensity: 0.42,
      roughness: 0.55,
    }),
  );
  shade.position.set(x, 1.35, z);
  shade.rotation.x = Math.PI;
  shade.castShadow = true;
  root.add(shade);
}

function addBeanBag(x, z) {
  const bean = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 24, 14),
    new THREE.MeshStandardMaterial({ color: "#f97316", roughness: 0.9 }),
  );
  bean.position.set(x, 0.36, z);
  bean.scale.set(1.18, 0.58, 0.95);
  bean.castShadow = true;
  bean.receiveShadow = true;
  root.add(bean);
}

function addPendant(x, y, z, color) {
  addBox(root, 0.035, 0.52, 0.035, "#94a3b8", new THREE.Vector3(x, y + 0.25, z), {
    roughness: 0.45,
  });
  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.3, 0.22, 24),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45,
      roughness: 0.55,
    }),
  );
  lamp.position.set(x, y, z);
  lamp.castShadow = true;
  root.add(lamp);
}

function addFoodModel(name, position, scale = 0.16, rotation = 0) {
  const holder = new THREE.Group();
  holder.position.copy(position);
  holder.rotation.y = rotation;
  holder.scale.setScalar(scale);
  root.add(holder);

  const path = `/office/assets/kenney-food/${name}.glb`;
  const addScene = (asset) => {
    const model = asset.clone(true);
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    holder.add(model);
    loadedAssetNames.add(name);
  };

  if (gltfCache.has(path)) {
    addScene(gltfCache.get(path));
    return holder;
  }

  gltfLoader.load(
    path,
    (gltf) => {
      gltfCache.set(path, gltf.scene);
      addScene(gltf.scene);
    },
    undefined,
    () => {
      addBox(root, 0.16, 0.1, 0.16, "#f59e0b", position.clone(), { roughness: 0.7 });
    },
  );
  return holder;
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
  holder.userData.faceTarget = workStations[agent.slot]?.desk?.clone() || null;
  scene.add(holder);
  agent.group = holder;
  agent.room = "open";
  agent.activity = agent.state === "working" ? "typing" : "focused";

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

  rosterList.appendChild(createRosterRow(teamProfile, {
    active: selectedChatId === "all",
    onClick: selectTeam,
    team: true,
  }));

  agents.forEach((agent, index) => {
    const row = createRosterRow(agent, {
      active: selectedChatId === agentChatId(agent),
      onClick: () => selectAgent(index),
    });
    if (!agent.active) row.style.opacity = "0.45";
    rosterList.appendChild(row);
  });
}

function createRosterRow(item, { active = false, onClick, team = false } = {}) {
  const row = document.createElement("button");
  row.className = `agent-row ${team ? "team-row" : ""} ${active ? "active" : ""}`;
  row.type = "button";
  row.disabled = !item.active;
  row.addEventListener("click", onClick);

  const token = document.createElement("span");
  token.className = `agent-token ${team ? "team-token" : ""}`;
  token.style.setProperty("--agent-color", item.color);
  if (team) {
    agents.slice(0, 4).forEach((agent) => {
      const image = document.createElement("img");
      image.src = agent.avatar;
      image.alt = "";
      token.appendChild(image);
    });
  } else {
    const image = document.createElement("img");
    image.src = item.avatar;
    image.alt = "";
    token.appendChild(image);
  }

  const meta = document.createElement("span");
  meta.className = "agent-meta";
  const name = document.createElement("span");
  name.className = "agent-name";
  name.textContent = item.name;
  const role = document.createElement("span");
  role.className = "agent-role";
  role.textContent = item.role;
  meta.append(name, role);

  const status = document.createElement("span");
  status.className = `status-dot ${colorForState(item.state)}`;
  row.append(token, meta, status);
  return row;
}

function agentChatId(agent) {
  return agent.id;
}

function agentByChatId(chatId) {
  if (chatId === "all") return null;
  return agents.find((agent) => agentChatId(agent) === chatId) || null;
}

function agentByAuthor(author) {
  const mappedId = legacyAuthorToAgentId[author];
  return mappedId ? agentByChatId(mappedId) : agents.find((item) => item.name === author);
}

function chatColor(chatId, author) {
  if (chatId === "user") return "#4f5bd5";
  if (chatId === "all" && author === "Team") return teamProfile.color;
  const agent = agentByChatId(chatId) || agentByAuthor(author);
  return agent?.color || "#4f5bd5";
}

function chatInitial(author) {
  return author === "You" ? "You" : author.slice(0, 1);
}

function chatAvatar(chatId, author) {
  if (chatId === "user") return "";
  if (chatId === "all" && author === "Team") return "";
  const agent = agentByChatId(chatId) || agentByAuthor(author);
  return agent?.avatar || "";
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function maxChatPanelWidth() {
  if (!workspace) return CHAT_WIDTH_MAX;
  const available = workspace.getBoundingClientRect().width - MAIN_WIDTH_MIN - 8;
  return Math.max(CHAT_WIDTH_MIN, Math.min(CHAT_WIDTH_MAX, available));
}

function setChatPanelWidth(value, { persist = false } = {}) {
  if (!workspace) return;
  const width = Math.round(clamp(value, CHAT_WIDTH_MIN, maxChatPanelWidth()));
  workspace.style.setProperty("--chat-panel-width", `${width}px`);
  if (persist) {
    safeStorageSet(CHAT_WIDTH_STORAGE_KEY, String(width));
  }
  resize();
}

function loadChatPanelWidth() {
  const saved = Number.parseInt(safeStorageGet(CHAT_WIDTH_STORAGE_KEY) || "", 10);
  if (Number.isFinite(saved)) {
    setChatPanelWidth(saved);
  }
}

function setupChatResize() {
  if (!workspace || !chatResizeHandle) return;
  loadChatPanelWidth();

  chatResizeHandle.addEventListener("pointerdown", (event) => {
    if (window.matchMedia("(max-width: 1040px)").matches) return;
    event.preventDefault();
    chatResizeHandle.setPointerCapture?.(event.pointerId);
    chatResizeHandle.classList.add("dragging");
    document.body.classList.add("resizing-chat");

    const move = (moveEvent) => {
      const rect = workspace.getBoundingClientRect();
      setChatPanelWidth(rect.right - moveEvent.clientX, { persist: true });
    };
    const stop = () => {
      chatResizeHandle.classList.remove("dragging");
      document.body.classList.remove("resizing-chat");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  });

  chatResizeHandle.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current = Number.parseInt(
      getComputedStyle(workspace).getPropertyValue("--chat-panel-width"),
      10,
    );
    const delta = event.key === "ArrowLeft" ? 24 : -24;
    setChatPanelWidth((Number.isFinite(current) ? current : CHAT_WIDTH_MIN) + delta, {
      persist: true,
    });
  });
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
          author: displayAuthor(String(message.author || "Agent")),
          type: message.type === "user" ? "user" : "agent",
          from: String(message.from || ""),
          text: String(message.text || ""),
          time: String(message.time || ""),
          phase: String(message.phase || ""),
          audience: String(message.audience || ""),
          to: String(message.to || ""),
          isFinal: Boolean(message.isFinal),
          runId: String(message.runId || ""),
          animate: false,
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
    autoPublish: Boolean(value.autoPublish),
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
  if (!chatTarget) return;
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
        ? "Team is ready. Send a task and Atlas will route it."
        : `${agentByChatId(selectedChatId)?.name || "Agent"} is ready.`;
    chatMessages.appendChild(empty);
    scrollChatToBottom();
    return;
  }

  thread.forEach((message) => {
    const row = document.createElement("article");
    row.className = `chat-message ${message.type === "user" ? "user" : "agent"} ${
      message.animate ? "message-enter" : ""
    } ${message.phase ? `phase-${message.phase}` : ""}`;

    const avatar = document.createElement("span");
    avatar.className = "chat-avatar";
    const avatarImage = chatAvatar(message.type === "user" ? "user" : message.from, message.author);
    if (avatarImage) {
      avatar.style.setProperty("--agent-color", chatColor(message.from, message.author));
      const image = document.createElement("img");
      image.src = avatarImage;
      image.alt = "";
      avatar.appendChild(image);
    } else {
      avatar.style.background = chatColor(message.type === "user" ? "user" : message.from, message.author);
      avatar.textContent = chatInitial(message.author);
    }

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
    if (message.animate) {
      window.requestAnimationFrame(() => {
        message.animate = false;
      });
    }
  });

  scrollChatToBottom();
}

function scrollChatToBottom() {
  const scroll = () => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };
  scroll();
  requestAnimationFrame(() => {
    scroll();
    requestAnimationFrame(scroll);
  });
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
  action.disabled = pending.status === "auto_publish_pending" || pending.status === "publishing" || pending.status === "published";
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
  if (status === "auto_publish_pending") return "Auto publishing...";
  if (status === "publishing") return "Publishing...";
  if (status === "published") return "Published";
  if (status === "error") return "Retry publish";
  return "Publish";
}

function appendChatMessage(chatId, message, { save = true } = {}) {
  if (!chatThreads.has(chatId)) {
    chatThreads.set(chatId, []);
  }
  const entry = {
    time: currentChatTime(),
    animate: message.type !== "user",
    ...message,
  };
  chatThreads.get(chatId).push(entry);
  if (save) saveChatState();
  if (chatId === selectedChatId) renderChatMessages();
  return entry;
}

function replaceChatMessage(chatId, current, next, { save = true } = {}) {
  const thread = chatThreads.get(chatId) || [];
  const index = thread.indexOf(current);
  if (index >= 0) {
    thread.splice(index, 1, { time: currentChatTime(), animate: true, ...next });
    if (save) saveChatState();
  }
  if (chatId === selectedChatId) renderChatMessages();
}

function normalizeAgentMessages(result, fallbackChatId) {
  const source = Array.isArray(result.messages) && result.messages.length
    ? result.messages
    : [{ author: agentByChatId(fallbackChatId)?.name || "Atlas", text: result.reply || "" }];

  return source
    .filter((message) => message?.text)
    .map((message) => ({
      author: displayAuthor(message.author || agentByChatId(message.from)?.name || "Atlas"),
      type: "agent",
      from: message.from || fallbackChatId,
      text: message.text,
      phase: message.phase || "",
      audience: message.audience || "",
      to: message.to || "",
      isFinal: Boolean(message.isFinal),
      runId: message.runId || "",
      pendingPublish: normalizePendingPublish(message.pendingPublish),
    }));
}

function displayAuthor(author) {
  return {
    Coordinator: "Atlas",
    Mika: "Ava",
    Dev: "Dex",
    Nova: "Echo",
  }[author] || author;
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
  if (showChat) scrollChatToBottom();
}

async function requestAgentChat(chatId, text) {
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
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function detectUserLanguage(text) {
  const clean = text.trim();
  if (!clean) return "en";
  const cyrillic = (clean.match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (clean.match(/[A-Za-z]/g) || []).length;
  if (latin > cyrillic * 1.5) return "en";
  return "ru";
}

function uiText(key, lang = "ru") {
  const copy = {
    accepted: {
      ru: "Принял задачу. Определяю маршрут команды...",
      en: "Task received. Choosing the team route...",
    },
    directAccepted: {
      ru: "Принял сообщение. Готовлю ответ...",
      en: "Message received. Preparing the reply...",
    },
    teamActivity: {
      ru: "Задача получена в Team-чате.",
      en: "User task received in Team chat.",
    },
    directActivity: {
      ru: "Прямое сообщение получено.",
      en: "Direct message received.",
    },
    empty: {
      ru: "AI вернул пустой ответ.",
      en: "AI returned an empty response.",
    },
  };
  return copy[key]?.[lang] || copy[key]?.ru || key;
}

function messageAgentId(message, fallbackChatId = "coordinator") {
  if (message.from && message.from !== "team" && message.from !== "user") return message.from;
  const mapped = legacyAuthorToAgentId[message.author];
  if (mapped) return mapped;
  return fallbackChatId === "all" ? "coordinator" : fallbackChatId;
}

function phaseActivity(message, chatId) {
  const phase = message.phase || "";
  const agentId = messageAgentId(message, chatId);
  const agent = agentByChatId(agentId) || agents[0];
  if (message.from === "system") {
    return { agent, state: "focused", action: "error", bubble: "Needs attention", detail: message.text };
  }
  if (phase === "routing") {
    return {
      agent,
      state: "working",
      action: "routing",
      bubble: "Routing task",
      detail: "Sets the route, assigns specialists, and frames the next step.",
    };
  }
  if (phase === "internal") {
    return {
      agent,
      state: "working",
      action: message.to ? `to ${displayTargetName(message.to)}` : "reporting",
      bubble: message.to ? `Report to ${displayTargetName(message.to)}` : "Reporting",
      detail: message.text,
    };
  }
  if (phase === "question") {
    return {
      agent,
      state: "focused",
      action: "asking",
      bubble: "Question",
      detail: message.text,
    };
  }
  if (phase === "final" || message.isFinal) {
    return {
      agent,
      state: "happy",
      action: "final",
      bubble: "Final ready",
      detail: "Final answer assembled for the user.",
    };
  }
  return {
    agent,
    state: "focused",
    action: "replying",
    bubble: "Replying",
    detail: message.text,
  };
}

function displayTargetName(target) {
  if (!target || target === "team") return "Team";
  if (target === "coordinator") return "Atlas";
  return agentByChatId(target)?.name || displayAuthor(target);
}

function setAgentLiveState(agent, state, bubble) {
  if (!agent) return;
  agent.state = state;
  agent.bubble = bubble;
  renderRoster();
}

function markTeamAccepted(chatId, text) {
  const lang = detectUserLanguage(text);
  const agent = chatId === "all" ? agentByChatId("coordinator") : agentByChatId(chatId);
  const bubble = chatId === "all" ? "Reading task" : "Reading";
  setAgentLiveState(agent, "working", bubble);
  addActivity(
    agent || agents[0],
    chatId === "all" ? "accepted" : "direct",
    chatId === "all" ? uiText("teamActivity", lang) : uiText("directActivity", lang),
  );
  return appendChatMessage(chatId, {
    author: chatId === "all" ? "Atlas" : agent?.name || "Agent",
    type: "agent",
    from: chatId === "all" ? "coordinator" : chatId,
    phase: "routing",
    audience: "team",
    text: chatId === "all" ? uiText("accepted", lang) : uiText("directAccepted", lang),
  });
}

async function playAgentMessages(chatId, loadingEntry, replies) {
  const first = replies[0] || agentErrorReply(new Error(uiText("empty", "ru")));
  const firstActivity = phaseActivity(first, chatId);
  setAgentLiveState(firstActivity.agent, firstActivity.state, firstActivity.bubble);
  addActivity(firstActivity.agent, firstActivity.action, firstActivity.detail);
  if (loadingEntry) {
    replaceChatMessage(chatId, loadingEntry, first);
  } else {
    appendChatMessage(chatId, first);
  }
  await sleep(520);

  for (const reply of replies.slice(1)) {
    const activity = phaseActivity(reply, chatId);
    setAgentLiveState(activity.agent, activity.state, activity.bubble);
    addActivity(activity.agent, activity.action, activity.detail);
    appendChatMessage(chatId, reply);
    await sleep(reply.phase === "final" ? 220 : 680);
  }
}

async function sendChatMessage(event) {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || chatBusy) return;

  const chatId = selectedChatId;
  chatInput.value = "";
  appendChatMessage(chatId, { author: "You", type: "user", from: "user", text });
  let loading = null;
  if (chatId === "all") {
    loading = markTeamAccepted(chatId, text);
  } else {
    const lang = detectUserLanguage(text);
    const agent = agentByChatId(chatId);
    setAgentLiveState(agent, "working", "Reading");
    addActivity(agent || agents[0], "direct", uiText("directActivity", lang));
  }

  chatBusy = true;
  chatSend.disabled = true;

  try {
    const result = await requestAgentChat(chatId, text);
    const replies = normalizeAgentMessages(result, chatId);
    await playAgentMessages(chatId, loading, replies);
    if (result.pendingPublish?.text) {
      const publishMessage = {
        author: "Echo",
        type: "agent",
        from: "nova",
        phase: "internal",
        to: "coordinator",
        text: result.pendingPublish.autoPublish
          ? "Публикация готова. Echo отправляет ее в Telegram автоматически."
          : "Публикация готова. Проверь текст и нажми Publish, когда можно отправлять в Telegram.",
        pendingPublish: result.pendingPublish,
      };
      const activity = phaseActivity(publishMessage, chatId);
      setAgentLiveState(activity.agent, activity.state, "Publish ready");
      addActivity(
        activity.agent,
        result.pendingPublish.autoPublish ? "auto-publish" : "publish-ready",
        result.pendingPublish.autoPublish
          ? "Sending the approved Telegram text automatically."
          : "Prepared a Telegram publish card for approval.",
      );
      const entry = appendChatMessage(chatId, publishMessage);
      if (result.pendingPublish.autoPublish) {
        await publishPendingMessage(chatId, entry);
      }
    }
  } catch (error) {
    const errorReply = agentErrorReply(error);
    const activity = phaseActivity(errorReply, chatId);
    setAgentLiveState(activity.agent, activity.state, activity.bubble);
    addActivity(activity.agent, activity.action, activity.detail);
    if (loading) {
      replaceChatMessage(chatId, loading, errorReply);
    } else {
      appendChatMessage(chatId, errorReply);
    }
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
      author: "Echo",
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
  if (!agent || !activityFeed) return;
  const item = document.createElement("article");
  item.className = "activity-item";
  item.style.borderLeftColor = agent.color;
  const now = new Date();
  const title = document.createElement("strong");
  title.textContent = `${agent.name} · ${action}`;
  const body = document.createElement("p");
  body.textContent = detail;
  const time = document.createElement("small");
  time.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  item.append(title, body, time);
  activityFeed.prepend(item);
  while (activityFeed.children.length > 12) {
    activityFeed.lastElementChild.remove();
  }
}

function selectTeam() {
  selectedChatId = "all";
  selectedIndex = 0;
  focusName.textContent = "Team";
  teamProfile.state = "focused";
  agents.forEach((agent) => {
    if (agent.state !== "working") {
      agent.state = agent.id === "coordinator" ? "focused" : "idle";
      agent.bubble = agent.id === "coordinator" ? "Team ready" : "Ready";
    }
  });
  saveChatState();
  renderRoster();
  renderChatMessages();
  notifyOfficeSelection("all");
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
  addActivity(agent, "selected", `${agent.name} is now in focus.`);
  renderRoster();
  renderChatTargets();
  renderChatMessages();
  notifyOfficeSelection(agentChatId(agent));
}

function selectAgentById(agentId) {
  if (agentId === "all") {
    setPanelTab("chat");
    selectTeam();
    return true;
  }
  const index = agents.findIndex((agent) => agentChatId(agent) === agentId);
  if (index < 0) return false;
  setPanelTab("chat");
  selectAgent(index);
  return true;
}

function notifyOfficeSelection(agentId) {
  if (!isDashboardEmbed || window.parent === window) return;
  window.parent.postMessage(
    {
      type: "rebly-office-agent-selected",
      agentId,
    },
    window.location.origin,
  );
}

function handleParentMessage(event) {
  if (event.origin !== window.location.origin) return;
  const data = event.data || {};
  if (data.type !== "rebly-office-select-agent") return;
  const agentId = String(data.agentId || "").toLowerCase();
  selectAgentById(agentId);
}

function bubbleForDestination(destination, index) {
  const bubblesForDestination = destination.bubbles || [destination.activity || "Moving"];
  return bubblesForDestination[index % bubblesForDestination.length];
}

function routeToDestination(agent, destination) {
  const targetRoom = destination.room || "open";
  const sourceRoom = agent.room || "open";
  const route = [];

  if (sourceRoom !== targetRoom) {
    if (sourceRoom !== "open" && roomGateways[sourceRoom]) {
      route.push(roomGateways[sourceRoom].clone());
    }
    if (targetRoom !== "open" && roomGateways[targetRoom]) {
      route.push(roomGateways[targetRoom].clone());
    } else if (sourceRoom !== "open") {
      route.push(roomGateways.open.clone());
    }
  }

  route.push(destination.point.clone());
  return route;
}

function applyAgentRoute(agent, route, finalFace, instant = false) {
  if (!agent.group || !route.length) return;
  const target = agent.group.userData.target;
  agent.group.userData.route = [];
  agent.group.userData.faceTarget = finalFace?.clone() || null;

  if (instant) {
    const last = route[route.length - 1];
    agent.group.position.copy(last);
    target.copy(last);
    return;
  }

  const [next, ...rest] = route;
  target.copy(next);
  agent.group.userData.route = rest;
}

function setAgentDestination(agent, destination, options = {}) {
  const index = agents.indexOf(agent);
  const route = routeToDestination(agent, destination);
  agent.room = destination.room || "open";
  agent.activity = destination.kind || "focused";
  agent.destinationId = destination.id || `${agent.room}-${agent.activity}`;
  agent.state = options.state || "focused";
  agent.bubble = options.bubble || bubbleForDestination(destination, Math.max(index, 0));
  applyAgentRoute(agent, route, destination.face || null, options.instant);
}

function workDestination(slotIndex) {
  const normalizedIndex = ((slotIndex % workStations.length) + workStations.length) % workStations.length;
  const station = workStations[normalizedIndex];
  return {
    id: `work-${normalizedIndex}`,
    room: "open",
    kind: "typing",
    point: station.point,
    face: station.desk,
    bubbles: [station.activity],
  };
}

function setAgentTarget(agent, slotIndex, options = {}) {
  const normalizedIndex = ((slotIndex % workStations.length) + workStations.length) % workStations.length;
  agent.slot = normalizedIndex;
  setAgentDestination(agent, workDestination(normalizedIndex), {
    state: options.state || "working",
    bubble: options.bubble,
    instant: options.instant,
  });
}

function pickIdleDestination(agent, index, preferSpread = false) {
  const spread = ["open-whiteboard", "kitchen-coffee", "relax-sofa", "open-plants", "kitchen-table"];
  if (preferSpread) {
    return idleDestinations.find((destination) => destination.id === spread[index % spread.length]);
  }

  const candidates = idleDestinations.filter((destination) => destination.id !== agent.destinationId);
  return candidates[Math.floor(Math.random() * candidates.length)] || idleDestinations[index % idleDestinations.length];
}

function assignIdleDestination(agent, index = agents.indexOf(agent), instant = false) {
  if (!agent.active || teamWorkActive) return;
  const destination = pickIdleDestination(agent, Math.max(index, 0), instant);
  setAgentDestination(agent, destination, {
    state: destination.kind === "rest" ? "idle" : "focused",
    instant,
  });
}

function initializeAgentDestinations() {
  agents.forEach((agent, index) => {
    if (!agent.active) return;
    if (agent.state === "working") {
      setAgentTarget(agent, index, {
        state: "working",
        bubble: agent.bubble || "Working",
        instant: true,
      });
      return;
    }
    assignIdleDestination(agent, index, true);
  });
}

function assignTask(index = selectedIndex) {
  const lead = agents[index];
  if (!lead || !lead.active || teamWorkActive) return;
  const task = tasks[Math.floor(Math.random() * tasks.length)];
  teamWorkActive = true;
  queued = Math.max(0, queued - 1);
  queueCount.textContent = String(queued).padStart(2, "0");

  const supportBubbles = ["Joining", "Researching", "Building", "Checking", "Publishing"];
  agents.forEach((agent, agentIndex) => {
    if (!agent.active) return;
    setAgentTarget(agent, agentIndex, {
      state: "working",
      bubble: agentIndex === index ? task : supportBubbles[agentIndex % supportBubbles.length],
    });
  });

  addActivity(lead, "working", `${task}: team moved to Open Space.`);
  renderRoster();
  window.clearTimeout(teamWorkTimer);

  teamWorkTimer = window.setTimeout(() => {
    agents.forEach((agent, agentIndex) => {
      if (!agent.active) return;
      agent.state = "happy";
      agent.activity = "celebrate";
      agent.bubble = agentIndex === index ? "Done" : "Synced";
    });
    queued += 1;
    queueCount.textContent = String(queued).padStart(2, "0");
    addActivity(lead, "completed", `${task} moved to review.`);
    renderRoster();

    window.setTimeout(() => {
      teamWorkActive = false;
      agents.forEach((agent, agentIndex) => assignIdleDestination(agent, agentIndex));
      renderRoster();
    }, 2400);
  }, 7600);
}

function randomAdjacentSlot(current) {
  const candidates = slots.map((_, index) => index).filter((index) => index !== current);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function shuffleTeam() {
  agents.forEach((agent, index) => {
    if (!agent.active) return;
    agent.state = "focused";
    assignIdleDestination(agent, index);
  });
  addActivity(agents[selectedIndex], "moved", "Agents started roaming between rooms.");
  renderRoster();
}

function celebrateTeam() {
  agents.forEach((agent) => {
    if (!agent.active) return;
    agent.state = "happy";
    agent.activity = "celebrate";
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
    }
    assignIdleDestination(inactive, agents.indexOf(inactive));
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
  camera.position.set(9.8, 8.1, 10.8);
  camera.zoom = 1;
  controls.target.set(0, 0.7, 0.2);
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
  const visibleActivity = ["coffee", "talk", "rest", "read", "screen", "typing", "celebrate"].includes(
    agent.activity,
  );
  element.classList.toggle(
    "visible",
    agent.state === "working" || agent.state === "happy" || agent.state === "focused" || visibleActivity,
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
  const activity = agent.activity || "";
  const coffee = activity === "coffee";
  const talking = activity === "talk";
  const resting = activity === "rest";
  const reading = activity === "read" || activity === "screen";
  const typing = activity === "typing" || working;

  rig.root.rotation.z = happy ? Math.sin(elapsed * 7 + index) * 0.055 : idle * 0.012;
  rig.torso.rotation.z = moving ? gait * 0.035 : idle * 0.018;
  rig.head.rotation.x = typing || reading ? -0.12 + smallGait * 0.035 : idle * 0.035;
  rig.head.rotation.z = happy ? Math.sin(elapsed * 8 + index) * 0.09 : idle * 0.025;

  const stride = moving ? 0.62 : typing ? 0.12 : 0;
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
  } else if (typing) {
    rig.leftArm.rotation.x = -0.48 + smallGait * 0.2;
    rig.rightArm.rotation.x = 0.34 - smallGait * 0.22;
    rig.leftArm.rotation.z = 0.12;
    rig.rightArm.rotation.z = -0.16;
  } else if (coffee) {
    rig.leftArm.rotation.x = -0.08 + idle * 0.08;
    rig.rightArm.rotation.x = -0.86 + smallGait * 0.08;
    rig.leftArm.rotation.z = 0.1;
    rig.rightArm.rotation.z = -0.28;
  } else if (talking) {
    rig.leftArm.rotation.x = -0.22 + smallGait * 0.16;
    rig.rightArm.rotation.x = -0.08 - smallGait * 0.16;
    rig.leftArm.rotation.z = 0.36 + idle * 0.08;
    rig.rightArm.rotation.z = -0.34 - idle * 0.08;
  } else if (resting) {
    rig.leftArm.rotation.x = 0.18 + idle * 0.04;
    rig.rightArm.rotation.x = -0.12 - idle * 0.04;
    rig.leftArm.rotation.z = 0.18;
    rig.rightArm.rotation.z = -0.18;
  } else if (reading) {
    rig.leftArm.rotation.x = -0.42 + idle * 0.04;
    rig.rightArm.rotation.x = -0.36 - idle * 0.04;
    rig.leftArm.rotation.z = 0.16;
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
  } else if (typing || talking || coffee) {
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
    let distanceToTarget = Math.hypot(group.position.x - target.x, group.position.z - target.z);
    if (distanceToTarget < 0.045 && group.userData.route?.length) {
      target.copy(group.userData.route.shift());
      distanceToTarget = Math.hypot(group.position.x - target.x, group.position.z - target.z);
    }
    const moving = travelDistance > 0.001 || distanceToTarget > 0.035;

    const faceTarget = group.userData.faceTarget;
    const desiredAngle = moving
      ? Math.atan2(target.x - group.position.x, target.z - group.position.z)
      : faceTarget
        ? Math.atan2(faceTarget.x - group.position.x, faceTarget.z - group.position.z)
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
  const viewHeight = aspect < 0.9 ? 18.2 : clientWidth < 720 ? 15.8 : 13.4;
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
  roamingTimer = window.setInterval(() => {
    if (teamWorkActive) return;
    agents.forEach((agent, index) => {
      if (!agent.active || Math.random() < 0.48) return;
      assignIdleDestination(agent, index);
    });
    renderRoster();
  }, 6800);

  window.setInterval(() => {
    if (teamWorkActive) return;
    const active = agents
      .map((agent, index) => ({ agent, index }))
      .filter(({ agent }) => agent.active);
    const pick = active[Math.floor(Math.random() * active.length)];
    if (pick) assignTask(pick.index);
  }, 24000);
}

function animate() {
  if (!renderer || !controls) return;
  const delta = Math.min(clockTimer.getDelta(), 0.05);
  const elapsed = clockTimer.elapsedTime;
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
if (selectedChatId === "all") {
  focusName.textContent = "Team";
  agents[0].state = "focused";
  agents[0].bubble = "Team ready";
} else {
  const restoredAgent = agentByChatId(selectedChatId);
  const restoredIndex = agents.findIndex((agent) => agent.id === restoredAgent?.id);
  if (restoredIndex >= 0) {
    selectedIndex = restoredIndex;
    focusName.textContent = restoredAgent.name;
    restoredAgent.state = "focused";
    restoredAgent.bubble = "Focused";
  }
}
if (renderer) {
  initializeAgentDestinations();
}

document.querySelector("#assignBtn").addEventListener("click", () => assignTask());
document.querySelector("#shuffleBtn").addEventListener("click", shuffleTeam);
document.querySelector("#celebrateBtn").addEventListener("click", celebrateTeam);
document.querySelector("#hireBtn").addEventListener("click", hireAgent);
viewBtn.addEventListener("click", resetView);
canvas.addEventListener("click", onCanvasClick);
window.addEventListener("resize", resize);
chatTab.addEventListener("click", () => setPanelTab("chat"));
activityTab.addEventListener("click", () => setPanelTab("activity"));
chatTarget?.addEventListener("change", () => {
  const nextChatId = chatTarget.value;
  if (nextChatId !== "all" && selectAgentById(nextChatId)) {
    return;
  }
  selectTeam();
});
chatComposer.addEventListener("submit", sendChatMessage);

window.addEventListener("message", handleParentMessage);
setupChatResize();
renderRoster();
renderChatTargets();
renderChatMessages();
resolveAccountContext();
addActivity(agents[0], "online", "Team workspace is ready.");
updateClock();
window.setInterval(updateClock, 15000);
resize();
startAutomation();
animate();

window.agentOfficeDebug = {
  agents,
  camera,
  controls,
  renderer,
  scene,
  rooms,
  workStations,
  idleDestinations,
  loadedAssetNames,
  assignTask,
  assignIdleDestination,
  resetView,
};
