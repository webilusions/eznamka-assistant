export type VignetteKey = "1year" | "1month" | "10day" | "1day";

export const DEFAULT_PRICES: Record<VignetteKey, number> = {
  "1year": 90.0,
  "1month": 17.1,
  "10day": 10.8,
  "1day": 8.1,
};

const STORAGE_KEY = "vignette_prices_v1";

export function loadPrices(): Record<VignetteKey, number> {
  if (typeof window === "undefined") return { ...DEFAULT_PRICES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRICES };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PRICES, ...parsed };
  } catch {
    return { ...DEFAULT_PRICES };
  }
}

export function savePrices(prices: Record<VignetteKey, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prices));
}

export function formatPriceEUR(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} EUR`;
}
