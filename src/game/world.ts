import * as THREE from "three";
import type { Medicine, Shelf } from "./types";

/** Shared, reusable geometry/material caches — keeps draw calls and memory low. */
export const geo = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
  sphere: new THREE.SphereGeometry(0.5, 16, 12),
  plane: new THREE.PlaneGeometry(1, 1),
  rbox: new THREE.BoxGeometry(1, 1, 1, 1, 1, 1),
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
const cachedMaterials = new Set<THREE.Material>();
const cachedGeometries = new Set<THREE.BufferGeometry>(Object.values(geo));

/** True when the material/geometry is shared across the whole scene and must
 *  never be disposed while other meshes still reference it. */
export function isShared(res: THREE.Material | THREE.BufferGeometry) {
  return (
    cachedMaterials.has(res as THREE.Material) ||
    cachedGeometries.has(res as THREE.BufferGeometry)
  );
}

export function mat(
  color: string,
  opts: { rough?: number; metal?: number; emissive?: string; opacity?: number; emissiveIntensity?: number } = {},
) {
  const key = `${color}|${opts.rough ?? 0.8}|${opts.metal ?? 0}|${opts.emissive ?? ""}|${opts.opacity ?? 1}|${opts.emissiveIntensity ?? 1}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: opts.rough ?? 0.8,
      metalness: opts.metal ?? 0,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts.emissive ? (opts.emissiveIntensity ?? 1) : 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

export function box(
  w: number,
  h: number,
  d: number,
  color: string,
  opts?: Parameters<typeof mat>[1],
) {
  const m = new THREE.Mesh(geo.box, mat(color, opts));
  m.scale.set(w, h, d);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function cylinder(r: number, h: number, color: string, opts?: Parameters<typeof mat>[1]) {
  const m = new THREE.Mesh(geo.cyl, mat(color, opts));
  m.scale.set(r * 2, h, r * 2);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/* --------------------------------------------------------------- textures */

function roundRect(x: CanvasRenderingContext2D, rx: number, ry: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + w, ry, rx + w, ry + h, r);
  x.arcTo(rx + w, ry + h, rx, ry + h, r);
  x.arcTo(rx, ry + h, rx, ry, r);
  x.arcTo(rx, ry, rx + w, ry, r);
  x.closePath();
}

/** Canvas-based label texture (posters, monitor screens, storefront). */
export function labelTexture(
  text: string,
  sub: string,
  bg: string,
  fg = "#ffffff",
  w = 512,
  h = 128,
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, bg);
  g.addColorStop(1, shade(bg, -0.22));
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  x.fillStyle = "rgba(255,255,255,0.14)";
  x.fillRect(0, h - Math.round(h * 0.08), w, Math.round(h * 0.08));
  x.fillStyle = fg;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `800 ${Math.round(h * 0.4)}px "Cairo", system-ui, sans-serif`;
  x.fillText(text, w / 2, sub ? h * 0.4 : h * 0.5, w - 40);
  if (sub) {
    x.globalAlpha = 0.8;
    x.font = `500 ${Math.round(h * 0.2)}px "Cairo", system-ui, sans-serif`;
    x.fillText(sub, w / 2, h * 0.74, w - 40);
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  const f = amt < 0 ? 1 + amt : 1;
  const add = amt > 0 ? amt : 0;
  return `#${new THREE.Color(
    Math.min(1, c.r * f + add),
    Math.min(1, c.g * f + add),
    Math.min(1, c.b * f + add),
  ).getHexString()}`;
}

/** Fixed shelf sign: rounded card, soft shadow, bold type, category icon.
 *  Mounted on the shelf header — it does NOT rotate with the player. */
export function shelfSign(name: string, category: string, color: string) {
  const W = 640;
  const H = 220;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;

  x.shadowColor = "rgba(8,32,38,0.45)";
  x.shadowBlur = 26;
  x.shadowOffsetY = 10;
  x.fillStyle = "rgba(255,255,255,0.97)";
  roundRect(x, 22, 18, W - 44, H - 52, 40);
  x.fill();
  x.shadowColor = "transparent";

  // color strip
  x.fillStyle = color;
  roundRect(x, 22, 18, 26, H - 52, 14);
  x.fill();

  // icon bubble
  x.fillStyle = color;
  x.beginPath();
  x.arc(W - 92, H / 2 - 8, 42, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#ffffff";
  x.fillRect(W - 100, H / 2 - 28, 16, 40);
  x.fillRect(W - 112, H / 2 - 16, 40, 16);

  x.fillStyle = "#12313a";
  x.textAlign = "right";
  x.textBaseline = "middle";
  x.font = `800 62px "Cairo", system-ui, sans-serif`;
  x.fillText(name, W - 150, H / 2 - 24, W - 260);
  x.globalAlpha = 0.62;
  x.font = `500 34px "Cairo", system-ui, sans-serif`;
  x.fillText(category, W - 150, H / 2 + 32, W - 260);

  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    geo.plane,
    new THREE.MeshBasicMaterial({
      map: t,
      toneMapped: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  mesh.scale.set(1.78, 0.61, 1);
  mesh.renderOrder = 6;
  return mesh;
}

/** Price-tag strip texture running along shelf lips. */
function priceStripTexture(color: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 32;
  const x = c.getContext("2d")!;
  x.fillStyle = color;
  x.fillRect(0, 0, 512, 32);
  x.fillStyle = "rgba(255,255,255,0.92)";
  for (let i = 0; i < 12; i++) x.fillRect(10 + i * 42, 7, 30, 18);
  x.fillStyle = color;
  for (let i = 0; i < 12; i++) {
    x.fillRect(14 + i * 42, 11, 16, 3);
    x.fillRect(14 + i * 42, 17, 22, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft contact shadow blob used under furniture. */
let shadowTex: THREE.Texture | null = null;
export function contactShadow(w: number, d: number, strength = 0.42) {
  if (!shadowTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(20,45,52,0.85)");
    g.addColorStop(0.55, "rgba(20,45,52,0.38)");
    g.addColorStop(1, "rgba(20,45,52,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    geo.plane,
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: strength,
      depthWrite: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, d, 1);
  m.position.y = 0.012;
  return m;
}

export function signPlane(texture: THREE.Texture, w: number, h: number) {
  const m = new THREE.Mesh(
    geo.plane,
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, transparent: true }),
  );
  m.scale.set(w, h, 1);
  return m;
}

/** Dashboard UI drawn on the workstation monitor (with the developer credit). */
export function monitorScreenTexture(items: number, shelves: number) {
  const W = 900;
  const H = 540;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#07242b");
  bg.addColorStop(1, "#0b3a3f");
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  // top bar
  x.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(x, 24, 20, W - 48, 74, 18);
  x.fill();
  x.fillStyle = "#9beedd";
  x.textAlign = "right";
  x.textBaseline = "middle";
  x.font = `800 40px "Cairo", system-ui, sans-serif`;
  x.fillText("نظام إدارة الصيدلية", W - 50, 57);
  x.fillStyle = "#4ad8b8";
  x.beginPath();
  x.arc(70, 57, 11, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "rgba(255,255,255,0.55)";
  x.textAlign = "left";
  x.font = `600 24px "Cairo", system-ui, sans-serif`;
  x.fillText("ONLINE", 92, 59);

  // stat cards
  const cards: [string, string][] = [
    [String(items), "صنف"],
    [String(shelves), "رف"],
    ["2–8°C", "التبريد"],
  ];
  cards.forEach(([v, k], i) => {
    const cw = (W - 48 - 32) / 3;
    const cx0 = 24 + i * (cw + 16);
    x.fillStyle = "rgba(155,238,221,0.10)";
    roundRect(x, cx0, 118, cw, 130, 20);
    x.fill();
    x.fillStyle = "#e9fffa";
    x.textAlign = "center";
    x.font = `800 52px "Cairo", system-ui, sans-serif`;
    x.fillText(v, cx0 + cw / 2, 172);
    x.fillStyle = "rgba(233,255,250,0.6)";
    x.font = `500 24px "Cairo", system-ui, sans-serif`;
    x.fillText(k, cx0 + cw / 2, 218);
  });

  // bar chart
  x.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(x, 24, 268, W - 48, 168, 20);
  x.fill();
  const bars = [0.4, 0.62, 0.5, 0.78, 0.66, 0.9, 0.72];
  bars.forEach((b, i) => {
    const bw = 62;
    const bx = 60 + i * (bw + 42);
    const bh = b * 108;
    const g2 = x.createLinearGradient(0, 420 - bh, 0, 420);
    g2.addColorStop(0, "#6ff0d2");
    g2.addColorStop(1, "#1d8f86");
    x.fillStyle = g2;
    roundRect(x, bx, 420 - bh, bw, bh, 10);
    x.fill();
  });

  // credit strip
  const cg = x.createLinearGradient(24, 0, W - 24, 0);
  cg.addColorStop(0, "rgba(111,240,210,0.28)");
  cg.addColorStop(1, "rgba(111,240,210,0.06)");
  x.fillStyle = cg;
  roundRect(x, 24, 456, W - 48, 62, 18);
  x.fill();
  x.textAlign = "right";
  x.fillStyle = "#bff8ea";
  x.font = `700 30px "Cairo", system-ui, sans-serif`;
  x.fillText("تصميم وتطوير: المهندس أسامة", W - 48, 489);
  x.textAlign = "left";
  x.fillStyle = "rgba(191,248,234,0.55)";
  x.font = `500 22px "Cairo", system-ui, sans-serif`;
  x.fillText("v1.0", 48, 490);

  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Small brushed-metal desk nameplate. */
export function nameplateTexture(text: string, sub: string) {
  const W = 512;
  const H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#2b3a42");
  g.addColorStop(0.5, "#40525b");
  g.addColorStop(1, "#222e34");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(155,238,221,0.5)";
  x.lineWidth = 4;
  roundRect(x, 10, 10, W - 20, H - 20, 12);
  x.stroke();
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillStyle = "#e6fbf5";
  x.font = `800 44px "Cairo", system-ui, sans-serif`;
  x.fillText(text, W / 2, H * 0.42);
  x.fillStyle = "rgba(230,251,245,0.62)";
  x.font = `500 24px "Cairo", system-ui, sans-serif`;
  x.fillText(sub, W / 2, H * 0.74);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fridge digital thermometer face. */
export function fridgeTempTexture(temp: string) {
  const W = 256;
  const H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  x.fillStyle = "#04161a";
  x.fillRect(0, 0, W, H);
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.shadowColor = "#7ff0ff";
  x.shadowBlur = 22;
  x.fillStyle = "#c9f8ff";
  x.font = `800 62px "JetBrains Mono", ui-monospace, monospace`;
  x.fillText(temp, W / 2, H * 0.44);
  x.shadowBlur = 0;
  x.fillStyle = "rgba(201,248,255,0.6)";
  x.font = `600 22px "Cairo", system-ui, sans-serif`;
  x.fillText("تبريد الأدوية", W / 2, H * 0.8);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Large, low-gloss ceramic tiles with subtle roughness variation. */
export function tileTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d")!;
  x.fillStyle = "#eff2f3";
  x.fillRect(0, 0, 512, 512);
  const g = x.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.5, "rgba(223,231,233,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0.85)");
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  // veining
  for (let i = 0; i < 22; i++) {
    x.strokeStyle = `rgba(150,168,174,${0.03 + Math.random() * 0.05})`;
    x.lineWidth = 1 + Math.random() * 2;
    x.beginPath();
    x.moveTo(Math.random() * 512, 0);
    x.bezierCurveTo(Math.random() * 512, 170, Math.random() * 512, 340, Math.random() * 512, 512);
    x.stroke();
  }
  x.strokeStyle = "rgba(146,163,169,0.5)";
  x.lineWidth = 5;
  x.strokeRect(0, 0, 512, 512);
  for (let i = 0; i < 1600; i++) {
    x.fillStyle = `rgba(120,140,145,${Math.random() * 0.04})`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 8); // larger tiles
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Roughness map so the floor isn't a uniform mirror. */
export function floorRoughnessTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  x.fillStyle = "#b4b4b4";
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 150 + Math.random() * 90;
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 8);
  return t;
}

/** Scuff/dirt decal used near the entrance only. */
export function entranceDirt() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(128, 128, 20, 128, 128, 126);
  g.addColorStop(0, "rgba(120,124,118,0.30)");
  g.addColorStop(1, "rgba(120,124,118,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) {
    x.fillStyle = `rgba(96,102,98,${Math.random() * 0.16})`;
    x.beginPath();
    x.arc(40 + Math.random() * 176, 40 + Math.random() * 176, 1 + Math.random() * 6, 0, Math.PI * 2);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(
    geo.plane,
    new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.set(7, 5, 1);
  m.position.set(0, 0.014, 8.2);
  return m;
}

/* ----------------------------------------------------------------- layout */

const SHELF_W = 2.4;
const SHELF_D = 0.66;
const BOARDS = 4;
const BOARD_GAP = 0.5;
const BOARD_Y0 = 0.38;

/**
 * Gondola islands: every island carries TWO independent shelf faces
 * (front + back), each one its own Shelf record. Slots are ordered so that
 * consecutive slots are the two faces of the same island.
 */
const ISLAND_X = [-2.8, -5.4, -8.0, -10.6];
const ISLAND_Z = [4.4, 0.6, -3.2, -7.0];

export const SHELF_SLOTS: { x: number; z: number; rot: number; island: number }[] = (() => {
  const out: { x: number; z: number; rot: number; island: number }[] = [];
  let island = 0;
  for (const z of ISLAND_Z)
    for (const x of ISLAND_X) {
      out.push({ x, z: z + SHELF_D / 2, rot: 0, island }); // faces the +Z aisle
      out.push({ x, z: z - SHELF_D / 2, rot: Math.PI, island }); // faces the -Z aisle
      island++;
    }
  return out;
})();

/** Build one physical shelf unit with its products neatly arranged on a grid. */
export function buildShelf(shelf: Shelf, meds: Medicine[]) {
  const g = new THREE.Group();
  const metal = { rough: 0.36, metal: 0.42 };

  // Contact shadow
  g.add(contactShadow(SHELF_W + 0.7, SHELF_D + 0.8, 0.5));

  // Back panel (perforated look via two-tone slabs)
  const back = box(SHELF_W, 2.28, 0.05, "#dfe7ea", { rough: 0.7 });
  back.position.set(0, 1.2, -SHELF_D / 2 + 0.02);
  g.add(back);
  const backTint = box(SHELF_W - 0.14, 2.1, 0.02, "#eef4f6", { rough: 0.6 });
  backTint.position.set(0, 1.2, -SHELF_D / 2 + 0.05);
  g.add(backTint);

  // Metal uprights with rounded caps + feet
  for (const s of [-1, 1]) {
    const post = box(0.07, 2.3, SHELF_D, "#c9d3d8", { rough: 0.5, metal: 0.15 });
    post.position.set((s * SHELF_W) / 2, 1.2, 0);
    g.add(post);
    const capTop = cylinder(0.045, 0.06, "#c7d0d4", metal);
    capTop.position.set((s * SHELF_W) / 2, 2.36, 0);
    g.add(capTop);
    for (const dz of [-SHELF_D / 2 + 0.08, SHELF_D / 2 - 0.08]) {
      const foot = box(0.14, 0.06, 0.14, "#8f9ba1", metal);
      foot.position.set((s * SHELF_W) / 2, 0.03, dz);
      g.add(foot);
    }
  }

  // Plinth / base
  const base = box(SHELF_W - 0.02, 0.22, SHELF_D + 0.04, "#cfd8dc", { rough: 0.6, metal: 0.25 });
  base.position.set(0, 0.14, 0);
  g.add(base);
  const kick = box(SHELF_W - 0.02, 0.06, SHELF_D + 0.06, shelf.color, { rough: 0.4 });
  kick.position.set(0, 0.05, 0);
  g.add(kick);

  // Boards with varying thickness + price strips + brackets
  const boardYs: number[] = [];
  const strip = priceStripTexture(shelf.color);
  for (let i = 0; i < BOARDS; i++) {
    const y = BOARD_Y0 + i * BOARD_GAP;
    boardYs.push(y);
    const thick = i === 0 ? 0.075 : 0.05;
    const b = box(SHELF_W - 0.12, thick, SHELF_D - 0.02, "#f9fcfd", { rough: 0.4, metal: 0.1 });
    b.position.set(0, y, 0);
    g.add(b);
    // under-board bracket
    const bracket = box(SHELF_W - 0.2, 0.03, 0.05, "#9fabb1", metal);
    bracket.position.set(0, y - thick / 2 - 0.02, -SHELF_D / 2 + 0.1);
    g.add(bracket);
    // price tag strip on the lip
    const lip = new THREE.Mesh(
      geo.box,
      new THREE.MeshStandardMaterial({ map: strip, roughness: 0.45 }),
    );
    lip.scale.set(SHELF_W - 0.12, 0.055, 0.022);
    lip.position.set(0, y + thick / 2 + 0.025, SHELF_D / 2 - 0.02);
    g.add(lip);
  }

  // LED strip under the top cap
  const cap = box(SHELF_W, 0.07, SHELF_D + 0.05, "#e7eef1", { rough: 0.4, metal: 0.2 });
  cap.position.set(0, 2.3, 0);
  g.add(cap);
  const led = box(SHELF_W - 0.24, 0.035, 0.09, "#ffffff", {
    emissive: "#eaf9ff",
    emissiveIntensity: 1.6,
    rough: 0.3,
  });
  led.castShadow = false;
  led.position.set(0, 2.24, SHELF_D / 2 - 0.12);
  g.add(led);

  // Category color strip down both uprights
  for (const s of [-1, 1]) {
    const cstrip = box(0.03, 1.9, 0.03, shelf.color, { rough: 0.35 });
    cstrip.position.set((s * (SHELF_W / 2 - 0.02)), 1.25, SHELF_D / 2 - 0.04);
    g.add(cstrip);
  }

  // Header board
  const header = box(SHELF_W, 0.3, 0.09, shelf.color, { rough: 0.35 });
  header.position.set(0, 2.5, -SHELF_D / 2 + 0.08);
  g.add(header);

  /* ---- products: grid placement, always resting on the board, no overlap */
  const items = meds.filter((m) => m.shelfId === shelf.id);
  const usable = SHELF_W - 0.34;
  const capacity = Math.max(1, shelf.capacity || 40);
  const totalStock = items.reduce((a, m) => a + Math.max(0, m.stock), 0);
  const fillRatio = Math.max(0.25, Math.min(1, totalStock / capacity));

  // build a flat queue of facings, weighted by stock
  const queue: { med: Medicine; variant: number }[] = [];
  for (const med of items) {
    const facings = Math.max(1, Math.min(6, Math.round((med.stock / 8) * 1.2) || 1));
    for (let i = 0; i < facings; i++) queue.push({ med, variant: i });
  }

  let qi = 0;
  for (let row = 0; row < BOARDS && queue.length; row++) {
    const y = boardYs[row]!;
    const perRow = 7;
    const slotW = usable / perRow;
    const filled = Math.max(1, Math.round(perRow * fillRatio));
    for (let col = 0; col < filled; col++) {
      const item = queue[qi % queue.length];
      if (!item) break;
      qi++;
      const x = -usable / 2 + slotW / 2 + col * slotW;
      const expiring = expiryState(item.med.expiry);
      const p = buildProduct(item.med, item.variant + row);
      const scale = 1.3;
      p.scale.setScalar(scale);
      const thick = row === 0 ? 0.075 : 0.05;
      p.position.set(x, y + thick / 2, 0.0);
      p.rotation.y = ((item.variant % 3) - 1) * 0.06 + ((item.variant % 5) - 2) * 0.012;
      tagProduct(p, item.med.id);
      g.add(p);
      if (expiring) {
        const warn = expiryMarker(expiring);
        warn.position.set(x, y + thick / 2 + 0.005, 0.12);
        g.add(warn);
      }
      // depth: a second, slightly lower row behind for visible shelf depth
      if (fillRatio > 0.6) {
        const p2 = buildProduct(item.med, item.variant + row + 1);
        p2.scale.setScalar(scale * 0.94);
        p2.position.set(x, y + thick / 2, -0.18);
        tagProduct(p2, item.med.id);
        g.add(p2);
      }
      if (qi > queue.length * 3) break;
    }
  }

  const label = shelfSign(shelf.name, shelf.category, shelf.color);
  label.position.set(0, 2.52, SHELF_D / 2 + 0.06);
  g.add(label);

  return { group: g, width: SHELF_W, depth: SHELF_D, label };
}

function tagProduct(g: THREE.Object3D, medId: string) {
  g.userData['medId'] = medId;
  g.traverse((o) => (o.userData['medId'] = medId));
}

/** "warn" = expires within 90 days, "expired" = already past date. */
export function expiryState(expiry: string): "warn" | "expired" | null {
  const t = Date.parse(expiry);
  if (Number.isNaN(t)) return null;
  const days = (t - Date.now()) / 86400000;
  if (days < 0) return "expired";
  if (days < 90) return "warn";
  return null;
}

let warnTex: Record<string, THREE.Texture> = {};
function expiryMarker(kind: "warn" | "expired") {
  if (!warnTex[kind]) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const col = kind === "expired" ? "#e04848" : "#e8a52e";
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(32, 6);
    x.lineTo(60, 56);
    x.lineTo(4, 56);
    x.closePath();
    x.fill();
    x.fillStyle = "#ffffff";
    x.fillRect(29, 22, 6, 20);
    x.fillRect(29, 46, 6, 6);
    warnTex[kind] = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    geo.plane,
    new THREE.MeshBasicMaterial({
      map: warnTex[kind],
      transparent: true,
      toneMapped: false,
      depthWrite: false,
      opacity: 0.95,
    }),
  );
  m.scale.set(0.1, 0.1, 1);
  m.renderOrder = 5;
  return m;
}

/** Distinct packaging shapes so products never look like repeated cubes. */
export function buildProduct(med: Medicine, variant = 0) {
  const g = new THREE.Group();
  const c = med.color;
  const light = "#fbfdfd";
  switch (med.pack) {
    case "bottle": {
      const tall = 0.24 + (variant % 3) * 0.02;
      const body = cylinder(0.055, tall, light, { rough: 0.22, metal: 0.05 });
      body.position.y = tall / 2;
      const band = cylinder(0.057, tall * 0.42, c, { rough: 0.5 });
      band.position.y = tall * 0.45;
      const neck = cylinder(0.026, 0.04, light, { rough: 0.3 });
      neck.position.y = tall + 0.02;
      const cap = cylinder(0.032, 0.05, c, { rough: 0.35 });
      cap.position.y = tall + 0.06;
      g.add(body, band, neck, cap);
      break;
    }
    case "tube": {
      const h = 0.26 + (variant % 2) * 0.02;
      const body = box(0.07, h, 0.045, light, { rough: 0.28 });
      body.position.y = h / 2;
      const stripe = box(0.072, h * 0.34, 0.047, c, { rough: 0.4 });
      stripe.position.y = h * 0.32;
      const shoulder = box(0.05, 0.035, 0.04, light, { rough: 0.3 });
      shoulder.position.y = h + 0.017;
      const cap = cylinder(0.021, 0.045, c, { rough: 0.35 });
      cap.position.y = h + 0.055;
      g.add(body, stripe, shoulder, cap);
      break;
    }
    case "jar": {
      const body = cylinder(0.075, 0.18, c, { rough: 0.3, metal: 0.05 });
      body.position.y = 0.09;
      const label = cylinder(0.077, 0.09, light, { rough: 0.6 });
      label.position.y = 0.08;
      const lid = cylinder(0.079, 0.04, "#33434b", { rough: 0.35, metal: 0.2 });
      lid.position.y = 0.2;
      g.add(body, label, lid);
      break;
    }
    case "kit": {
      const body = box(0.21, 0.14, 0.13, "#eef2f4", { rough: 0.42 });
      body.position.y = 0.07;
      const top = box(0.212, 0.032, 0.132, c, { rough: 0.38 });
      top.position.y = 0.155;
      const handle = box(0.07, 0.012, 0.02, "#5c6b72", { rough: 0.4, metal: 0.4 });
      handle.position.y = 0.178;
      g.add(body, top, handle);
      break;
    }
    default: {
      // medicine carton — varied heights and widths, never identical
      const w = 0.095 + (variant % 4) * 0.011;
      const h = 0.17 + (variant % 3) * 0.035;
      const body = box(w, h, 0.05, light, { rough: 0.5 });
      body.position.y = h / 2;
      const band = box(w + 0.002, h * 0.3, 0.052, c, { rough: 0.42 });
      band.position.y = h * 0.66;
      const foot = box(w + 0.002, h * 0.1, 0.052, c, { rough: 0.42 });
      foot.position.y = h * 0.12;
      const dot = box(w * 0.3, h * 0.1, 0.053, "#2c3b42", { rough: 0.6 });
      dot.position.y = h * 0.4;
      g.add(body, band, foot, dot);
    }
  }
  return g;
}
