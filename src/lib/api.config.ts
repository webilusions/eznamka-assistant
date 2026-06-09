// Vždy volaj externý backend na dialnica.kozart.sk
// Možno prepísať cez VITE_API_BASE_URL pri builde
const DEFAULT_EXTERNAL_API = "https://dialnica.kozart.sk/api";

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || DEFAULT_EXTERNAL_API;
export const USE_EXTERNAL_API = true;
