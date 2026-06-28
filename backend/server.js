import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { z } from "zod";
import { runPurchase } from "./runner.js";

const {
  PORT = 3001,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CORS_ORIGIN = "*",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY v .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Health check
app.get("/api/health", (_, res) => res.json({ ok: true }));

// Schemas
const createTaskSchema = z.object({
  licensePlate: z.string().min(3).max(15),
  countryCode: z.string().min(1),
  vignetteType: z.string().min(1),
  validityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email(),
});

// POST /api/tasks
app.post("/api/tasks", async (req, res) => {
  try {
    const data = createTaskSchema.parse(req.body);
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        license_plate: data.licensePlate,
        country_code: data.countryCode,
        vignette_type: data.vignetteType,
        validity_date: data.validityDate,
        email: data.email,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;
    res.json(task);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/tasks
app.get("/api/tasks", async (_, res) => {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tasks/:id
app.get("/api/tasks/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

// GET /api/tasks/:id/logs
app.get("/api/tasks/:taskId/logs", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("task_logs")
      .select("*")
      .eq("task_id", req.params.taskId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tasks/:id/screenshots
app.get("/api/tasks/:taskId/screenshots", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("task_screenshots")
      .select("*")
      .eq("task_id", req.params.taskId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    // Refresh signed URLs (bucket je privátny)
    const result = await Promise.all(
      (data || []).map(async (row) => {
        const path = row.storage_path || row.screenshot_url;
        if (!path || path.startsWith("http")) return row;
        const { data: signed } = await supabase.storage
          .from("task-screenshots")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        return { ...row, screenshot_url: signed?.signedUrl || row.screenshot_url };
      })
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// DELETE /api/tasks/:id
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tasks/:id/run — spustí Playwright automatizáciu na pozadí
app.post("/api/tasks/:id/run", async (req, res) => {
  const id = req.params.id;
  try {
    const { data: task, error } = await supabase.from("tasks").select("*").eq("id", id).single();
    if (error || !task) return res.status(404).json({ error: "Task not found" });

    // fire-and-forget
    res.json({ success: true, message: "Spúšťam automatizáciu na pozadí" });

    const log = async (step, message, level = "info", metadata = null) => {
      await supabase.from("task_logs").insert({ task_id: id, step, message, level, metadata });
    };
    const shot = async (step, buffer) => {
      const filename = `${id}/${Date.now()}-${step}.png`;
      const { error: upErr } = await supabase.storage
        .from("task-screenshots")
        .upload(filename, buffer, { contentType: "image/png", upsert: true });
      if (upErr) {
        console.error("Upload error:", upErr);
        return null;
      }
      const { data: signed } = await supabase.storage
        .from("task-screenshots")
        .createSignedUrl(filename, 60 * 60 * 24 * 7);
      const url = signed?.signedUrl || filename;
      await supabase.from("task_screenshots").insert({ task_id: id, step, screenshot_url: url, storage_path: filename });
      return url;
    };

    await supabase.from("tasks").update({ status: "processing" }).eq("id", id);

    try {
      const { paymentUrl } = await runPurchase(task, log, shot);
      await supabase
        .from("tasks")
        .update({ status: "awaiting_payment", payment_url: paymentUrl, eznamka_checkout_url: paymentUrl })
        .eq("id", id);
    } catch (e) {
      await supabase
        .from("tasks")
        .update({ status: "failed", error_message: e.message })
        .eq("id", id);
    }
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend beží na porte ${PORT}`);
});
