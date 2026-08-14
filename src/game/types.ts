export type Category =
  | "أدوية"
  | "فيتامينات"
  | "تجميل"
  | "معدات طبية"
  | "عناية بالطفل"
  | "مبردات";

export const CATEGORIES: Category[] = [
  "أدوية",
  "فيتامينات",
  "تجميل",
  "معدات طبية",
  "عناية بالطفل",
  "مبردات",
];

export type PackStyle = "box" | "bottle" | "tube" | "jar" | "kit";

export interface Medicine {
  id: string;
  name: string;
  category: Category;
  price: number;
  stock: number;
  /** Units sitting in the back storage room (not displayed on the shelves). */
  warehouse: number;
  description: string;
  expiry: string; // YYYY-MM-DD
  barcode: string;
  manufacturer: string;
  shelfId: string | null;
  color: string;
  pack: PackStyle;
}

export interface Shelf {
  id: string;
  name: string;
  category: Category;
  color: string;
  capacity: number;
  slot: number;
}

export interface Settings {
  sensitivity: number;
  music: number;
  sfx: number;
  quality: "low" | "medium" | "high";
  theme: "light" | "dark";
}

export interface SaveData {
  medicines: Medicine[];
  shelves: Shelf[];
  settings: Settings;
  player: { x: number; z: number; yaw: number };
  visited: boolean;
}