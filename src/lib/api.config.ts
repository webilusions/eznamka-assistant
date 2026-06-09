// Konfigurácia API base URL
// - V Lovable preview (hostname obsahuje "lovable") => undefined => použijú sa Supabase server functions
// - Inak (váš self-hosted server, kde nahráte /dist) => použije sa relatívne "/api" na rovnakej doméne
// - Možno prepísať cez VITE_API_BASE_URL pri builde

function resolveApiBaseUrl(): string | undefined {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (fromEnv) return fromEnv;

  if (typeof window === "undefined") return undefined;

  const host = window.location.hostname;
  const isLovable = host.endsWith("lovable.app") || host.endsWith("lovable.dev");
  const isLocalDev = host === "localhost" || host === "127.0.0.1";

  if (isLovable || isLocalDev) return undefined;

  // Self-hosted: backend beží na rovnakej doméne pod /api
  return "/api";
}

export const API_BASE_URL = resolveApiBaseUrl();
export const USE_EXTERNAL_API = !!API_BASE_URL;
