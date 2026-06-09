import { API_BASE_URL, USE_EXTERNAL_API } from "./api.config";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ====== External API helpers ======

async function apiFetch(path: string, options?: RequestInit) {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
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

// ====== Server Functions (Lovable Cloud mode) ======

export const createTask = createServerFn({ method: "POST" })
  .inputValidator((data: { licensePlate: string; countryCode: string; vignetteType: string; validityDate: string; email: string }) => {
    return z.object({
      licensePlate: z.string().min(3).max(15),
      countryCode: z.string().min(1),
      vignetteType: z.string().min(1),
      validityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      email: z.string().email(),
    }).parse(data);
  })
  .handler(async ({ data }) => {
    if (USE_EXTERNAL_API) {
      return apiFetch("/tasks", {
        method: "POST",
        body: JSON.stringify(data),
      });
    }

    const { data: task, error } = await supabaseAdmin
      .from("tasks")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        license_plate: data.licensePlate,
        country_code: data.countryCode,
        vignette_type: data.vignetteType,
        validity_date: data.validityDate,
        email: data.email,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return task;
  });

export const getTasks = createServerFn({ method: "GET" })
  .handler(async () => {
    if (USE_EXTERNAL_API) {
      return apiFetch("/tasks");
    }

    const { data: tasks, error } = await supabaseAdmin
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return tasks || [];
  });

export const getTask = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => {
    return z.object({ id: z.string().uuid() }).parse(data);
  })
  .handler(async ({ data }) => {
    if (USE_EXTERNAL_API) {
      return apiFetch(`/tasks/${data.id}`);
    }

    const { data: task, error } = await supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("id", data.id)
      .single();

    if (error) throw new Error(error.message);
    if (!task) throw new Error("Úloha nenájdená");
    return task;
  });

export const getTaskLogs = createServerFn({ method: "GET" })
  .inputValidator((data: { taskId: string }) => {
    return z.object({ taskId: z.string().uuid() }).parse(data);
  })
  .handler(async ({ data }) => {
    if (USE_EXTERNAL_API) {
      return apiFetch(`/tasks/${data.taskId}/logs`);
    }

    const { data: logs, error } = await supabaseAdmin
      .from("task_logs")
      .select("*")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return logs || [];
  });

export const getTaskScreenshots = createServerFn({ method: "GET" })
  .inputValidator((data: { taskId: string }) => {
    return z.object({ taskId: z.string().uuid() }).parse(data);
  })
  .handler(async ({ data }) => {
    if (USE_EXTERNAL_API) {
      return apiFetch(`/tasks/${data.taskId}/screenshots`);
    }

    const { data: screenshots, error } = await supabaseAdmin
      .from("task_screenshots")
      .select("*")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return screenshots || [];
  });

export const deleteTask = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    return z.object({ id: z.string().uuid() }).parse(data);
  })
  .handler(async ({ data }) => {
    if (USE_EXTERNAL_API) {
      return apiFetch(`/tasks/${data.id}`, { method: "DELETE" });
    }

    const { error } = await supabaseAdmin
      .from("tasks")
      .delete()
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
