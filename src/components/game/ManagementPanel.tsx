import { useMemo, useState } from "react";
import {
  Boxes,
  BarChart3,
  Download,
  LayoutGrid,
  PackageOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useGame, SHELF_COLORS, futureDate } from "@/game/store";
import { CATEGORIES, type Category, type Medicine, type PackStyle } from "@/game/types";
import { audio } from "@/game/audio";
import { PHARMACY_FULL_NAME, money, num, purchaseCost } from "@/game/format";
import { parseSave } from "@/game/schema";

type Tab = "inventory" | "storage" | "shelves" | "stats" | "settings";

const PACKS: { value: PackStyle; label: string }[] = [
  { value: "box", label: "علبة" },
  { value: "bottle", label: "زجاجة" },
  { value: "tube", label: "أنبوب" },
  { value: "jar", label: "برطمان" },
  { value: "kit", label: "جهاز" },
];

const field =
  "w-full rounded-xl border border-border bg-input/40 px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/30";
const btn =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-95";

export function ManagementPanel({
  onClose,
  initialTab = "inventory",
}: {
  onClose: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  const tabs: { id: Tab; label: string; icon: typeof Boxes }[] = [
    { id: "inventory", label: "المخزون", icon: Boxes },
    { id: "storage", label: "المخزن", icon: PackageOpen },
    { id: "shelves", label: "الرفوف", icon: LayoutGrid },
    { id: "stats", label: "الإحصائيات", icon: BarChart3 },
    { id: "settings", label: "الإعدادات", icon: Settings2 },
  ];

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-deep/45 p-2 backdrop-blur-sm animate-fade-in sm:p-4">
      <div className="glass-panel animate-panel-in flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Boxes className="size-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold leading-tight">نظام إدارة الصيدلية</h2>
              <p className="text-xs text-muted-foreground">{PHARMACY_FULL_NAME} • حفظ تلقائي</p>
            </div>
          </div>
          <button
            onClick={() => {
              audio.close();
              onClose();
            }}
            className={`${btn} size-11 !px-0 bg-secondary text-secondary-foreground hover:bg-accent`}
            aria-label="إغلاق"
          >
            <X className="size-5" />
          </button>
        </header>

        <nav className="flex gap-1.5 overflow-x-auto px-3 py-2.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                audio.click();
                setTab(t.id);
              }}
              className={`${btn} shrink-0 ${
                tab === t.id
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                  : "bg-secondary/70 text-secondary-foreground hover:bg-accent"
              }`}
            >
              <t.icon className="size-4" />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {tab === "inventory" && <InventoryTab />}
          {tab === "storage" && <StorageTab />}
          {tab === "shelves" && <ShelvesTab />}
          {tab === "stats" && <StatsTab />}
          {tab === "settings" && <SettingsTab />}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- inventory */

