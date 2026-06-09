// Konfigurácia API base URL
// - V Lovable preview => undefined => použijú sa Supabase server functions (Lovable Cloud)
// - V produkcii (statický dist na Websupporte) => použije sa externý backend
// - Možno prepísať cez VITE_API_BASE_URL pri builde

const DEFAULT_EXTERNAL_API = "https://dialnica.kozart.sk/api";

function resolveApiBaseUrl(): string | undefined {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (fromEnv) return fromEnv;

  if (typeof window === "undefined") return undefined;

  const host = window.location.hostname;
  const isLovable =
    host.endsWith("lovable.app") ||
    host.endsWith("lovable.dev") ||
    host.endsWith("lovableproject.com") ||
    host.endsWith("lovable.host");
  const isLocalDev = host === "localhost" || host === "127.0.0.1";

  // V Lovable preview a lokálnom dev nepoužívame externé API
  if (isLovable || isLocalDev) return undefined;

  // Inak (Websupport statický dist) volaj externý backend
  return DEFAULT_EXTERNAL_API;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const USE_EXTERNAL_API = !!API_BASE_URL;
