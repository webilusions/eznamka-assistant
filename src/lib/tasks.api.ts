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

  const baseUrl = API_BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      msg = j.error || j.message || msg;
      if (j.detail) msg += ` — ${j.detail}`;
    } catch {
      if (text) msg += `: ${text.slice(0, 200)}`;
    }
    throw new Error(msg);
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
  runTask: (id: string) => apiFetch<{ success: boolean; message: string }>(`/tasks/${id}/run`, { method: "POST" }),
  checkValidity: (data: { licensePlate: string; countryCode: string; validityDate?: string }) =>
    apiFetch<{ conflict: boolean; summary: string; reasons?: string[]; vignettes?: any[]; body_preview?: string }>("/check", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};