function InventoryTab() {
  const { medicines, shelves, removeMedicine } = useGame();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | Category>("all");
  const [sort, setSort] = useState<"name" | "price" | "stock" | "expiry">("name");
  const [editing, setEditing] = useState<Medicine | "new" | null>(null);

  const list = useMemo(() => {
    const t = q.trim();
    return medicines
      .filter((m) => (cat === "all" ? true : m.category === cat))
      .filter((m) => !t || m.name.includes(t) || m.manufacturer.includes(t) || m.barcode.includes(t))
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name, "ar")
          : sort === "price"
            ? b.price - a.price
            : sort === "stock"
              ? a.stock - b.stock
              : a.expiry.localeCompare(b.expiry),
      );
  }, [medicines, q, cat, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-45 flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن دواء…"
            className={`${field} pr-9`}
          />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value as Category)} className={`${field} w-auto`}>
          <option value="all">كل الأقسام</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${field} w-auto`}>
          <option value="name">الاسم</option>
          <option value="price">الأعلى سعراً</option>
          <option value="stock">الأقل مخزوناً</option>
          <option value="expiry">الأقرب انتهاءً</option>
        </select>
        <button
          onClick={() => {
            audio.open();
            setEditing("new");
          }}
          className={`${btn} bg-primary text-primary-foreground`}
        >
          <Plus className="size-4" /> دواء جديد
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((m) => {
          const shelf = shelves.find((s) => s.id === m.shelfId);
          const days = Math.round((new Date(m.expiry).getTime() - Date.now()) / 86400000);
          return (
            <article
              key={m.id}
              className="animate-rise flex items-center gap-3 rounded-2xl border border-border/70 bg-card/80 p-3"
            >
              <div
                className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl font-display text-lg font-bold text-primary-foreground"
                style={{ background: m.color }}
              >
                {m.image ? (
                  <img src={m.image} alt={m.name} loading="lazy" className="size-full object-cover" />
                ) : (
                  m.name.slice(0, 1)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-semibold">{m.name}</h3>
                  {days < 0 && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] text-danger">منتهي</span>}
                  {days >= 0 && days < 90 && (
                    <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[11px] text-foreground/80">قريب الانتهاء</span>
                  )}
                  {m.stock <= 5 && (
                    <span className="rounded-full bg-danger/12 px-2 py-0.5 text-[11px] text-danger">مخزون منخفض</span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {m.category} • {shelf ? shelf.name : "بدون رف"} • {m.expiry}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-primary">
                  {money(m.price)} • الكمية {m.stock}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  onClick={() => {
                    audio.click();
                    setEditing(m);
                  }}
                  className={`${btn} size-10 !px-0 bg-secondary text-secondary-foreground`}
                  aria-label="تعديل"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => {
                    audio.error();
                    removeMedicine(m.id);
                  }}
                  className={`${btn} size-10 !px-0 bg-danger/12 text-danger`}
                  aria-label="حذف"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </article>
          );
        })}
        {!list.length && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">لا توجد نتائج مطابقة</p>
        )}
      </div>

      {editing && <MedicineDialog value={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MedicineDialog({ value, onClose }: { value: Medicine | "new"; onClose: () => void }) {
  const { shelves, addMedicine, updateMedicine } = useGame();
  const isNew = value === "new";
  const base: Omit<Medicine, "id" | "barcode"> = isNew
    ? {
        name: "",
        category: "أدوية",
        price: 10,
        stock: 0,
        warehouse: 30,
        description: "",
        expiry: futureDate(365),
        manufacturer: "",
        shelfId: shelves[0]?.id ?? null,
        color: SHELF_COLORS[0]!,
        pack: "box",
        image: undefined,
      }
    : value;
  const [form, setForm] = useState(base);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.name.trim()) {
      audio.error();
      return;
    }
    if (isNew) addMedicine(form);
    else updateMedicine((value as Medicine).id, form);
    audio.success();
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-deep/50 p-3 backdrop-blur-sm animate-fade-in">
      <div className="glass-panel animate-panel-in max-h-full w-full max-w-lg overflow-y-auto rounded-3xl p-4">
        <h3 className="mb-3 font-display text-lg font-bold">{isNew ? "إضافة دواء" : "تعديل الدواء"}</h3>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <label className="col-span-full text-xs font-medium text-muted-foreground">
            الاسم
            <input className={field} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            القسم
            <select className={field} value={form.category} onChange={(e) => set("category", e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            الرف
            <select
              className={field}
              value={form.shelfId ?? ""}
              onChange={(e) => set("shelfId", e.target.value || null)}
            >
              <option value="">بدون رف</option>
              {shelves.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            السعر (ريال يمني)
            <input type="number" className={field} value={form.price} onChange={(e) => set("price", num(e.target.value, 0, 0, 1_000_000))} />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            المعروض على الرف
            <input type="number" className={field} value={form.stock} onChange={(e) => set("stock", num(e.target.value, 0, 0, 100_000))} />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            الكمية في المخزن
            <input
              type="number"
              className={field}
              value={form.warehouse}
              onChange={(e) => set("warehouse", num(e.target.value, 0, 0, 1_000_000))}
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            تاريخ الانتهاء
            <input type="date" className={field} value={form.expiry} onChange={(e) => set("expiry", e.target.value)} />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            الشركة المصنعة
            <input className={field} value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            شكل العبوة
            <select className={field} value={form.pack} onChange={(e) => set("pack", e.target.value as PackStyle)}>
              {PACKS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
          <div className="text-xs font-medium text-muted-foreground">
            لون العبوة
            <div className="mt-1.5 flex gap-2">
              {SHELF_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => set("color", c)}
                  className={`size-8 rounded-full transition ${form.color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <div className="col-span-full text-xs font-medium text-muted-foreground">
            صورة الدواء (اختيارية)
            <div className="mt-1.5 flex items-center gap-3">
              {form.image ? (
                <img src={form.image} alt="" className="size-16 rounded-xl object-cover" />
              ) : (
                <span
                  className="grid size-16 place-items-center rounded-xl text-xs text-muted-foreground"
                  style={{ background: form.color }}
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void thumbnail(f).then((d) => set("image", d));
                }}
                className="text-xs"
              />
              {form.image && (
                <button
                  onClick={() => set("image", undefined)}
                  className={`${btn} bg-danger/12 text-danger !px-3`}
                >
                  إزالة
                </button>
              )}
            </div>
          </div>
          <label className="col-span-full text-xs font-medium text-muted-foreground">
            الوصف
            <textarea
              className={`${field} min-h-20`}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={save} className={`${btn} flex-1 bg-primary text-primary-foreground`}>
            حفظ
          </button>
          <button onClick={onClose} className={`${btn} bg-secondary text-secondary-foreground`}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- shelves */

function StorageTab() {
  const { medicines, shelves, stockShelf, stockWarehouse, purchase, balance } = useGame();
  const [q, setQ] = useState("");
  const [step, setStep] = useState(5);

  const list = useMemo(() => {
    const t = q.trim();
    return medicines.filter((m) => !t || m.name.includes(t) || m.manufacturer.includes(t));
  }, [medicines, q]);

  const totalStored = medicines.reduce((a, m) => a + (m.warehouse ?? 0), 0);
  const totalShelf = medicines.reduce((a, m) => a + m.stock, 0);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-3">
        <h3 className="font-display text-sm font-bold">مخزن الأدوية</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          كل كمية تشتريها تدخل المخزن أولاً، ثم تنقل منها ما تريد عرضه على الرفوف.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary/12 px-3 py-1 text-xs font-semibold text-primary">
            في المخزن {totalStored}
          </span>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
            على الرفوف {totalShelf}
          </span>
          <label className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
            مقدار النقل
            <select className={`${field} w-auto`} value={step} onChange={(e) => setStep(+e.target.value)}>
              {[1, 5, 10, 25].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث في المخزن…"
          className={`${field} pr-9`}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((m) => {
          const shelf = shelves.find((s) => s.id === m.shelfId);
          const wh = m.warehouse ?? 0;
          return (
            <article key={m.id} className="animate-rise rounded-2xl border border-border/70 bg-card/80 p-3">
              <div className="flex items-center gap-3">
                {m.image ? (
                  <img src={m.image} alt={m.name} loading="lazy" className="size-9 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="size-9 shrink-0 rounded-xl" style={{ background: m.color }} />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold">{m.name}</h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.category} • {shelf ? shelf.name : "بدون رف"}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (purchase(m.id, 10)) audio.success();
                    else audio.error();
                  }}
                  disabled={purchaseCost(m.price, 10) > balance}
                  className={`${btn} shrink-0 bg-secondary text-secondary-foreground !px-3 disabled:opacity-50`}
                  title={money(purchaseCost(m.price, 10))}
                >
                  <Plus className="size-4" /> شراء ١٠ ({money(purchaseCost(m.price, 10))})
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-muted/70 py-1.5">
                  <p className="text-[10px] text-muted-foreground">المخزن</p>
                  <p className="text-sm font-bold">{wh}</p>
                </div>
                <div className="rounded-xl bg-muted/70 py-1.5">
                  <p className="text-[10px] text-muted-foreground">على الرف</p>
                  <p className="text-sm font-bold">{m.stock}</p>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  disabled={wh <= 0}
                  onClick={() => {
                    audio.click();
                    stockShelf(m.id, step);
                  }}
                  className={`${btn} flex-1 bg-primary text-primary-foreground disabled:opacity-45`}
                >
                  إلى الرف +{step}
                </button>
                <button
                  disabled={m.stock <= 0}
                  onClick={() => {
                    audio.click();
                    stockWarehouse(m.id, step);
                  }}
                  className={`${btn} flex-1 bg-secondary text-secondary-foreground disabled:opacity-45`}
                >
                  إلى المخزن +{step}
                </button>
              </div>
            </article>
          );
        })}
        {!list.length && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">المخزن فارغ</p>
        )}
      </div>
    </div>
  );
}

