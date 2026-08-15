import { useEffect, useRef, useState } from "react";
import { Boxes, Hand, Menu, PersonStanding, X } from "lucide-react";
import { useGame } from "@/game/store";
import { PHARMACY_FULL_NAME, money, daysUntil } from "@/game/format";
import { PharmacyEngine, type Focus } from "@/game/engine";
import { audio } from "@/game/audio";
import { Joystick } from "./Joystick";
import { ManagementPanel } from "./ManagementPanel";

const btn =
  "touch-btn active:touch-btn-press glass-panel font-semibold text-foreground";

export function GameView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PharmacyEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [panel, setPanel] = useState<"none" | "manage" | "shelf">("none");
  const [manageTab, setManageTab] = useState<"inventory" | "storage">("inventory");
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const store = useGame();
  const { shelves, medicines, settings, player, setPlayer, balance } = store;

  /* ---- engine boot */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new PharmacyEngine(canvas, settings.quality);
    engineRef.current = engine;
    engine.pos.set(player.x, 1.62, player.z);
    engine.yaw = player.yaw;
    engine.sensitivity = settings.sensitivity;
    engine.onFocus = setFocus;
    engine.onStep = () => audio.step();
    engine.onDoor = () => audio.door();
    engine.syncShelves(useGame.getState().shelves, useGame.getState().medicines);
    engine.start();
    const t = setTimeout(() => setReady(true), 900);
    return () => {
      clearTimeout(t);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- keep the 3D pharmacy in sync with the database */
  useEffect(() => {
    engineRef.current?.syncShelves(shelves, medicines);
  }, [shelves, medicines]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.sensitivity = settings.sensitivity;
    audio.setMusic(settings.music);
    audio.setSfx(settings.sfx);
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.paused = panel !== "none";
  }, [panel]);

  /* ---- persist player position (throttled) */
  useEffect(() => {
    const i = setInterval(() => {
      const e = engineRef.current;
      if (e && !e.paused) setPlayer({ x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2), yaw: +e.yaw.toFixed(3) });
    }, 2500);
    return () => clearInterval(i);
  }, [setPlayer]);

  /* ---- look controls (drag anywhere on the world) + keyboard for desktop */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let id: number | null = null;
    let lx = 0;
    let ly = 0;
    const down = (e: PointerEvent) => {
      if (id !== null) return;
      id = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      engineRef.current?.look(e.clientX - lx, e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) id = null;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

    const keys = new Set<string>();
    const apply = () => {
      const e = engineRef.current;
      if (!e) return;
      const x = (keys.has("d") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("a") || keys.has("ArrowLeft") ? 1 : 0);
      const y = (keys.has("s") || keys.has("ArrowDown") ? 1 : 0) - (keys.has("w") || keys.has("ArrowUp") ? 1 : 0);
      e.move = { x, y };
      e.running = keys.has("Shift");
    };
    const kd = (e: KeyboardEvent) => {
      keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      apply();
    };
    const ku = (e: KeyboardEvent) => {
      keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
      apply();
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const interact = () => {
    const f = engineRef.current?.getFocus();
    if (!f) return;
    audio.open();
    if (f.kind === "storedoor") {
      engineRef.current?.toggleStoreDoor();
      return;
    }
    if (f.kind === "storage") {
      setManageTab("storage");
      setPanel("manage");
    } else if (f.kind === "computer" || f.kind === "counter") {
      setManageTab("inventory");
      setPanel("manage");
    }
    else if (f.kind === "shelf" && f.id) {
      setShelfId(f.id);
      setPanel("shelf");
    } else if (f.kind === "fridge") {
      setShelfId(null);
      setPanel("shelf");
    }
  };

  const begin = () => {
    audio.init();
    audio.setMusic(settings.music);
    audio.setSfx(settings.sfx);
    audio.open();
    setStarted(true);
  };

  const shelf = shelves.find((s) => s.id === shelfId);
  const shelfMeds = medicines.filter((m) => m.shelfId === shelfId);
  const aimedMed = focus?.medId ? medicines.find((m) => m.id === focus.medId) : undefined;
  const expiryDays = aimedMed ? daysUntil(aimedMed.expiry) : 0;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background" dir="rtl">
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />

      {/* HUD */}
      {started && panel === "none" && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
            <div className={`size-2.5 rounded-full ${focus ? "bg-primary" : "bg-foreground/40"} transition-colors`} />
            {focus && <div className="absolute inset-0 -m-2 animate-pulse-ring rounded-full border-2 border-primary" />}
          </div>

          {focus && !aimedMed && (
            <div className="glass-panel animate-rise pointer-events-none absolute left-1/2 top-[56%] z-10 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold">
              {focus.label}
            </div>
          )}

          {aimedMed && (
            <div
              key={aimedMed.id}
              className="glass-panel animate-rise pointer-events-none absolute left-1/2 top-[54%] z-10 w-[19rem] max-w-[86vw] -translate-x-1/2 rounded-2xl p-3 shadow-[var(--shadow-panel)]"
            >
              <div className="flex items-start gap-2.5">
                {aimedMed.image ? (
                  <img
                    src={aimedMed.image}
                    alt={aimedMed.name}
                    loading="lazy"
                    className="mt-0.5 size-11 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span
                    className="mt-0.5 size-11 shrink-0 rounded-lg"
                    style={{ background: aimedMed.color }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{aimedMed.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {aimedMed.description}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-primary">{money(aimedMed.price)}</p>
              </div>
              <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-xl bg-muted/70 py-1.5">
                  <p className="text-[10px] text-muted-foreground">الرف</p>
                  <p className="text-xs font-bold">{aimedMed.stock}</p>
                </div>
                <div className="rounded-xl bg-muted/70 py-1.5">
                  <p className="text-[10px] text-muted-foreground">المخزن</p>
                  <p className="text-xs font-bold">{aimedMed.warehouse ?? 0}</p>
                </div>
                <div className="rounded-xl bg-muted/70 py-1.5">
                  <p className="text-[10px] text-muted-foreground">الشركة</p>
                  <p className="truncate px-1 text-xs font-bold">{aimedMed.manufacturer}</p>
                </div>
                <div
                  className={`rounded-xl py-1.5 ${
                    expiryDays < 0
                      ? "bg-destructive/15 text-destructive"
                      : expiryDays < 90
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-muted/70"
                  }`}
                >
                  <p className="text-[10px] opacity-70">الصلاحية</p>
                  <p className="text-xs font-bold">
                    {expiryDays < 0 ? "منتهي" : aimedMed.expiry.slice(0, 7)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-center text-[10px] tracking-widest text-muted-foreground">
                {aimedMed.barcode}
              </p>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3">
            <div className="glass-panel rounded-2xl px-3.5 py-2">
              <p className="font-display text-sm font-bold leading-tight">{PHARMACY_FULL_NAME}</p>
              <p className="text-[11px] text-muted-foreground">
                {medicines.length} صنف • {shelves.length} رف
              </p>
              <p className="text-[11px] font-bold text-primary">{money(balance)}</p>
            </div>
            <button onClick={() => { audio.click(); setManageTab("inventory"); setPanel("manage"); }} className={`${btn} size-12 rounded-2xl`} aria-label="القائمة">
              <Menu className="size-5" />
            </button>
          </div>

          <div className="absolute bottom-4 right-4 z-10">
            <Joystick
              onChange={(x, y) => {
                const e = engineRef.current;
                if (e) e.move = { x, y };
              }}
            />
          </div>

          <div className="absolute bottom-4 left-4 z-10 flex flex-col items-end gap-3">
            <div className="flex gap-3">
              <button
                onClick={() => {
                  audio.click();
                  setRunning((r) => {
                    if (engineRef.current) engineRef.current.running = !r;
                    return !r;
                  });
                }}
                className={`${btn} size-14 rounded-full ${running ? "!bg-primary !text-primary-foreground" : ""}`}
                aria-label="الجري"
              >
                <PersonStanding className="size-6" />
              </button>
              <button onClick={() => { audio.click(); setManageTab("storage"); setPanel("manage"); }} className={`${btn} size-14 rounded-full`} aria-label="المخزون">
                <Boxes className="size-6" />
              </button>
            </div>
            <button
              onClick={interact}
              disabled={!focus}
              className={`${btn} size-20 rounded-full text-base ${focus ? "!bg-primary !text-primary-foreground" : "opacity-55"}`}
            >
              <Hand className="size-8" />
            </button>
          </div>
        </>
      )}

      {/* Shelf inspector */}
      {panel === "shelf" && (
        <div className="absolute inset-0 z-40 flex items-end justify-center bg-deep/40 p-3 backdrop-blur-sm animate-fade-in sm:items-center">
          <div className="glass-panel animate-panel-in max-h-[80%] w-full max-w-md overflow-y-auto rounded-3xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="size-3.5 rounded-full" style={{ background: shelf?.color ?? "#7fd2e6" }} />
                <h2 className="font-display text-lg font-bold">{shelf ? shelf.name : "ثلاجة الأدوية"}</h2>
              </div>
              <button onClick={() => { audio.close(); setPanel("none"); }} className={`${btn} size-10 rounded-full`} aria-label="إغلاق">
                <X className="size-5" />
              </button>
            </div>
            {shelf ? (
              <ul className="space-y-2">
                {shelfMeds.map((m) => (
                  <li key={m.id} className="animate-rise flex items-center gap-3 rounded-2xl border border-border/70 bg-card/70 p-2.5">
                    {m.image ? (
                      <img src={m.image} alt={m.name} loading="lazy" className="size-10 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="size-10 shrink-0 rounded-lg" style={{ background: m.color }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{m.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.description}</p>
                    </div>
                    <div className="shrink-0 text-left">
                      <p className="text-sm font-bold text-primary">{money(m.price)}</p>
                      <p className="text-[11px] text-muted-foreground">الكمية {m.stock}</p>
                    </div>
                  </li>
                ))}
                {!shelfMeds.length && <p className="py-6 text-center text-sm text-muted-foreground">هذا الرف فارغ</p>}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                تُحفظ هنا الأدوية التي تحتاج تبريداً بين ٢ و ٨ درجات مئوية.
              </p>
            )}
            <button
              onClick={() => { audio.click(); setPanel("manage"); }}
              className={`${btn} mt-3 w-full rounded-2xl !bg-primary py-3 !text-primary-foreground`}
            >
              إدارة المنتجات
            </button>
          </div>
        </div>
      )}

      {panel === "manage" && (
        <ManagementPanel initialTab={manageTab} onClose={() => setPanel("none")} />
      )}

      {/* Loading / start screen */}
      {!started && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background text-center">
          <div className="relative">
            <div className="grid size-24 place-items-center rounded-[2rem] bg-primary text-primary-foreground shadow-[var(--shadow-panel)]">
              <div className="relative size-11">
                <span className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-primary-foreground" />
                <span className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 rounded-full bg-primary-foreground" />
              </div>
            </div>
            <div className="absolute inset-0 animate-pulse-ring rounded-[2rem] border-2 border-primary" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight">{PHARMACY_FULL_NAME}</h1>
            <p className="mt-1 text-sm text-muted-foreground">محاكي إدارة صيدلية ثلاثي الأبعاد</p>
          </div>
          <div className="h-1.5 w-56 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: ready ? "100%" : "35%" }}
            />
          </div>
          <button
            onClick={begin}
            disabled={!ready}
            className={`${btn} rounded-2xl px-8 py-4 text-lg ${ready ? "!bg-primary !text-primary-foreground" : "opacity-60"}`}
          >
            {ready ? "ابدأ اللعب" : "جارٍ تجهيز الصيدلية…"}
          </button>
          <p className="max-w-xs text-xs text-muted-foreground">
            حرّك بإصبعك للنظر حولك، واستخدم عصا التحكم للمشي. اقترب من الحاسوب لفتح نظام الإدارة.
          </p>
          <p className="glass-panel rounded-full px-4 py-1.5 text-[11px] font-semibold text-muted-foreground">
            تصميم وتطوير: المهندس أسامة
          </p>
        </div>
      )}
    </div>
  );
}