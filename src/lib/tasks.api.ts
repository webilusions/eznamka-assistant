import { API_BASE_URL } from "./api.config";

export type CreateTaskInput = {
  licensePlate: string;
  countryCode: string;
  vignetteType: string;
  validityDate: string;
  email: string;
};

export const isExternalApiEnabled = () => Boolean(API_BASE_URL);

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("Externé API nie je nastavené");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Neznáma chyba" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const externalTasksApi = {
  createTask: (data: CreateTaskInput) =>
    apiFetch<any>("/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getTasks: () => apiFetch<any[]>("/tasks"),
  getTask: (id: string) => apiFetch<any>(`/tasks/${id}`),
  getTaskLogs: (taskId: string) => apiFetch<any[]>(`/tasks/${taskId}/logs`),
  getTaskScreenshots: (taskId: string) => apiFetch<any[]>(`/tasks/${taskId}/screenshots`),
  deleteTask: (id: string) => apiFetch<{ success: boolean }>(`/tasks/${id}`, { method: "DELETE" }),
};