function ShelvesTab() {
  const { shelves, medicines, addShelf, updateShelf, removeShelf } = useGame();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("أدوية");
  const [color, setColor] = useState(SHELF_COLORS[0]!);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-3">
        <h3 className="mb-2 font-display text-sm font-bold">إنشاء رف جديد</h3>
        <div className="flex flex-wrap items-end gap-2">
          <input
            className={`${field} min-w-40 flex-1`}
            placeholder="اسم الرف"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select className={`${field} w-auto`} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="flex gap-1.5">
            {SHELF_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`size-8 rounded-full transition ${color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-card" : ""}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
          <button
            onClick={() => {
              if (!name.trim()) return audio.error();
              addShelf({ name: name.trim(), category, color, capacity: 40 });
              audio.success();
              setName("");
            }}
            className={`${btn} bg-primary text-primary-foreground`}
          >
            <Plus className="size-4" /> إضافة
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {shelves.map((s) => {
          const count = medicines.filter((m) => m.shelfId === s.id).length;
          return (
            <div key={s.id} className="animate-rise rounded-2xl border border-border/70 bg-card/80 p-3">
              <div className="flex items-center gap-3">
                <span className="size-3.5 rounded-full" style={{ background: s.color }} />
                <input
                  value={s.name}
                  onChange={(e) => updateShelf(s.id, { name: e.target.value })}
                  className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
                />
                <button
                  onClick={() => {
                    audio.error();
                    removeShelf(s.id);
                  }}
                  className={`${btn} size-9 !px-0 bg-danger/12 text-danger`}
                  aria-label="حذف الرف"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.category} • {count} منتج من أصل {s.capacity}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (count / s.capacity) * 100)}%`, background: s.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ stats */

function StatsTab() {
  const { medicines, shelves } = useGame();
  const total = medicines.reduce((a, m) => a + m.price * m.stock, 0);
  const low = medicines.filter((m) => m.stock <= 5);
  const expired = medicines.filter((m) => new Date(m.expiry).getTime() < Date.now());
  const soon = medicines.filter((m) => {
    const d = (new Date(m.expiry).getTime() - Date.now()) / 86400000;
    return d >= 0 && d < 90;
  });

  const byCat = CATEGORIES.map((c) => ({
    c,
    n: medicines.filter((m) => m.category === c).length,
  })).filter((x) => x.n);
  const max = Math.max(1, ...byCat.map((b) => b.n));

  const cards = [
    { label: "قيمة المخزون", value: money(total) },
    { label: "عدد الأصناف", value: medicines.length },
    { label: "عدد الرفوف", value: shelves.length },
    { label: "مخزون منخفض", value: low.length },
    { label: "قريب الانتهاء", value: soon.length },
    { label: "منتهي الصلاحية", value: expired.length },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="animate-rise rounded-2xl border border-border/70 bg-card/80 p-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-display text-xl font-bold text-primary">{c.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
        <h3 className="mb-3 font-display text-sm font-bold">التوزيع حسب القسم</h3>
        <div className="space-y-2.5">
          {byCat.map((b, i) => (
            <div key={b.c} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{b.c}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(b.n / max) * 100}%`, background: SHELF_COLORS[i % SHELF_COLORS.length] }}
                />
              </div>
              <span className="w-6 text-xs font-semibold">{b.n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Downscale any picked image to a 192px square JPEG data-URL. */
async function thumbnail(file: File, size = 192): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const x = c.getContext("2d")!;
    const s2 = Math.min(img.width, img.height);
    x.drawImage(img, (img.width - s2) / 2, (img.height - s2) / 2, s2, s2, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* --------------------------------------------------------------- settings */

function SettingsTab() {
  const { settings, setSettings, reset, importSave } = useGame();
  const [msg, setMsg] = useState("");

  const exportSave = () => {
    const data = localStorage.getItem("pharmasim-save-v1") ?? "{}";
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "pharmacy-save.json";
    a.click();
    URL.revokeObjectURL(url);
    audio.success();
  };

  const importFile = (file: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result));
        const res = parseSave(parsed.state ?? parsed);
        if (!res.ok) {
          audio.error();
          setMsg(`ملف غير صالح: ${res.error}`);
          return;
        }
        importSave(res.data);
        audio.success();
        setMsg("تم استيراد النسخة الاحتياطية بنجاح");
      } catch {
        audio.error();
        setMsg("ملف غير صالح");
      }
    };
    r.readAsText(file);
  };

  const Slider = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
    <label className="block rounded-2xl border border-border/70 bg-card/80 p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-primary"
      />
    </label>
  );

  return (
    <div className="space-y-2.5">
      <Slider label="حساسية اللمس" value={settings.sensitivity} onChange={(v) => setSettings({ sensitivity: v })} />
      <Slider label="مستوى الموسيقى" value={settings.music} onChange={(v) => setSettings({ music: v })} />
      <Slider label="مستوى المؤثرات" value={settings.sfx} onChange={(v) => setSettings({ sfx: v })} />

      <div className="rounded-2xl border border-border/70 bg-card/80 p-3">
        <p className="mb-2 text-sm font-medium">جودة الرسوميات</p>
        <div className="flex gap-2">
          {(["low", "medium", "high"] as const).map((q) => (
            <button
              key={q}
              onClick={() => {
                audio.click();
                setSettings({ quality: q });
              }}
              className={`${btn} flex-1 ${
                settings.quality === q ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {q === "low" ? "منخفضة" : q === "medium" ? "متوسطة" : "عالية"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">يتم تطبيق الجودة عند إعادة تشغيل اللعبة.</p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/80 p-3">
        <p className="mb-2 text-sm font-medium">المظهر</p>
        <div className="flex gap-2">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                audio.click();
                setSettings({ theme: t });
              }}
              className={`${btn} flex-1 ${
                settings.theme === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {t === "light" ? "فاتح" : "داكن"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={exportSave} className={`${btn} flex-1 bg-secondary text-secondary-foreground`}>
          <Download className="size-4" /> تصدير النسخة
        </button>
        <label className={`${btn} flex-1 cursor-pointer bg-secondary text-secondary-foreground`}>
          <Upload className="size-4" /> استيراد نسخة
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
          />
        </label>
        <button
          onClick={() => {
            if (confirm("إعادة ضبط اللعبة بالكامل؟")) {
              reset();
              audio.success();
            }
          }}
          className={`${btn} flex-1 bg-danger/12 text-danger`}
        >
          <RotateCcw className="size-4" /> إعادة الضبط
        </button>
      </div>
      {msg && <p className="text-center text-xs text-primary">{msg}</p>}
    </div>
  );
}