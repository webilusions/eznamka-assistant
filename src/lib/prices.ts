import { supabase } from "@/integrations/supabase/client";

export type VignetteKey = "1year" | "1month" | "10day" | "1day";

export const DEFAULT_PRICES: Record<VignetteKey, number> = {
  "1year": 90.0,
  "1month": 17.1,
  "10day": 10.8,
  "1day": 8.1,
};

const STORAGE_KEY = "vignette_prices_v1";
const SETTINGS_KEY = "vignette_prices";

// Synchronous read from localStorage cache (used by forms during render).
export function loadPrices(): Record<VignetteKey, number> {
  if (typeof window === "undefined") return { ...DEFAULT_PRICES };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRICES };
    return { ...DEFAULT_PRICES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PRICES };
  }
}

// Fetch from DB, update localStorage cache, return prices.
export async function fetchPrices(): Promise<Record<VignetteKey, number>> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error || !data) return loadPrices();
  const merged = { ...DEFAULT_PRICES, ...(data.value as Record<VignetteKey, number>) };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {}
  return merged;
}

// Persist to DB and update localStorage cache.
export async function savePrices(prices: Record<VignetteKey, number>): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prices));
  } catch {}
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value: prices }, { onConflict: "key" });
  if (error) throw error;
}

export function formatPriceEUR(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} EUR`;
}
