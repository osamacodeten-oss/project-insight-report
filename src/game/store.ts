import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Medicine, SaveData, Settings, Shelf, Category } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

const PALETTE: string[] = [
  "#2fb59c",
  "#3d7ef0",
  "#f0a13d",
  "#e0607e",
  "#7a63e8",
  "#4fb84f",
];

function barcode() {
  return Array.from({ length: 13 }, () => Math.floor(Math.random() * 10)).join("");
}

function future(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const seedShelves: Shelf[] = [
  { id: "s1", name: "المسكنات", category: "أدوية", color: PALETTE[0]!, capacity: 40, slot: 0 },
  { id: "s2", name: "المضادات الحيوية", category: "أدوية", color: PALETTE[1]!, capacity: 40, slot: 1 },
  { id: "s3", name: "الفيتامينات", category: "فيتامينات", color: PALETTE[5]!, capacity: 40, slot: 2 },
  { id: "s4", name: "العناية والتجميل", category: "تجميل", color: PALETTE[3]!, capacity: 40, slot: 3 },
  { id: "s5", name: "المعدات الطبية", category: "معدات طبية", color: PALETTE[4]!, capacity: 40, slot: 4 },
  { id: "s6", name: "عناية الطفل", category: "عناية بالطفل", color: PALETTE[2]!, capacity: 40, slot: 5 },
];

type Seed = [string, Category, number, number, string, string, Medicine["pack"], string];
const seedRaw: Seed[] = [
  ["بنادول إكسترا", "أدوية", 12, 24, "مسكن للألم وخافض للحرارة", "GSK", "box", "s1"],
  ["بروفين 400", "أدوية", 15, 18, "مضاد للالتهاب ومسكن قوي", "Abbott", "box", "s1"],
  ["أسبرين 100", "أدوية", 9, 30, "مميع للدم وقائي", "Bayer", "box", "s1"],
  ["فولتارين جل", "أدوية", 28, 12, "جل موضعي لآلام العضلات", "Novartis", "tube", "s1"],
  ["أوجمنتين 1g", "أدوية", 42, 10, "مضاد حيوي واسع الطيف", "GSK", "box", "s2"],
  ["أزيثرومايسين", "أدوية", 35, 14, "مضاد حيوي ثلاثي الأيام", "Pfizer", "box", "s2"],
  ["أموكسيسيلين شراب", "أدوية", 22, 16, "مضاد حيوي للأطفال", "Julphar", "bottle", "s2"],
  ["فيتامين د 50000", "فيتامينات", 45, 20, "مكمل أسبوعي لفيتامين د", "Solgar", "jar", "s3"],
  ["أوميغا 3", "فيتامينات", 65, 15, "زيت سمك عالي النقاء", "Nordic", "jar", "s3"],
  ["فيتامين سي 1000", "فيتامينات", 38, 22, "داعم للمناعة فوّار", "Redoxon", "bottle", "s3"],
  ["حديد + فوليك", "فيتامينات", 30, 18, "مكمل للحديد وحمض الفوليك", "Ferrose", "box", "s3"],
  ["كريم مرطب", "تجميل", 55, 14, "مرطب يومي للبشرة الجافة", "CeraVe", "tube", "s4"],
  ["واقي شمس 50+", "تجميل", 89, 9, "حماية عالية من الشمس", "La Roche", "tube", "s4"],
  ["شامبو طبي", "تجميل", 47, 11, "لعلاج القشرة", "Vichy", "bottle", "s4"],
  ["جهاز ضغط رقمي", "معدات طبية", 210, 6, "قياس دقيق للضغط", "Omron", "kit", "s5"],
  ["ترمومتر رقمي", "معدات طبية", 35, 12, "قياس سريع للحرارة", "Braun", "kit", "s5"],
  ["كمامات طبية", "معدات طبية", 18, 40, "علبة 50 كمامة", "MedPro", "box", "s5"],
  ["حليب أطفال 1", "عناية بالطفل", 72, 12, "تركيبة للرضع", "Nan", "jar", "s6"],
  ["حفاضات مقاس 3", "عناية بالطفل", 68, 10, "عبوة اقتصادية", "Pampers", "box", "s6"],
  ["مغص الرضع", "عناية بالطفل", 26, 15, "قطرات ملطفة", "Infacol", "bottle", "s6"],
];

const seedMedicines: Medicine[] = seedRaw.map((m, i) => ({
  id: "m" + i,
  name: m[0],
  category: m[1],
  price: m[2],
  stock: m[3],
  warehouse: m[3] * 2 + 10,
  description: m[4],
  manufacturer: m[5],
  pack: m[6],
  shelfId: m[7],
  expiry: future(60 + i * 37),
  barcode: barcode(),
  color: PALETTE[i % PALETTE.length]!,
}));

const defaultSettings: Settings = {
  sensitivity: 1,
  music: 0.35,
  sfx: 0.6,
  quality: "high",
  theme: "light",
};

interface GameStore extends SaveData {
  addShelf: (s: Omit<Shelf, "id" | "slot">) => void;
  updateShelf: (id: string, patch: Partial<Shelf>) => void;
  removeShelf: (id: string) => void;
  addMedicine: (m: Omit<Medicine, "id" | "barcode">) => void;
  updateMedicine: (id: string, patch: Partial<Medicine>) => void;
  removeMedicine: (id: string) => void;
  /** Move units from the storage room onto the display shelf. */
  stockShelf: (id: string, qty: number) => void;
  /** Return units from the display shelf back to the storage room. */
  stockWarehouse: (id: string, qty: number) => void;
  /** Purchase new units — they always land in the storage room first.
   *  Returns false when the balance is not enough. */
  purchase: (id: string, qty: number) => boolean;
  /** Sell units straight off the shelf (adds the price to the balance). */
  sell: (id: string, qty: number) => boolean;
  setSettings: (patch: Partial<Settings>) => void;
  setPlayer: (p: { x: number; z: number; yaw: number }) => void;
  setVisited: (v: boolean) => void;
  importSave: (data: Partial<SaveData>) => void;
  reset: () => void;
}

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      medicines: seedMedicines,
      shelves: seedShelves,
      settings: defaultSettings,
      balance: 25000,
      player: { x: 0, z: 8, yaw: 0 },
      visited: false,


      addShelf: (s) => {
        const used = new Set(get().shelves.map((x) => x.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        set({ shelves: [...get().shelves, { ...s, id: uid(), slot }] });
      },
      updateShelf: (id, patch) =>
        set({ shelves: get().shelves.map((s) => (s.id === id ? { ...s, ...patch } : s)) }),
      removeShelf: (id) =>
        set({
          shelves: get().shelves.filter((s) => s.id !== id),
          medicines: get().medicines.map((m) =>
            m.shelfId === id ? { ...m, shelfId: null } : m,
          ),
        }),

      addMedicine: (m) =>
        set({ medicines: [...get().medicines, { ...m, id: uid(), barcode: barcode() }] }),
      updateMedicine: (id, patch) =>
        set({ medicines: get().medicines.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),
      removeMedicine: (id) => set({ medicines: get().medicines.filter((m) => m.id !== id) }),

      stockShelf: (id, qty) =>
        set({
          medicines: get().medicines.map((m) => {
            if (m.id !== id) return m;
            const n = Math.max(0, Math.min(qty, m.warehouse ?? 0));
            return { ...m, warehouse: (m.warehouse ?? 0) - n, stock: m.stock + n };
          }),
        }),
      stockWarehouse: (id, qty) =>
        set({
          medicines: get().medicines.map((m) => {
            if (m.id !== id) return m;
            const n = Math.max(0, Math.min(qty, m.stock));
            return { ...m, stock: m.stock - n, warehouse: (m.warehouse ?? 0) + n };
          }),
        }),
      purchase: (id, qty) =>
        set({
          medicines: get().medicines.map((m) =>
            m.id === id ? { ...m, warehouse: (m.warehouse ?? 0) + Math.max(0, qty) } : m,
          ),
        }),

      setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      setPlayer: (player) => set({ player }),
      setVisited: (visited) => set({ visited }),
      importSave: (data) => set({ ...get(), ...data }),
      reset: () =>
        set({
          medicines: seedMedicines,
          shelves: seedShelves,
          settings: defaultSettings,
          player: { x: 0, z: 8, yaw: 0 },
          visited: false,
        }),
    }),
    {
      name: "pharmasim-save-v1",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (state: unknown) => {
        const s = state as Partial<SaveData>;
        if (s?.medicines)
          s.medicines = s.medicines.map((m) => ({ ...m, warehouse: m.warehouse ?? 0 }));
        return s as SaveData;
      },
      partialize: (s) => ({
        medicines: s.medicines,
        shelves: s.shelves,
        settings: s.settings,
        player: s.player,
        visited: s.visited,
      }),
    },
  ),
);

export const SHELF_COLORS = PALETTE;
export const newBarcode = barcode;
export const futureDate = future;