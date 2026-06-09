// Konfigurácia API — nastavte API_BASE_URL na URL vášho Node.js backendu
// Pre Lovable Cloud preview nechajte undefined (použije sa server functions)
// Pre self-hosting: API_BASE_URL = "https://vas-server.sk/api" alebo "/api" ak je na rovnakej doméne

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Ak je nastavený API_BASE_URL, frontend volá externý backend cez fetch
// Inak použije TanStack server functions (Lovable Cloud)
export const USE_EXTERNAL_API = !!API_BASE_URL;
