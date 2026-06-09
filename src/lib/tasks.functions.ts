import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ====== Server Functions (Lovable Cloud mode) ======

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { licensePlate: string; countryCode: string; vignetteType: string; validityDate: string; email: string }) => {
    return z.object({
      licensePlate: z.string().min(3).max(15),
      countryCode: z.string().min(1),
      vignetteType: z.string().min(1),
      validityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      email: z.string().email(),
    }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: tasks, error } = await context.supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return tasks || [];
  });

export const getTask = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    return z.object({ id: z.string().uuid() }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const { data: task, error } = await context.supabase
      .from("tasks")
      .select("*")
      .eq("id", data.id)
      .single();

    if (error) throw new Error(error.message);
    if (!task) throw new Error("Úloha nenájdená");
    return task;
  });

export const getTaskLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { taskId: string }) => {
    return z.object({ taskId: z.string().uuid() }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const { data: logs, error } = await context.supabase
      .from("task_logs")
      .select("*")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return logs || [];
  });

export const getTaskScreenshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { taskId: string }) => {
    return z.object({ taskId: z.string().uuid() }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const { data: screenshots, error } = await context.supabase
      .from("task_screenshots")
      .select("*")
      .eq("task_id", data.taskId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    return screenshots || [];
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    return z.object({ id: z.string().uuid() }).parse(data);
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tasks")
      .delete()
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { success: true };
  });
