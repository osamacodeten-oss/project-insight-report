import { z } from "zod";
import { CATEGORIES } from "./types";

/** Runtime validation for anything that enters the store from outside
 *  (imported save files, pasted JSON, legacy localStorage snapshots). */

const category = z.enum(CATEGORIES as [string, ...string[]]);
const pack = z.enum(["box", "bottle", "tube", "jar", "kit"]);

export const medicineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  category,
  price: z.number().finite().min(0).max(1_000_000),
  stock: z.number().finite().min(0).max(100_000),
  warehouse: z.number().finite().min(0).max(1_000_000).catch(0),
  description: z.string().max(500).catch(""),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  barcode: z.string().max(32).catch(""),
  manufacturer: z.string().max(80).catch(""),
  shelfId: z.string().nullable().catch(null),
  color: z.string().max(32),
  pack: pack.catch("box"),
  /** Optional data-URL / https thumbnail of the drug. */
  image: z.string().max(2_000_000).optional(),
});

export const shelfSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  category,
  color: z.string().max(32),
  capacity: z.number().finite().min(1).max(500).catch(40),
  slot: z.number().finite().min(0).max(999).catch(0),
});

export const settingsSchema = z.object({
  sensitivity: z.number().finite().min(0).max(2).catch(1),
  music: z.number().finite().min(0).max(2).catch(0.35),
  sfx: z.number().finite().min(0).max(2).catch(0.6),
  quality: z.enum(["low", "medium", "high"]).catch("medium"),
  theme: z.enum(["light", "dark"]).catch("light"),
});

export const saveSchema = z.object({
  medicines: z.array(medicineSchema).max(2000).optional(),
  shelves: z.array(shelfSchema).max(200).optional(),
  settings: settingsSchema.partial().optional(),
  balance: z.number().finite().min(0).max(1_000_000_000).optional(),
  player: z
    .object({
      x: z.number().finite(),
      z: z.number().finite(),
      yaw: z.number().finite(),
    })
    .optional(),
});

export type ValidatedSave = z.infer<typeof saveSchema>;

/** Returns the sanitised payload, or an error message describing why not. */
export function parseSave(raw: unknown): { ok: true; data: ValidatedSave } | { ok: false; error: string } {
  const source =
    raw && typeof raw === "object" && "state" in (raw as Record<string, unknown>)
      ? (raw as { state: unknown }).state
      : raw;
  const result = saveSchema.safeParse(source);
  if (!result.success) {
    const first = result.error.issues[0];
    return { ok: false, error: first ? `${first.path.join(".") || "الملف"}: ${first.message}` : "ملف غير صالح" };
  }
  if (!result.data.medicines && !result.data.shelves && !result.data.settings) {
    return { ok: false, error: "الملف لا يحتوي على بيانات صيدلية" };
  }
  return { ok: true, data: result.data };
}
