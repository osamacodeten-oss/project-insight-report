/**
 * Single source of truth for branding, currency and date maths.
 * Import from here instead of hard-coding names, currency symbols or
 * duplicating expiry calculations.
 */

export const PHARMACY_NAME = "عبدالرحمن";
export const PHARMACY_FULL_NAME = "صيدلية عبدالرحمن";
export const PHARMACY_LATIN = "ABDULRAHMAN PHARMACY";

export const CURRENCY = {
  code: "YER",
  /** Short label used next to numbers inside compact UI. */
  short: "ريال",
  /** Full label used in headings and totals. */
  long: "ريال يمني",
} as const;

const nf = new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 });

/** `1٬250 ريال` — the canonical way to print any amount in the game. */
export function money(amount: number, long = false) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${nf.format(Math.round(n))} ${long ? CURRENCY.long : CURRENCY.short}`;
}

/** Whole days until the expiry date (negative when already expired). */
export function daysUntil(expiry: string) {
  const t = Date.parse(expiry);
  if (Number.isNaN(t)) return 0;
  return Math.round((t - Date.now()) / 86400000);
}

export type ExpiryState = "ok" | "warn" | "expired";

export function expiryState(expiry: string): ExpiryState {
  const d = daysUntil(expiry);
  if (d < 0) return "expired";
  if (d < 90) return "warn";
  return "ok";
}

/** Safe numeric input parsing — never lets `NaN` reach the store. */
export function num(value: string | number, fallback = 0, min = 0, max = 1_000_000) {
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Wholesale cost of a unit — buying is 60% of the shelf price. */
export const COST_RATIO = 0.6;
export function purchaseCost(price: number, qty: number) {
  return Math.round(num(price) * COST_RATIO * Math.max(0, Math.round(qty)));
}
