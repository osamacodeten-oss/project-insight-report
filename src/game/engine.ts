import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Medicine, Shelf } from "./types";
import {
  SHELF_SLOTS,
  box,
  buildShelf,
  buildProduct,
  contactShadow,
  cylinder,
  entranceDirt,
  floorRoughnessTexture,
  fridgeTempTexture,
  labelTexture,
  mat,
  monitorScreenTexture,
  nameplateTexture,
  signPlane,
  tileTexture,
} from "./world";

export interface Focus {
  kind: "computer" | "shelf" | "fridge" | "door" | "counter" | "storedoor" | "storage";
  label: string;
  id?: string;
  medId?: string;
}

interface Collider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Half-extents of the sales floor (expanded ~1.5x). */
export const HW = 13; // x: -13 .. 13  (26 m wide)
export const HD = 10; // z: -10 .. 10 (20 m deep)
const ROOM = { minX: -HW, maxX: HW, minZ: -HD, maxZ: HD };
const EYE = 1.62;

export class PharmacyEngine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  clock = new THREE.Clock();

  private colliders: Collider[] = [];
  private shelfGroups = new Map<string, THREE.Group>();
  private shelfLabels: { sprite: THREE.Mesh; group: THREE.Group }[] = [];
  private interactables: { obj: THREE.Object3D; focus: Focus }[] = [];
  private doorL?: THREE.Mesh;
  private doorR?: THREE.Mesh;
  private doorOpen = 0;
  private ledClock?: { mesh: THREE.Mesh; text: string };
  private monitorGlow?: THREE.PointLight;
  private monitorScreen?: THREE.Mesh;
  private statItems = 0;
  private statShelves = 0;
  private fridgeStock?: THREE.Group;
  private fridgeDoor?: THREE.Group;
  private fridgeOpen = 0;
  private storeDoor?: THREE.Group;
  private storeOpen = 0;
  private storeTarget = 0;
  private storeRacks?: THREE.Group;
  private storeLevels: THREE.Vector3[] = [];
  private acLed?: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private highlight: THREE.Object3D | undefined = undefined;
  private highlightBase = new THREE.Vector3();
  private highlightT = 0;

  pos = new THREE.Vector3(0, EYE, 5);
  vel = new THREE.Vector3();
  private _yaw = Math.PI;
  private _pitch = 0;
  private yawTarget = Math.PI;
  private pitchTarget = 0;
  move = { x: 0, y: 0 };
  running = false;
  sensitivity = 1;
  paused = false;
  onFocus?: (f: Focus | null) => void;
  onStep?: () => void;
  onDoor?: () => void;

  get yaw() {
    return this._yaw;
  }
  set yaw(v: number) {
    this._yaw = v;
    this.yawTarget = v;
  }
  get pitch() {
    return this._pitch;
  }
  set pitch(v: number) {
    this._pitch = v;
    this.pitchTarget = v;
  }

  private stepPhase = 0;
  private bob = 0;
  private roll = 0;
  private yawVel = 0;
  private lastYaw = Math.PI;
  private fov = 62;
  private focus: Focus | null = null;
  private frameId = 0;
  private ro?: ResizeObserver;
  private t = 0;

  constructor(private canvas: HTMLCanvasElement, quality: "low" | "medium" | "high") {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== "low",
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: false,
    });
    // phones lie about devicePixelRatio (often 3-4x) — rendering above ~1.75x
    // costs a lot of fill rate for no visible gain on a 5-6" screen.
    const coarse =
      typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    const dpr = quality === "high" ? (coarse ? 1.75 : 2) : quality === "medium" ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dpr));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.enabled = quality !== "low";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.quality = quality;


    this.camera = new THREE.PerspectiveCamera(this.fov, 1, 0.05, 120);
    this.scene.background = new THREE.Color("#dfecf3");
    this.scene.fog = new THREE.Fog("#dfecf3", 34, 78);

    // image-based lighting so metals/glass read correctly instead of going black
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();

    this.buildEnvironment();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
  }

  /* ---------------------------------------------------------------- world */

  private addCollider(x: number, z: number, w: number, d: number) {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  private buildEnvironment() {
    const s = this.scene;

    /* ---- lighting: warm indoor + cool ambient + window sun */
    s.add(new THREE.HemisphereLight(0xf3fbff, 0xbcc9cd, 0.55));
    s.add(new THREE.AmbientLight(0xffffff, 0.18));

    const sun = new THREE.DirectionalLight(0xffeedd, 0.85);
    sun.position.set(6, 13, 19);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0009;
    s.add(sun);

    // bounce / indirect fill from the floor
    const bounce = new THREE.DirectionalLight(0xdfeef2, 0.22);
    bounce.position.set(-6, -4, -6);
    s.add(bounce);

    // ceiling panel lights with slight intensity variation
    const panelZ = [-8, -4, 0, 4, 8];
    const panelX = [-11, -7.4, -3.8, 0, 3.8, 7.4, 11];
    let li = 0;
    for (const px of [-9.5, -3.5, 3.5, 9.5])
      for (const pz of [-6.5, -1, 4.5, 8.5]) {
        li++;
        const warm = li % 3 === 0;
        const l = new THREE.PointLight(warm ? 0xffe9cf : 0xeaf6ff, warm ? 5.6 : 6.8, 12, 2);
        l.position.set(px, 3.1, pz);
        s.add(l);
      }

    /* ---- linear neon tubes running the length of each aisle */
    for (const az of [-7, -3.2, 0.6, 4.4, 8]) {
      const housing = box(11.4, 0.09, 0.2, "#e6edef", { rough: 0.5, metal: 0.25 });
      housing.position.set(-6.4, 3.22, az);
      housing.castShadow = false;
      s.add(housing);
      const tube = box(11.1, 0.05, 0.12, "#ffffff", {
        emissive: "#e9f8ff",
        emissiveIntensity: 2.1,
        rough: 0.25,
      });
      tube.position.set(-6.4, 3.15, az);
      tube.castShadow = false;
      s.add(tube);
      if (az !== 8 && az !== -7) {
        const glow = new THREE.PointLight(0xe8f6ff, 2.6, 9, 2);
        glow.position.set(-6.4, 3.0, az);
        s.add(glow);
      }
    }

    /* ---- floor */
    const floorMat = new THREE.MeshStandardMaterial({
      map: tileTexture(),
      roughnessMap: floorRoughnessTexture(),
      roughness: 0.86,
      metalness: 0.0,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HD * 2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    s.add(entranceDirt());

    // entrance walk-off mat
    const matDeco = box(3.4, 0.02, 1.6, "#17564f", { rough: 0.95 });
    matDeco.position.set(0, 0.02, 8.9);
    s.add(matDeco);

    // Outside ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat("#9fb2ae", { rough: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    s.add(ground);
    const pavement = box(30, 0.04, 10, "#c9cfcd", { rough: 1 });
    pavement.position.set(0, 0, 15);
    s.add(pavement);

    /* ---- ceiling with panels, vents, detectors */
    const ceiling = box(HW * 2, 0.14, HD * 2, "#f4f8f9", { rough: 0.95 });
    ceiling.position.set(0, 3.42, 0);
    s.add(ceiling);
    // panel grid lines
    for (let i = -6; i <= 6; i++) {
      const t1 = box(0.06, 0.03, HD * 2, "#dde5e8", { rough: 0.8 });
      t1.position.set(i * 2, 3.34, 0);
      t1.castShadow = false;
      s.add(t1);
    }
    for (let j = -4; j <= 4; j++) {
      const t2 = box(HW * 2, 0.03, 0.06, "#dde5e8", { rough: 0.8 });
      t2.position.set(0, 3.34, j * 2);
      t2.castShadow = false;
      s.add(t2);
    }
    for (const px of panelX)
      for (const pz of panelZ) {
        const panel = box(1.9, 0.05, 0.55, "#ffffff", { emissive: "#eaf7ff", emissiveIntensity: 1.4 });
        panel.position.set(px, 3.31, pz);
        panel.castShadow = false;
        s.add(panel);
        const bezel = box(2.02, 0.04, 0.66, "#cfd9dd", { rough: 0.6 });
        bezel.position.set(px, 3.335, pz);
        bezel.castShadow = false;
        s.add(bezel);
      }
    // AC vents
    for (const [vx, vz] of [
      [-8.4, 5.2],
      [-8.4, -5.2],
      [7.4, -5.2],
      [7.4, 5.2],
      [0, 0],
    ] as [number, number][]) {
      const vent = box(1.1, 0.05, 0.6, "#e3eaec", { rough: 0.7 });
      vent.position.set(vx, 3.3, vz);
      vent.castShadow = false;
      s.add(vent);
      for (let i = 0; i < 5; i++) {
        const slat = box(1.0, 0.02, 0.05, "#b9c4c8", { rough: 0.6 });
        slat.position.set(vx, 3.27, vz - 0.22 + i * 0.11);
        slat.castShadow = false;
        s.add(slat);
      }
    }
    // smoke detector + fire alarm
    const det = cylinder(0.11, 0.05, "#f2f5f6", { rough: 0.6 });
    det.position.set(-3.0, 3.28, -2.0);
    s.add(det);
    this.acLed = box(0.03, 0.02, 0.03, "#ff4d4d", { emissive: "#ff2b2b", emissiveIntensity: 2 });
    this.acLed.position.set(-3.0, 3.25, -1.93);
    s.add(this.acLed);
    const alarm = box(0.2, 0.26, 0.1, "#d3372c", { rough: 0.5 });
    alarm.position.set(HW - 0.25, 2.35, 2.0);
    s.add(alarm);

    /* ---- walls with trims */
    const wallMat = "#eef4f5";
    const wallH = 3.4;
    const addTrims = (
      x: number,
      z: number,
      w: number,
      d: number,
      rotY: number,
    ) => {
      const ceilTrim = box(w, 0.16, d + 0.12, "#dfe8ea", { rough: 0.7 });
      ceilTrim.position.set(x, 3.2, z);
      ceilTrim.rotation.y = rotY;
      s.add(ceilTrim);
      const dado = box(w, 0.1, d + 0.14, "#17564f", { rough: 0.5 });
      dado.position.set(x, 1.05, z);
      dado.rotation.y = rotY;
      s.add(dado);
      const skirting = box(w, 0.14, d + 0.14, "#c9d5d8", { rough: 0.7 });
      skirting.position.set(x, 0.07, z);
      skirting.rotation.y = rotY;
      s.add(skirting);
    };

    const back = box(HW * 2, wallH, 0.2, wallMat, { rough: 0.9 });
    back.position.set(0, wallH / 2, -HD);
    s.add(back);
    addTrims(0, -HD + 0.1, HW * 2, 0.2, 0);
    this.addCollider(0, -HD, HW * 2, 0.6);
    for (const sx of [-1, 1]) {
      const w = box(0.2, wallH, HD * 2, wallMat, { rough: 0.9 });
      w.position.set(sx * HW, wallH / 2, 0);
      s.add(w);
      addTrims(sx * (HW - 0.1), 0, 0.2, HD * 2, 0);
      this.addCollider(sx * HW, 0, 0.6, HD * 2);
    }

    // Front wall glass + entrance gap
    for (const seg of [
      { x: -7.4, w: 11.2 },
      { x: 7.4, w: 11.2 },
    ]) {
      const glass = box(seg.w, 2.7, 0.08, "#c9e8ee", { rough: 0.06, metal: 0.1, opacity: 0.28 });
      glass.position.set(seg.x, 1.5, HD);
      glass.castShadow = false;
      s.add(glass);
      const frameTop = box(seg.w, 0.3, 0.16, "#3f5158", { rough: 0.35, metal: 0.6 });
      frameTop.position.set(seg.x, 3.0, HD);
      s.add(frameTop);
      const frameBot = box(seg.w, 0.16, 0.18, "#3f5158", { rough: 0.35, metal: 0.6 });
      frameBot.position.set(seg.x, 0.08, HD);
      s.add(frameBot);
      for (const off of [-3.6, -1.8, 0, 1.8, 3.6]) {
        const mullion = box(0.07, 2.7, 0.14, "#3f5158", { rough: 0.35, metal: 0.6 });
        mullion.position.set(seg.x + off, 1.5, HD);
        s.add(mullion);
      }
      this.addCollider(seg.x, HD, seg.w, 0.5);
    }

    // Storefront sign
    const signBoard = box(11.0, 1.6, 0.2, "#0e5f5a", { rough: 0.5 });
    signBoard.position.set(0, 4.05, HD + 0.05);
    s.add(signBoard);
    const sign = signPlane(
      labelTexture("صيدلية النور", "PHARMACY  •  24H", "#12706a", "#ffffff", 1024, 200),
      10.2,
      1.28,
    );
    sign.position.set(0, 4.05, HD + 0.16);
    s.add(sign);
    const cross = box(0.9, 0.28, 0.1, "#4ade9a", { emissive: "#2fd39a", emissiveIntensity: 1.5 });
    cross.position.set(-6.6, 4.05, HD + 0.2);
    s.add(cross);
    const cross2 = box(0.28, 0.9, 0.1, "#4ade9a", { emissive: "#2fd39a", emissiveIntensity: 1.5 });
    cross2.position.set(-6.6, 4.05, HD + 0.2);
    s.add(cross2);

    // Automatic sliding glass door
    const doorMatOpts = { rough: 0.05, metal: 0.15, opacity: 0.34 };
    this.doorL = box(1.6, 2.7, 0.07, "#d7f1f4", doorMatOpts);
    this.doorL.position.set(-0.82, 1.4, HD);
    this.doorL.castShadow = false;
    this.doorR = box(1.6, 2.7, 0.07, "#d7f1f4", doorMatOpts);
    this.doorR.position.set(0.82, 1.4, HD);
    this.doorR.castShadow = false;
    s.add(this.doorL, this.doorR);
    const lintel = box(3.6, 0.4, 0.2, "#3f5158", { rough: 0.35, metal: 0.6 });
    lintel.position.set(0, 3.0, HD);
    s.add(lintel);
    this.interactables.push({
      obj: this.doorL,
      focus: { kind: "door", label: "الباب الأوتوماتيكي" },
    });

    this.buildCounter();
    this.buildSignage();
    this.buildDecor();
  }

  /* -------------------------------------------------------------- counter */

  private buildCounter() {
    const s = this.scene;
    // reception + cashier desk sits right next to the entrance
    const cx = 10.2;
    const cz = 6.4;
    const bx = cx - 1.4;

    const counterShadow = contactShadow(7.2, 2.0, 0.45);
    counterShadow.position.set(bx, 0.012, cz);
    s.add(counterShadow);

    const body = box(6.2, 1.0, 0.9, "#f2f6f7", { rough: 0.38 });
    body.position.set(bx, 0.5, cz);
    s.add(body);
    const accent = box(6.24, 0.14, 0.94, "#12706a", { rough: 0.35 });
    accent.position.set(bx, 0.2, cz);
    s.add(accent);
    const glassPanel = box(6.0, 0.5, 0.03, "#cfeaee", { rough: 0.06, opacity: 0.3 });
    glassPanel.position.set(bx, 0.72, cz + 0.47);
    glassPanel.castShadow = false;
    s.add(glassPanel);
    const top = box(6.5, 0.09, 1.12, "#28373e", { rough: 0.28, metal: 0.25 });
    top.position.set(bx, 1.05, cz);
    s.add(top);
    this.addCollider(bx, cz, 6.5, 1.2);
    this.interactables.push({ obj: top, focus: { kind: "counter", label: "طاولة الاستقبال" } });

    /* computer workstation — slim-bezel monitor on a brushed arm */
    const ws = new THREE.Group();
    ws.position.set(cx, 0, cz);
    ws.rotation.y = -0.35;
    s.add(ws);

    const standBase = cylinder(0.15, 0.022, "#26343b", { metal: 0.85, rough: 0.24 });
    standBase.position.set(0, 1.105, -0.14);
    ws.add(standBase);
    const neck = box(0.05, 0.34, 0.06, "#31424a", { metal: 0.8, rough: 0.26 });
    neck.position.set(0, 1.28, -0.14);
    ws.add(neck);
    const hinge = cylinder(0.035, 0.07, "#3c4f58", { metal: 0.9, rough: 0.2 });
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0, 1.45, -0.14);
    ws.add(hinge);

    // chassis (back shell) + thin bezel frame
    const chassis = box(0.98, 0.6, 0.035, "#161f24", { rough: 0.42, metal: 0.3 });
    chassis.position.set(0, 1.75, -0.145);
    ws.add(chassis);
    const bezel = box(1.0, 0.62, 0.012, "#0e1518", { rough: 0.35, metal: 0.4 });
    bezel.position.set(0, 1.75, -0.126);
    ws.add(bezel);
    const monitor = box(0.94, 0.56, 0.006, "#050b0d", { rough: 0.2 });
    monitor.position.set(0, 1.755, -0.119);
    ws.add(monitor);
    const screenTex = monitorScreenTexture(
      this.statItems,
      this.statShelves,
    );
    const screen = signPlane(screenTex, 0.92, 0.545);
    screen.position.set(0, 1.755, -0.114);
    ws.add(screen);
    this.monitorScreen = screen as THREE.Mesh;
    // soft screen bloom plane
    const bloom = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 0.85),
      new THREE.MeshBasicMaterial({
        color: 0x7fe6d6,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
    );
    bloom.position.set(0, 1.755, -0.1);
    ws.add(bloom);
    this.monitorGlow = new THREE.PointLight(0x8fe8dd, 2.6, 3.4, 2);
    this.monitorGlow.position.set(0, 1.72, 0.22);
    ws.add(this.monitorGlow);
    this.interactables.push({ obj: chassis, focus: { kind: "computer", label: "جهاز الإدارة" } });
    this.interactables.push({ obj: monitor, focus: { kind: "computer", label: "جهاز الإدارة" } });

    // desk nameplate — the engineer's credit
    const plateStand = box(0.42, 0.02, 0.1, "#26343b", { metal: 0.8, rough: 0.3 });
    plateStand.position.set(cx + 1.5, 1.11, cz + 0.16);
    s.add(plateStand);
    const plate = box(0.42, 0.14, 0.02, "#2b3a42", { metal: 0.7, rough: 0.3 });
    plate.position.set(cx + 1.5, 1.19, cz + 0.14);
    plate.rotation.x = -0.22;
    s.add(plate);
    const plateFace = signPlane(nameplateTexture("م. أسامة", "مطوّر ومصمم الصيدلية"), 0.4, 0.12);
    plateFace.position.set(cx + 1.5, 1.19, cz + 0.152);
    plateFace.rotation.x = -0.22;
    s.add(plateFace);

    const keyboard = box(0.56, 0.025, 0.19, "#e9eef0", { rough: 0.55 });
    keyboard.position.set(cx + 0.05, 1.1, cz + 0.3);
    keyboard.rotation.y = -0.2;
    s.add(keyboard);
    const keys = box(0.5, 0.012, 0.14, "#c3ccd0", { rough: 0.7 });
    keys.position.set(cx + 0.05, 1.118, cz + 0.3);
    keys.rotation.y = -0.2;
    s.add(keys);
    const mouse = box(0.07, 0.028, 0.11, "#e9eef0", { rough: 0.55 });
    mouse.position.set(cx + 0.48, 1.104, cz + 0.32);
    s.add(mouse);

    // desk lamp
    const lampBase = cylinder(0.08, 0.03, "#2f7f78", { rough: 0.4, metal: 0.3 });
    lampBase.position.set(cx + 0.85, 1.11, cz - 0.2);
    s.add(lampBase);
    const lampArm = box(0.03, 0.42, 0.03, "#2f7f78", { rough: 0.4, metal: 0.3 });
    lampArm.position.set(cx + 0.85, 1.32, cz - 0.2);
    lampArm.rotation.z = 0.18;
    s.add(lampArm);
    const lampHead = cylinder(0.08, 0.1, "#2f7f78", { rough: 0.4 });
    lampHead.position.set(cx + 0.77, 1.55, cz - 0.2);
    lampHead.rotation.z = 0.6;
    s.add(lampHead);
    const lampLight = new THREE.PointLight(0xffd9a0, 2.4, 2.4, 2);
    lampLight.position.set(cx + 0.72, 1.42, cz - 0.1);
    s.add(lampLight);

    // coffee mug, pen holder, sticky notes
    const mug = cylinder(0.045, 0.1, "#ffffff", { rough: 0.35 });
    mug.position.set(cx - 0.5, 1.15, cz + 0.34);
    s.add(mug);
    const mugBand = cylinder(0.047, 0.035, "#e0607e", { rough: 0.4 });
    mugBand.position.set(cx - 0.5, 1.16, cz + 0.34);
    s.add(mugBand);
    const holder = cylinder(0.05, 0.11, "#39474e", { rough: 0.5 });
    holder.position.set(cx + 1.05, 1.155, cz + 0.28);
    s.add(holder);
    for (let i = 0; i < 3; i++) {
      const pen = cylinder(0.008, 0.18, ["#2fb59c", "#3d7ef0", "#f0a13d"][i]!, { rough: 0.4 });
      pen.position.set(cx + 1.03 + i * 0.022, 1.25, cz + 0.28);
      pen.rotation.z = (i - 1) * 0.12;
      s.add(pen);
    }
    for (let i = 0; i < 3; i++) {
      const note = box(0.1, 0.001, 0.1, ["#ffe27a", "#a8f0c6", "#ffc0cb"][i]!, { rough: 0.9 });
      note.position.set(cx - 1.25 + i * 0.13, 1.101, cz + 0.28);
      note.rotation.y = (i - 1) * 0.2;
      s.add(note);
    }

    // receipt printer
    const printer = box(0.34, 0.24, 0.3, "#e2e9eb", { rough: 0.55 });
    printer.position.set(cx - 0.9, 1.22, cz - 0.12);
    s.add(printer);
    const paper = box(0.24, 0.012, 0.16, "#ffffff", { rough: 0.9 });
    paper.position.set(cx - 0.9, 1.35, cz + 0.05);
    paper.rotation.x = 0.1;
    s.add(paper);

    // cash register
    const reg = box(0.44, 0.22, 0.36, "#354349", { rough: 0.45 });
    reg.position.set(cx - 2.7, 1.21, cz);
    s.add(reg);
    const regKeys = box(0.34, 0.02, 0.2, "#586970", { rough: 0.7 });
    regKeys.position.set(cx - 2.7, 1.33, cz + 0.06);
    s.add(regKeys);
    const regScreen = box(0.3, 0.17, 0.02, "#0f3b36", { emissive: "#1c9e86", emissiveIntensity: 1.6 });
    regScreen.position.set(cx - 2.7, 1.42, cz - 0.06);
    regScreen.rotation.x = -0.25;
    s.add(regScreen);

    // medicine bags + customer basket
    for (let i = 0; i < 3; i++) {
      const bag = box(0.18, 0.24, 0.1, "#f6f2e6", { rough: 0.85 });
      bag.position.set(cx - 3.6 - i * 0.24, 1.22, cz - 0.1 + (i % 2) * 0.12);
      bag.rotation.y = (i - 1) * 0.25;
      s.add(bag);
      const bagCross = box(0.06, 0.02, 0.101, "#2fb59c", { rough: 0.5 });
      bagCross.position.set(bag.position.x, 1.28, bag.position.z + 0.055);
      s.add(bagCross);
    }
    const basket = box(0.42, 0.2, 0.3, "#2fb59c", { rough: 0.6 });
    basket.position.set(cx - 4.4, 1.15, cz + 0.2);
    s.add(basket);
    const basketRim = box(0.44, 0.03, 0.32, "#1d8f7c", { rough: 0.5 });
    basketRim.position.set(cx - 4.4, 1.26, cz + 0.2);
    s.add(basketRim);

    // queue guide posts in front of the counter
    for (const qx of [cx - 3.4, cx - 1.6]) {
      const post = cylinder(0.05, 0.95, "#8f9ba1", { metal: 0.7, rough: 0.3 });
      post.position.set(qx, 0.475, cz + 1.9);
      s.add(post);
      const cap = cylinder(0.06, 0.06, "#12706a", { rough: 0.4 });
      cap.position.set(qx, 0.98, cz + 1.9);
      s.add(cap);
    }
  }

  /* ------------------------------------------------------------- signage */

  private buildSignage() {
    const s = this.scene;

    const wallSign = (
      title: string,
      sub: string,
      color: string,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      rotY = 0,
    ) => {
      const frame = box(w + 0.08, h + 0.08, 0.05, "#ffffff", { rough: 0.6 });
      frame.position.set(x, y, z);
      frame.rotation.y = rotY;
      s.add(frame);
      const face = signPlane(labelTexture(title, sub, color, "#ffffff", 640, 400), w, h);
      const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
      face.position.set(x + n.x * 0.032, y, z + n.z * 0.032);
      face.rotation.y = rotY;
      s.add(face);
    };

    // Framed health posters + advertising boards on the back wall
    wallSign("صحتك أولاً", "استشر الصيدلي", "#1f7a8c", -4.4, 2.05, -9.86, 1.7, 1.1);
    wallSign("فيتامينات", "خصم ٢٠٪ هذا الأسبوع", "#2f9e6f", -0.6, 2.05, -9.86, 1.7, 1.1);
    wallSign("اغسل يديك", "وقاية يومية", "#c2703d", -8.0, 2.05, -9.86, 1.5, 1.0);
    wallSign("عناية بالبشرة", "منتجات أصلية", "#e0607e", -11.4, 2.45, -9.86, 1.4, 0.95);

    // reception guidance signs near the entrance
    const recRod = box(0.02, 0.5, 0.02, "#9fabb1", { metal: 0.6, rough: 0.3 });
    recRod.position.set(8.8, 3.0, 6.4);
    s.add(recRod);
    const recPlate = box(2.6, 0.44, 0.06, "#0e5f5a", { rough: 0.4 });
    recPlate.position.set(8.8, 2.68, 6.4);
    s.add(recPlate);
    for (const side of [1, -1]) {
      const recFace = signPlane(
        labelTexture("الاستقبال والمحاسبة", "RECEPTION", "#0e5f5a", "#ffffff", 768, 180),
        2.46,
        0.4,
      );
      recFace.position.set(8.8, 2.68, 6.4 + side * 0.036);
      if (side === -1) recFace.rotation.y = Math.PI;
      s.add(recFace);
    }
    const waitSign = signPlane(
      labelTexture("منطقة الانتظار", "WAITING AREA", "#2f7f78", "#ffffff", 640, 220),
      1.5,
      0.52,
    );
    waitSign.position.set(HW - 0.2, 2.2, 8.4);
    waitSign.rotation.y = -Math.PI / 2;
    s.add(waitSign);

    // Department signs on the side wall (readable from the aisles)
    const dept: [string, string, number][] = [
      ["الأدوية", "Medicines", -7.0],
      ["الفيتامينات", "Vitamins", -3.2],
      ["التجميل", "Beauty", 0.6],
      ["المعدات الطبية", "Devices", 4.4],
      ["عناية الطفل", "Baby Care", 8.0],
    ];
    for (const [t, sub, z] of dept) {
      const panel = box(0.06, 0.52, 1.5, "#12706a", { rough: 0.4 });
      panel.position.set(-HW + 0.15, 2.75, z);
      s.add(panel);
      const face = signPlane(labelTexture(t, sub, "#12706a", "#ffffff", 640, 220), 1.42, 0.46);
      face.position.set(-HW + 0.2, 2.75, z);
      face.rotation.y = Math.PI / 2;
      s.add(face);
    }

    // Pharmacy logo on interior wall
    const logoBg = box(1.9, 1.0, 0.05, "#ffffff", { rough: 0.5 });
    logoBg.position.set(0.8, 2.9, -9.86);
    s.add(logoBg);
    const logoFace = signPlane(labelTexture("صيدلية النور", "AL-NOOR PHARMACY", "#0e5f5a", "#ffffff", 640, 300), 1.8, 0.9);
    logoFace.position.set(0.8, 2.9, -9.82);
    s.add(logoFace);

    // Exit + emergency signage
    const exitSign = signPlane(labelTexture("مخرج", "EXIT", "#1f8f4d", "#ffffff", 512, 200), 0.86, 0.32);
    exitSign.position.set(HW - 0.18, 2.72, 7.6);
    exitSign.rotation.y = -Math.PI / 2;
    s.add(exitSign);
    const exitBox = box(0.05, 0.38, 0.92, "#14803f", { emissive: "#1fa254", emissiveIntensity: 1.2 });
    exitBox.position.set(HW - 0.14, 2.72, 7.6);
    s.add(exitBox);

    const emerg = signPlane(labelTexture("طوارئ ٩٩٧", "EMERGENCY", "#c0392b", "#ffffff", 512, 200), 0.86, 0.32);
    emerg.position.set(HW - 0.18, 2.1, 3.4);
    emerg.rotation.y = -Math.PI / 2;
    s.add(emerg);

    // Hanging aisle direction signs above the walkways
    const aisles: [string, number][] = [
      ["ممر ١ • أدوية", -5.1],
      ["ممر ٢ • فيتامينات", -1.3],
      ["ممر ٣ • عناية وتجميل", 2.5],
      ["ممر ٤ • معدات وأطفال", 6.3],
    ];
    for (const [t, z] of aisles) {
      const rod = box(0.02, 0.42, 0.02, "#9fabb1", { metal: 0.6, rough: 0.3 });
      rod.position.set(-6.4, 3.05, z);
      s.add(rod);
      const plate = box(2.2, 0.34, 0.05, "#0e5f5a", { rough: 0.4 });
      plate.position.set(-6.4, 2.72, z);
      s.add(plate);
      for (const side of [1, -1]) {
        const face = signPlane(labelTexture(t, "", "#0e5f5a", "#ffffff", 640, 120), 2.1, 0.3);
        face.position.set(-6.4, 2.72, z + side * 0.031);
        if (side === -1) face.rotation.y = Math.PI;
        s.add(face);
      }
    }

    /* ---- digital LED wall clock */
    const clockBody = box(1.3, 0.5, 0.09, "#16232a", { rough: 0.45, metal: 0.2 });
    clockBody.position.set(3.1, 2.62, -9.85);
    s.add(clockBody);
    const bezel = box(1.38, 0.58, 0.06, "#2b3a42", { rough: 0.4, metal: 0.35 });
    bezel.position.set(3.1, 2.62, -9.89);
    s.add(bezel);
    const face = signPlane(this.clockTexture("00:00"), 1.14, 0.38);
    face.position.set(3.1, 2.62, -9.79);
    s.add(face);
    this.ledClock = { mesh: face as THREE.Mesh, text: "" };
    const clockGlow = new THREE.PointLight(0x64f0c8, 1.4, 2.2, 2);
    clockGlow.position.set(3.1, 2.62, -9.5);
    s.add(clockGlow);
  }

  private clockTexture(text: string) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 170;
    const x = c.getContext("2d")!;
    x.fillStyle = "#0b1418";
    x.fillRect(0, 0, 512, 170);
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.shadowColor = "#3ff0c0";
    x.shadowBlur = 32;
    x.fillStyle = "#7dffdc";
    x.font = `700 108px "JetBrains Mono", "Cairo", monospace`;
    x.fillText(text, 256, 82);
    x.shadowBlur = 0;
    x.globalAlpha = 0.5;
    x.font = `500 22px "Cairo", sans-serif`;
    x.fillText("صيدلية النور", 256, 150);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* --------------------------------------------------------------- decor */

  private plant(px: number, pz: number, scale = 1) {
    const s = this.scene;
    const g = new THREE.Group();
    const pot = cylinder(0.25, 0.44, "#d6dedc", { rough: 0.85 });
    pot.position.y = 0.22;
    g.add(pot);
    const rim = cylinder(0.27, 0.06, "#c2ccca", { rough: 0.8 });
    rim.position.y = 0.44;
    g.add(rim);
    const soil = cylinder(0.23, 0.04, "#42352b", { rough: 1 });
    soil.position.y = 0.46;
    g.add(soil);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const leaf = box(0.07, 0.55 + (i % 3) * 0.18, 0.07, i % 2 ? "#2e7d4f" : "#3d9c62", { rough: 0.85 });
      leaf.position.set(Math.cos(a) * 0.12, 0.78, Math.sin(a) * 0.12);
      leaf.rotation.z = Math.cos(a) * 0.42;
      leaf.rotation.x = Math.sin(a) * 0.42;
      g.add(leaf);
    }
    for (let i = 0; i < 3; i++) {
      const bush = new THREE.Mesh(
        new THREE.SphereGeometry(0.28 - i * 0.06, 14, 10),
        mat(i % 2 ? "#2f8552" : "#3ea368", { rough: 0.9 }),
      );
      bush.castShadow = true;
      bush.position.set((i - 1) * 0.12, 1.0 + i * 0.2, (i % 2 ? 1 : -1) * 0.1);
      g.add(bush);
    }
    g.add(contactShadow(1.1, 1.1, 0.4));
    g.position.set(px, 0, pz);
    g.scale.setScalar(scale);
    s.add(g);
    this.addCollider(px, pz, 0.6, 0.6);
    return g;
  }

  private buildDecor() {
    const s = this.scene;

    /* cold storage — a real medical fridge with a hinged glass door */
    const fridgeX = -11.6;
    const fridgeZ = -9.2;
    const FW = 2.0; // cabinet width
    const FD = 0.86; // depth
    const FH = 2.3; // cabinet height
    const fg = new THREE.Group();
    fg.position.set(fridgeX, 0, fridgeZ);
    s.add(fg);
    fg.add(contactShadow(FW + 0.7, FD + 0.7, 0.5));

    const steel = { rough: 0.32, metal: 0.55 };
    // plinth
    const plinth = box(FW, 0.12, FD, "#3d4c53", { rough: 0.5, metal: 0.4 });
    plinth.position.set(0, 0.06, 0);
    fg.add(plinth);
    // side panels / top / back — open front so the interior is visible
    for (const sx of [-1, 1]) {
      const side = box(0.07, FH, FD, "#eef3f4", steel);
      side.position.set(sx * (FW / 2 - 0.035), 0.12 + FH / 2, 0);
      fg.add(side);
    }
    const backP = box(FW, FH, 0.06, "#dfe8ea", { rough: 0.5 });
    backP.position.set(0, 0.12 + FH / 2, -FD / 2 + 0.03);
    fg.add(backP);
    const topP = box(FW, 0.08, FD, "#eef3f4", steel);
    topP.position.set(0, 0.12 + FH - 0.04, 0);
    fg.add(topP);
    // compressor housing + vents
    const comp = box(FW, 0.34, FD, "#cfd9dc", { rough: 0.45, metal: 0.35 });
    comp.position.set(0, 0.12 + FH + 0.17, 0);
    fg.add(comp);
    for (let i = 0; i < 7; i++) {
      const vent = box(FW - 0.4, 0.02, 0.012, "#7d8b91", { rough: 0.6, metal: 0.5 });
      vent.position.set(0, 0.12 + FH + 0.06 + i * 0.04, FD / 2 + 0.002);
      fg.add(vent);
    }
    // brand header
    const fridgeHead = box(FW + 0.06, 0.3, FD + 0.04, "#12706a", { rough: 0.4 });
    fridgeHead.position.set(0, 0.12 + FH + 0.5, 0);
    fg.add(fridgeHead);
    const fridgeSign = signPlane(
      labelTexture("التخزين البارد", "2–8°C  •  أدوية تحتاج تبريد", "#12706a", "#ffffff", 640, 160),
      FW - 0.06,
      0.26,
    );
    fridgeSign.position.set(0, 0.12 + FH + 0.5, FD / 2 + 0.03);
    fg.add(fridgeSign);

    // interior back light panel + cold light
    const backGlow = box(FW - 0.2, FH - 0.3, 0.02, "#eafaff", {
      emissive: "#cdeeff",
      emissiveIntensity: 0.55,
    });
    backGlow.castShadow = false;
    backGlow.position.set(0, 0.12 + FH / 2, -FD / 2 + 0.07);
    fg.add(backGlow);
    const fridgeLight = new THREE.PointLight(0xcdeeff, 2.6, 3.4, 2);
    fridgeLight.position.set(0, 1.7, 0.1);
    fg.add(fridgeLight);

    // wire shelves + LED strip under each
    const stock = new THREE.Group();
    fg.add(stock);
    this.fridgeStock = stock;
    for (let i = 0; i < 4; i++) {
      const y = 0.42 + i * 0.5;
      const b = box(FW - 0.16, 0.035, FD - 0.16, "#f7fbfc", { rough: 0.35, metal: 0.3 });
      b.position.set(0, y, 0);
      fg.add(b);
      const lip = box(FW - 0.16, 0.045, 0.02, "#c9d6da", { rough: 0.4, metal: 0.4 });
      lip.position.set(0, y + 0.03, (FD - 0.16) / 2);
      fg.add(lip);
      const ledS = box(FW - 0.3, 0.016, 0.04, "#ffffff", {
        emissive: "#e6fbff",
        emissiveIntensity: 1.6,
      });
      ledS.castShadow = false;
      ledS.position.set(0, y - 0.03, (FD - 0.16) / 2 - 0.06);
      fg.add(ledS);
    }

    // hinged glass door (pivots on the right edge)
    const door = new THREE.Group();
    door.position.set(FW / 2 - 0.03, 0, FD / 2 - 0.02);
    fg.add(door);
    this.fridgeDoor = door;
    const glass = box(FW - 0.1, FH - 0.12, 0.045, "#d6f0f6", { rough: 0.04, opacity: 0.24 });
    glass.castShadow = false;
    glass.position.set(-(FW - 0.1) / 2, 0.12 + FH / 2, 0);
    door.add(glass);
    // door frame rails
    for (const dy of [0.12 + 0.05, 0.12 + FH - 0.07]) {
      const rail = box(FW - 0.06, 0.09, 0.07, "#e6edee", steel);
      rail.position.set(-(FW - 0.1) / 2, dy, 0);
      door.add(rail);
    }
    for (const dx of [-0.03, -(FW - 0.13)]) {
      const stile = box(0.07, FH - 0.12, 0.07, "#e6edee", steel);
      stile.position.set(dx, 0.12 + FH / 2, 0);
      door.add(stile);
    }
    const handle = box(0.045, 1.0, 0.045, "#96a5ab", { metal: 0.9, rough: 0.2 });
    handle.position.set(-(FW - 0.2), 1.35, 0.13);
    door.add(handle);
    for (const hy of [0.9, 1.8]) {
      const arm = box(0.04, 0.045, 0.14, "#96a5ab", { metal: 0.9, rough: 0.22 });
      arm.position.set(-(FW - 0.2), hy, 0.075);
      door.add(arm);
    }
    // digital thermometer on the door frame
    const tempPanel = box(0.3, 0.16, 0.03, "#101a1e", { rough: 0.35, metal: 0.4 });
    tempPanel.position.set(-(FW - 0.14) / 2 + 0.62, 0.12 + FH - 0.22, 0.05);
    door.add(tempPanel);
    const tempFace = signPlane(fridgeTempTexture("4.0°C"), 0.27, 0.135);
    tempFace.position.set(-(FW - 0.14) / 2 + 0.62, 0.12 + FH - 0.22, 0.067);
    door.add(tempFace);

    this.addCollider(fridgeX, fridgeZ, FW + 0.1, FD + 0.1);
    this.interactables.push({ obj: glass, focus: { kind: "fridge", label: "ثلاجة الأدوية" } });
    this.interactables.push({ obj: stock, focus: { kind: "fridge", label: "ثلاجة الأدوية" } });

    /* waiting lounge — right in front of the reception desk */
    const waitZ = 8.75;
    const bench = new THREE.Group();
    s.add(bench);
    bench.add(contactShadow(4.6, 1.6, 0.4).translateX(4.6).translateZ(waitZ));
    for (let i = 0; i < 4; i++) {
      const x = 3.1 + i * 0.78;
      const seat = box(0.7, 0.1, 0.6, "#2f7f78", { rough: 0.6 });
      seat.position.set(x, 0.47, waitZ);
      s.add(seat);
      const cushion = box(0.64, 0.05, 0.54, "#3d998f", { rough: 0.75 });
      cushion.position.set(x, 0.535, waitZ);
      s.add(cushion);
      const backRest = box(0.7, 0.58, 0.09, "#2f7f78", { rough: 0.6 });
      backRest.position.set(x, 0.78, waitZ + 0.3);
      backRest.rotation.x = 0.12;
      s.add(backRest);
      for (const dx of [-0.28, 0.28])
        for (const dz of [-0.24, 0.24]) {
          const leg = cylinder(0.022, 0.44, "#8f9ea4", { metal: 0.7, rough: 0.3 });
          leg.position.set(x + dx, 0.22, waitZ + dz);
          s.add(leg);
        }
    }
    this.addCollider(4.3, waitZ + 0.1, 3.6, 1.0);

    // side table with magazines + a water dispenser corner
    const table = cylinder(0.34, 0.06, "#e5ebec", { rough: 0.4 });
    table.position.set(1.9, 0.5, waitZ);
    s.add(table);
    const tableLeg = cylinder(0.06, 0.5, "#8f9ea4", { metal: 0.6, rough: 0.3 });
    tableLeg.position.set(1.9, 0.25, waitZ);
    s.add(tableLeg);
    const tableShadow = contactShadow(1.1, 1.1, 0.35);
    tableShadow.position.set(1.9, 0.012, waitZ);
    s.add(tableShadow);
    for (let i = 0; i < 3; i++) {
      const mag = box(0.2, 0.012, 0.28, ["#3d7ef0", "#f0a13d", "#e0607e"][i]!, { rough: 0.7 });
      mag.position.set(1.9 + (i - 1) * 0.05, 0.545 + i * 0.014, waitZ + (i - 1) * 0.04);
      mag.rotation.y = (i - 1) * 0.2;
      s.add(mag);
    }
    this.addCollider(1.9, waitZ, 0.7, 0.7);

    const cooler = box(0.4, 1.1, 0.4, "#f2f6f7", { rough: 0.4 });
    cooler.position.set(6.8, 0.55, 9.1);
    s.add(cooler);
    const jug = cylinder(0.16, 0.42, "#bfe6ef", { rough: 0.1, opacity: 0.55 });
    jug.position.set(6.8, 1.31, 9.1);
    s.add(jug);
    this.addCollider(6.8, 9.1, 0.5, 0.5);

    // flower vase on the waiting table
    const vase = cylinder(0.09, 0.22, "#e8f2f0", { rough: 0.25 });
    vase.position.set(1.9, 0.64, waitZ);
    s.add(vase);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const stem = box(0.012, 0.24, 0.012, "#3d9c62", { rough: 0.8 });
      stem.position.set(1.9 + Math.cos(a) * 0.03, 0.85, waitZ + Math.sin(a) * 0.03);
      s.add(stem);
      const bud = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 10, 8),
        mat(i % 2 ? "#e0607e" : "#f0a13d", { rough: 0.7 }),
      );
      bud.position.set(1.9 + Math.cos(a) * 0.05, 0.98, waitZ + Math.sin(a) * 0.05);
      s.add(bud);
    }

    /* plants every ~6-8 m along the walls */
    for (const [px, pz] of [
      [12.2, 1.0],
      [12.3, 9.2],
      [-12.3, 9.0],
      [-12.3, 2.0],
      [0.4, 9.3],
      [-2.6, 9.0],
    ] as [number, number][])
      this.plant(px, pz);

    /* fire extinguisher, camera, bin */
    const ext = cylinder(0.09, 0.5, "#c0392b", { rough: 0.5 });
    ext.position.set(12.7, 0.55, -3.4);
    s.add(ext);
    const extTop = cylinder(0.04, 0.12, "#33424a", { metal: 0.6, rough: 0.3 });
    extTop.position.set(12.7, 0.86, -3.4);
    s.add(extTop);

    const cam = box(0.22, 0.12, 0.12, "#e2e8ea", { rough: 0.5 });
    cam.position.set(12.4, 3.1, -4.4);
    cam.rotation.y = 0.8;
    s.add(cam);
    const camLens = cylinder(0.045, 0.06, "#1b2429", { rough: 0.2 });
    camLens.rotation.z = Math.PI / 2;
    camLens.position.set(12.24, 3.06, -4.3);
    s.add(camLens);

    const bin = cylinder(0.19, 0.55, "#95a5a6", { metal: 0.4, rough: 0.5 });
    bin.position.set(-4.6, 0.27, 8.9);
    s.add(bin);
    const binLid = cylinder(0.2, 0.05, "#7f8c8d", { metal: 0.5, rough: 0.4 });
    binLid.position.set(-4.6, 0.57, 8.9);
    s.add(binLid);
    this.addCollider(-4.6, 8.9, 0.42, 0.42);

    this.buildStoreroom();
  }

  /* -------------------------------------------------------------- shelves */

  syncShelves(shelves: Shelf[], meds: Medicine[]) {
    for (const g of this.shelfGroups.values()) {
      this.scene.remove(g);
      disposeGroup(g);
    }
    this.shelfGroups.clear();
    this.shelfLabels = [];
    this.colliders = this.colliders.filter((c) => !(c as Collider & { shelf?: boolean }).shelf);
    this.interactables = this.interactables.filter((i) => i.focus.kind !== "shelf");

    for (const shelf of shelves) {
      const slot = SHELF_SLOTS[shelf.slot % SHELF_SLOTS.length]!;
      const { group, width, depth, label } = buildShelf(shelf, meds);
      group.position.set(slot.x, 0, slot.z);
      group.rotation.y = slot.rot;
      group.scale.setScalar(0.001);
      group.userData['grow'] = 0;
      this.scene.add(group);
      this.shelfGroups.set(shelf.id, group);
      this.shelfLabels.push({ sprite: label, group });

      const rotated = Math.abs(Math.sin(slot.rot)) > 0.5;
      const w = rotated ? depth : width;
      const d = rotated ? width : depth;
      const col: Collider & { shelf?: boolean } = {
        minX: slot.x - w / 2,
        maxX: slot.x + w / 2,
        minZ: slot.z - d / 2,
        maxZ: slot.z + d / 2,
      };
      col.shelf = true;
      this.colliders.push(col);

      group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.userData['shelfId'] = shelf.id;
      });
      this.interactables.push({ obj: group, focus: { kind: "shelf", label: shelf.name, id: shelf.id } });
    }

    this.fillFridge(meds);
    this.syncStorage(meds);
    this.updateMonitor(meds.length, shelves.length);
  }

  /** Stock the cold-storage fridge from the cold-chain medicines in the database. */
  private fillFridge(meds: Medicine[]) {
    const stock = this.fridgeStock;
    if (!stock) return;
    for (const c of [...stock.children]) {
      stock.remove(c);
      disposeGroup(c as THREE.Group);
    }
    const cold = meds.filter((m) => m.category === "مبردات");
    const list = cold.length ? cold : meds.slice(0, 8);
    const COLS = 6;
    const ROWS = 4;
    const startX = -0.74;
    const stepX = 1.48 / (COLS - 1);
    let idx = 0;
    for (let r = 0; r < ROWS; r++) {
      const y = 0.4395 + r * 0.5;
      for (let c = 0; c < COLS; c++) {
        const med = list[idx % Math.max(1, list.length)];
        if (!med) break;
        const units = Math.min(3, Math.max(1, Math.ceil(med.stock / 12)));
        for (let u = 0; u < units; u++) {
          const p = buildProduct(med, idx + u);
          p.position.set(startX + c * stepX, y, -0.07 + u * 0.14);
          p.rotation.y = (Math.random() - 0.5) * 0.14;
          p.traverse((o: THREE.Object3D) => {
            if ((o as THREE.Mesh).isMesh) o.userData['medId'] = med.id;
          });
          stock.add(p);
        }
        idx++;
      }
    }
  }

  /** Redraw the workstation dashboard when the inventory changes. */
  private updateMonitor(items: number, shelves: number) {
    this.statItems = items;
    this.statShelves = shelves;
    const scr = this.monitorScreen;
    if (!scr) return;
    const m = scr.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.map = monitorScreenTexture(items, shelves);
    m.needsUpdate = true;
  }

  /* ------------------------------------------------------- storage room */

  /** Small back storage room: walls, sliding door, racks of stock cartons. */
  private buildStoreroom() {
    const s = this.scene;
    const X0 = 4.2;
    const X1 = 12.9;
    const Z0 = -9.85;
    const Z1 = -5.2;
    const H = 3.0;
    const wallCol = "#e6eef0";

    const side = box(0.16, H, Z1 - Z0, wallCol, { rough: 0.85 });
    side.position.set(X0, H / 2, (Z0 + Z1) / 2);
    s.add(side);
    this.addCollider(X0, (Z0 + Z1) / 2, 0.24, Z1 - Z0);

    const front1 = box(1.8, H, 0.16, wallCol, { rough: 0.85 });
    front1.position.set(5.1, H / 2, Z1);
    s.add(front1);
    this.addCollider(5.1, Z1, 1.8, 0.24);

    const front2 = box(4.7, H, 0.16, wallCol, { rough: 0.85 });
    front2.position.set(10.55, H / 2, Z1);
    s.add(front2);
    this.addCollider(10.55, Z1, 4.7, 0.24);

    const header = box(2.2, 0.45, 0.16, wallCol, { rough: 0.85 });
    header.position.set(7.1, H - 0.225, Z1);
    s.add(header);
    // doorway blocker (removed dynamically while the door is open)
    this.addCollider(7.1, Z1, 2.2, 0.22);

    // door sign
    const signBg = box(1.5, 0.36, 0.05, "#0e5f5a", { rough: 0.4 });
    signBg.position.set(7.1, 2.78, Z1 + 0.1);
    s.add(signBg);
    const signFace = signPlane(
      labelTexture("المخزن", "STORAGE ROOM", "#0e5f5a", "#ffffff", 640, 160),
      1.42,
      0.32,
    );
    signFace.position.set(7.1, 2.78, Z1 + 0.14);
    s.add(signFace);

    // sliding door
    const door = new THREE.Group();
    door.position.set(6.0, 0, Z1);
    s.add(door);
    this.storeDoor = door;
    const panel = box(2.1, 2.55, 0.09, "#cfd9dc", { metal: 0.55, rough: 0.35 });
    panel.position.set(1.05, 1.28, 0);
    door.add(panel);
    const window = box(0.9, 0.5, 0.11, "#cfe9f2", { rough: 0.1, metal: 0.1, opacity: 0.5 });
    window.position.set(1.05, 1.85, 0);
    door.add(window);
    const handle = cylinder(0.03, 0.34, "#8e9ea5", { metal: 0.8, rough: 0.25 });
    handle.position.set(1.9, 1.15, 0.09);
    door.add(handle);
    const stripe = box(2.1, 0.08, 0.1, "#2f7f78", { rough: 0.5 });
    stripe.position.set(1.05, 0.75, 0.01);
    door.add(stripe);
    const rail = box(2.4, 0.09, 0.14, "#9fabb1", { metal: 0.7, rough: 0.3 });
    rail.position.set(7.6, 2.62, Z1 + 0.02);
    s.add(rail);

    // wall button that opens the door
    const btnPanel = box(0.2, 0.3, 0.06, "#dfe7ea", { rough: 0.5 });
    btnPanel.position.set(8.55, 1.25, Z1 + 0.11);
    s.add(btnPanel);
    const btn = cylinder(0.055, 0.05, "#2fb59c", { emissive: "#2fb59c", emissiveIntensity: 0.8, rough: 0.4 });
    btn.rotation.x = Math.PI / 2;
    btn.position.set(8.55, 1.3, Z1 + 0.15);
    s.add(btn);
    this.interactables.push({ obj: btnPanel, focus: { kind: "storedoor", label: "باب المخزن" } });
    this.interactables.push({ obj: btn, focus: { kind: "storedoor", label: "باب المخزن" } });

    // interior lighting
    for (const lx of [6.4, 10.6]) {
      const pan = box(1.5, 0.06, 0.5, "#ffffff", {
        emissive: "#ffffff",
        emissiveIntensity: 1.4,
        rough: 0.4,
      });
      pan.position.set(lx, 2.86, -7.4);
      s.add(pan);
      const pl = new THREE.PointLight(0xfff3e0, 12, 8, 2);
      pl.position.set(lx, 2.7, -7.4);
      s.add(pl);
    }

    /* racks */
    const rackMat = { metal: 0.6, rough: 0.35 };
    const levels = [0.32, 0.87, 1.42, 1.97];
    for (const y of levels) {
      const board = box(7.6, 0.05, 0.52, "#b9c6cc", rackMat);
      board.position.set(8.7, y, -9.5);
      s.add(board);
      const board2 = box(0.52, 0.05, 3.4, "#b9c6cc", rackMat);
      board2.position.set(12.45, y, -7.4);
      s.add(board2);
    }
    for (const ux of [5.0, 8.7, 12.4]) {
      const up = box(0.07, 2.3, 0.07, "#8f9ea4", rackMat);
      up.position.set(ux, 1.15, -9.5);
      s.add(up);
    }
    for (const uz of [-9.0, -5.9]) {
      const up = box(0.07, 2.3, 0.07, "#8f9ea4", rackMat);
      up.position.set(12.45, 1.15, uz);
      s.add(up);
    }
    this.addCollider(8.7, -9.5, 7.6, 0.62);
    this.addCollider(12.45, -7.4, 0.62, 3.4);

    this.storeLevels = [];
    for (const y of levels) {
      for (let i = 0; i < 11; i++) this.storeLevels.push(new THREE.Vector3(5.35 + i * 0.66, y + 0.17, -9.5));
      for (let j = 0; j < 4; j++) this.storeLevels.push(new THREE.Vector3(12.45, y + 0.17, -8.7 + j * 0.78));
    }

    const racks = new THREE.Group();
    s.add(racks);
    this.storeRacks = racks;
    this.interactables.push({ obj: racks, focus: { kind: "storage", label: "مخزن الأدوية" } });
  }

  /** Fill the storage racks with cartons that mirror the warehouse quantities. */
  private syncStorage(meds: Medicine[]) {
    const racks = this.storeRacks;
    if (!racks) return;
    for (const c of [...racks.children]) {
      racks.remove(c);
      disposeGroup(c as THREE.Group);
    }
    const stored = meds.filter((m) => (m.warehouse ?? 0) > 0);
    let slot = 0;
    for (const med of stored) {
      const count = Math.min(4, Math.max(1, Math.ceil((med.warehouse ?? 0) / 14)));
      for (let i = 0; i < count; i++) {
        const p = this.storeLevels[slot++];
        if (!p) return;
        const g = new THREE.Group();
        g.position.copy(p);
        if (p.x > 12.2) g.rotation.y = -Math.PI / 2;
        const carton = box(0.42, 0.3, 0.36, "#c9a06a", { rough: 0.9 });
        g.add(carton);
        const tape = box(0.06, 0.005, 0.37, "#b08347", { rough: 0.9 });
        tape.position.y = 0.152;
        g.add(tape);
        const band = box(0.42, 0.06, 0.005, med.color, { rough: 0.7 });
        band.position.set(0, -0.09, 0.183);
        g.add(band);
        if (i === 0) {
          const lbl = signPlane(
            labelTexture(med.name, `${med.warehouse ?? 0} وحدة`, "#3a2c1c", "#f4e7d2", 512, 200),
            0.3,
            0.13,
          );
          lbl.position.set(0, 0.03, 0.184);
          g.add(lbl);
        }
        g.traverse((o: THREE.Object3D) => {
          if ((o as THREE.Mesh).isMesh) o.userData['medId'] = med.id;
        });
        racks.add(g);
      }
    }
  }

  /* ------------------------------------------------------------- controls */

  look(dx: number, dy: number) {
    // feed a target the camera eases towards -> smooth, low-latency touch look
    const k = 0.0042 * this.sensitivity;
    this.yawTarget -= dx * k;
    this.pitchTarget -= dy * k * 0.86;
    this.pitchTarget = Math.max(-1.15, Math.min(1.05, this.pitchTarget));
  }

  /** Open/close the storage-room door (called from the interact button). */
  toggleStoreDoor() {
    this.storeTarget = this.storeTarget > 0.5 ? 0 : 1;
  }

  getFocus() {
    return this.focus;
  }

  /* ----------------------------------------------------------------- loop */

  start() {
    const tick = () => {
      this.frameId = requestAnimationFrame(tick);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.t += dt;
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.frameId = requestAnimationFrame(tick);
  }

  private update(dt: number) {
    if (!this.paused) this.updatePlayer(dt);
    this.updateDoor(dt);
    this.updateShelfGrowth(dt);
    this.updateLabels(dt);
    this.updateClock();
    this.updateAmbient(dt);
    this.updateFocus(dt);
    this.updateCamera(dt);
  }

  /* smooth, weighty movement with camera damping, tilt and FOV kick */
  private updateCamera(dt: number) {
    // ease the view towards the pointer target (smooth but responsive)
    const s = 1 - Math.exp(-dt * 26);
    this._yaw += (this.yawTarget - this._yaw) * s;
    this._pitch += (this.pitchTarget - this._pitch) * s;

    // yaw velocity -> camera roll (tilt while turning)
    const dyaw = this.yaw - this.lastYaw;
    this.lastYaw = this.yaw;
    this.yawVel += (dyaw / Math.max(dt, 0.001) - this.yawVel) * Math.min(1, dt * 8);
    const targetRoll = Math.max(-0.05, Math.min(0.05, this.yawVel * 0.018));
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);

    const sprinting = this.running && this.vel.length() > 1.2;
    const targetFov = sprinting ? 68 : 62;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 3.2);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.set(this.pos.x, this.pos.y + this.bob, this.pos.z);
    this.camera.rotation.order = "ZYX";
    this.camera.rotation.set(this.pitch, this.yaw, this.roll, "YXZ");
  }

  private updatePlayer(dt: number) {
    const input = Math.hypot(this.move.x, this.move.y);
    const speed = (this.running ? 3.5 : 2.0) * Math.min(1, input);
    const dir = new THREE.Vector3();
    if (speed > 0.001) {
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      dir
        .addScaledVector(forward, -this.move.y)
        .addScaledVector(right, this.move.x)
        .normalize()
        .multiplyScalar(speed);
    }
    // heavy but responsive: faster accel than decel
    const rate = dir.lengthSq() > 0.001 ? 7.5 : 4.2;
    this.vel.lerp(dir, 1 - Math.exp(-rate * dt));
    if (this.vel.lengthSq() < 0.0004) this.vel.set(0, 0, 0);

    const step = this.vel.clone().multiplyScalar(dt);
    this.tryMove(step.x, 0);
    this.tryMove(0, step.z);

    // head bob + sway + footsteps
    const sp = this.vel.length();
    if (sp > 0.25) {
      this.stepPhase += dt * sp * 2.5;
      if (this.stepPhase > Math.PI) {
        this.stepPhase -= Math.PI;
        this.onStep?.();
      }
      const amp = 0.016 + Math.min(sp / 3.5, 1) * 0.012;
      this.bob += (Math.sin(this.stepPhase * 2) * amp - this.bob) * Math.min(1, dt * 12);
      this.roll += Math.sin(this.stepPhase) * 0.0009;
    } else {
      this.bob += (0 - this.bob) * Math.min(1, dt * 7);
    }
    // idle breathing sway
    this.bob += Math.sin(this.t * 1.1) * 0.00018;
    this.pos.y = EYE;
  }

  private tryMove(dx: number, dz: number) {
    const r = 0.34;
    const nx = this.pos.x + dx;
    const nz = this.pos.z + dz;
    const inside = nz < HD - 0.4;
    let blocked = false;
    for (const c of this.colliders) {
      if (nx + r > c.minX && nx - r < c.maxX && nz + r > c.minZ && nz - r < c.maxZ) {
        blocked = true;
        break;
      }
    }
    if (blocked && Math.abs(nx) < 1.5 && Math.abs(nz - HD) < 1.0 && this.doorOpen > 0.7) blocked = false;
    // storage-room doorway is passable while its door is open
    if (blocked && nx > 5.6 && nx < 8.6 && Math.abs(nz + 5.2) < 1.0 && this.storeOpen > 0.7)
      blocked = false;
    if (blocked) return;
    if (inside) {
      this.pos.x = Math.max(ROOM.minX + r + 0.1, Math.min(ROOM.maxX - r - 0.1, nx));
      this.pos.z = Math.max(ROOM.minZ + r + 0.1, Math.min(nz, HD - 0.4));
    } else {
      this.pos.x = Math.max(-14, Math.min(14, nx));
      this.pos.z = Math.max(HD - 0.6, Math.min(HD + 6, nz));
    }
  }

  private updateDoor(dt: number) {
    const near = Math.abs(this.pos.x) < 3 && Math.abs(this.pos.z - HD) < 3.4;
    const target = near ? 1 : 0;
    const prev = this.doorOpen;
    this.doorOpen += (target - this.doorOpen) * Math.min(1, dt * 3.2);
    if (prev < 0.02 && this.doorOpen >= 0.02) this.onDoor?.();
    if (this.doorL && this.doorR) {
      this.doorL.position.x = -0.82 - this.doorOpen * 1.55;
      this.doorR.position.x = 0.82 + this.doorOpen * 1.55;
    }
  }

  private updateShelfGrowth(dt: number) {
    for (const g of this.shelfGroups.values()) {
      const t = (g.userData['grow'] ?? 0) + dt * 2.0;
      if (t >= 1) {
        if (g.scale.x !== 1) g.scale.setScalar(1);
        g.userData['grow'] = 1;
        continue;
      }
      g.userData['grow'] = t;
      const e = 1 - Math.pow(1 - t, 3);
      g.scale.setScalar(0.001 + e * 0.999);
    }
  }

  /** Fixed shelf signs: mounted on the shelf, fading in within readable range. */
  private updateLabels(dt: number) {
    const camPos = this.camera.position;
    for (const { sprite, group } of this.shelfLabels) {
      const world = new THREE.Vector3();
      sprite.getWorldPosition(world);
      const to = world.clone().sub(camPos);
      const dist = to.length();
      to.y = 0;
      to.normalize();
      // sign normal in world space (+Z of the shelf group)
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(group.quaternion);
      const facing = -to.dot(n); // camera is on the side the sign points at
      const visible = dist < 9 && facing > 0.15 && (group.userData['grow'] ?? 0) > 0.6;
      const target = visible ? Math.min(1, (9 - dist) / 2.2) : 0;
      const m = sprite.material as THREE.MeshBasicMaterial;
      m.opacity += (target - m.opacity) * Math.min(1, dt * 3.4); // ~300ms fade
      sprite.visible = m.opacity > 0.01;
    }
  }

  private updateClock() {
    if (!this.ledClock) return;
    const now = new Date();
    const txt = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (txt === this.ledClock.text) return;
    this.ledClock.text = txt;
    const m = this.ledClock.mesh.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.map = this.clockTexture(txt);
    m.needsUpdate = true;
  }

  private updateAmbient(dt: number) {
    if (this.monitorGlow) this.monitorGlow.intensity = 2.4 + Math.sin(this.t * 2.3) * 0.35;
    if (this.fridgeDoor) {
      const d = Math.hypot(this.pos.x - -11.6, this.pos.z - -9.2);
      const target = d < 2.4 ? 1 : 0;
      this.fridgeOpen += (target - this.fridgeOpen) * Math.min(1, dt * 3.2);
      this.fridgeDoor.rotation.y = this.fridgeOpen * 1.15;
    }
    if (this.acLed) {
      const mm = (this.acLed as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mm.emissiveIntensity = 0.4 + (Math.sin(this.t * 2) > 0.9 ? 2.4 : 0);
    }
    if (this.storeDoor) {
      this.storeOpen += (this.storeTarget - this.storeOpen) * Math.min(1, dt * 3.4);
      this.storeDoor.position.x = 6.0 + this.storeOpen * 2.05;
    }
  }

  private updateFocus(dt: number) {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 3.8;
    const objs = this.interactables.map((i) => i.obj);
    const hits = this.raycaster.intersectObjects(objs, true);
    let found: Focus | null = null;
    let hitRoot: THREE.Object3D | undefined;
    if (hits.length) {
      const hit = hits[0]!.object;
      const medId = findMedId(hit);
      for (const i of this.interactables) {
        if (i.obj === hit || isDescendant(hit, i.obj)) {
          found = medId ? { ...i.focus, medId } : i.focus;
          hitRoot = i.obj;
          break;
        }
      }
    }
    if (this.highlight && this.highlight !== hitRoot) {
      this.highlight.position.y = this.highlightBase.y;
      this.highlight = undefined;
      this.highlightT = 0;
    }
    if (hitRoot && this.highlight !== hitRoot) {
      this.highlight = hitRoot;
      this.highlightBase.copy(hitRoot.position);
      this.highlightT = 0;
    }
    if (this.highlight) {
      this.highlightT = Math.min(1, this.highlightT + dt * 4); // 250ms ease-in glow
      const e = 1 - Math.pow(1 - this.highlightT, 3);
      this.highlight.position.y =
        this.highlightBase.y + (0.012 + Math.sin(this.t * 4.5) * 0.01) * e;
    }
    if (
      found?.label !== this.focus?.label ||
      found?.id !== this.focus?.id ||
      found?.medId !== this.focus?.medId
    ) {
      this.focus = found;
      this.onFocus?.(found);
    }
  }

  resize() {
    const el = this.canvas.parentElement ?? this.canvas;
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.frameId);
    this.ro?.disconnect();
    disposeGroup(this.scene);
    this.renderer.dispose();
  }
}

function isDescendant(node: THREE.Object3D, root: THREE.Object3D) {
  let p: THREE.Object3D | null = node;
  while (p) {
    if (p === root) return true;
    p = p.parent;
  }
  return false;
}

function findMedId(node: THREE.Object3D): string | undefined {
  let p: THREE.Object3D | null = node;
  while (p) {
    const id = p.userData['medId'] as string | undefined;
    if (id) return id;
    p = p.parent;
  }
  return undefined;
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      if (m.geometry && !["BoxGeometry", "CylinderGeometry", "PlaneGeometry"].includes(m.geometry.type))
        m.geometry.dispose();
    }
  });
  while (g.children.length) g.remove(g.children[0]!);
}

export { mat };
