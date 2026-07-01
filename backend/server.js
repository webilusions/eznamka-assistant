import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";
import { runPurchase } from "./runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const {
  PORT = 3001,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY,
  SUPABASE_PUBLISHABLE_KEY,
  CORS_ORIGIN = "*",
} = process.env;

const SUPABASE_API_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY || SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_API_KEY) {
  console.error("Chýba SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY v .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_API_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

const app = express();
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (CORS_ORIGIN === "*") return cb(null, true);
    const allowed = CORS_ORIGIN.split(",").map((s) => s.trim());
    if (allowed.includes(origin)) return cb(null, true);
    if (/\.lovable\.(app|dev)$/i.test(new URL(origin).hostname)) return cb(null, true);
    if (/\.kozart\.sk$/i.test(new URL(origin).hostname)) return cb(null, true);
    return cb(null, true); // fallback povoliť
  },
  credentials: false,
}));
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
  variableSymbol: z.string().min(1).optional(),
  amount: z.string().optional(),
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
        variable_symbol: data.variableSymbol || null,
        payment_amount: data.amount || null,
        status: data.variableSymbol ? "unpaid" : "pending",
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

// Shared runner — spustí Playwright automatizáciu pre task na pozadí
async function runTaskInBackground(id) {
  const { data: task, error } = await supabase.from("tasks").select("*").eq("id", id).single();
  if (error || !task) throw new Error("Task not found");

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
}

// POST /api/tasks/:id/run — spustí Playwright automatizáciu na pozadí
app.post("/api/tasks/:id/run", async (req, res) => {
  const id = req.params.id;
  try {
    const { data: task, error } = await supabase.from("tasks").select("*").eq("id", id).single();
    if (error || !task) return res.status(404).json({ error: "Task not found" });
    res.json({ success: true, message: "Spúšťam automatizáciu na pozadí" });
    runTaskInBackground(id).catch((e) => console.error("runTaskInBackground:", e));
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// ── Fio integrácia ──
const fioCache = new Map();
const FIO_TTL_MS = 30_000;

async function fetchFioPeriod(days = 30) {
  const token = process.env.FIO_TOKEN;
  if (!token) throw new Error("FIO_TOKEN chýba v .env");
  const cacheKey = String(days);
  const cached = fioCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.ts < FIO_TTL_MS) {
    return { ...cached.data, cached: true, cacheAgeSec: Math.round((now - cached.ts) / 1000) };
  }
  const to = new Date();
  const from = new Date(now - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const url = `https://fioapi.fio.cz/v1/rest/periods/${token}/${fmt(from)}/${fmt(to)}/transactions.json`;
  const r = await fetch(url);
  if (!r.ok) {
    if (cached) {
      return { ...cached.data, cached: true, stale: true, cacheAgeSec: Math.round((now - cached.ts) / 1000) };
    }
    const text = await r.text();
    const err = new Error(r.status === 409 ? "Fio API limit: 1 požiadavka za 30 sekúnd. Skús o chvíľu." : `Fio API ${r.status}`);
    err.status = r.status;
    err.detail = text.slice(0, 500);
    throw err;
  }
  const data = await r.json();
  const info = data?.accountStatement?.info || {};
  const txs = (data?.accountStatement?.transactionList?.transaction || []).map((t) => {
    const get = (id) => t[`column${id}`]?.value;
    return {
      id: get(22),
      date: get(0),
      amount: get(1),
      currency: get(14),
      counterAccount: get(2),
      counterName: get(10),
      bankCode: get(3),
      bankName: get(12),
      vs: get(5),
      ks: get(4),
      ss: get(6),
      message: get(16) || get(25),
      note: get(25),
      type: get(8),
    };
  });
  const payload = {
    account: {
      accountId: info.accountId,
      bankId: info.bankId,
      currency: info.currency,
      iban: info.iban,
      openingBalance: info.openingBalance,
      closingBalance: info.closingBalance,
      dateStart: info.dateStart,
      dateEnd: info.dateEnd,
    },
    transactions: txs,
  };
  fioCache.set(cacheKey, { data: payload, ts: Date.now() });
  return payload;
}

// GET /api/fio/account
app.get("/api/fio/account", async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 90, 365);
    const payload = await fetchFioPeriod(days);
    res.json(payload);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, detail: e.detail });
  }
});

// Reconciliácia platieb: spáruje prichádzajúce platby s úlohami v stave 'unpaid' podľa VS
async function reconcilePayments() {
  try {
    const { data: unpaid, error } = await supabase
      .from("tasks")
      .select("id, variable_symbol, payment_amount")
      .eq("status", "unpaid")
      .not("variable_symbol", "is", null);
    if (error) throw error;
    if (!unpaid || unpaid.length === 0) return { matched: 0, checked: 0 };

    const payload = await fetchFioPeriod(30);
    const incoming = (payload.transactions || []).filter(
      (t) => Number(t.amount) > 0 && t.vs,
    );

    let matched = 0;
    for (const task of unpaid) {
      const tx = incoming.find((t) => String(t.vs) === String(task.variable_symbol));
      if (!tx) continue;
      const expected = parseFloat(task.payment_amount || "0");
      if (expected > 0 && Number(tx.amount) + 0.01 < expected) continue; // nedostatočná suma
      const { error: upErr } = await supabase
        .from("tasks")
        .update({ status: "paid" })
        .eq("id", task.id)
        .eq("status", "unpaid"); // race-safe
      if (upErr) {
        console.error("update paid err:", upErr);
        continue;
      }
      await supabase.from("task_logs").insert({
        task_id: task.id,
        step: "payment",
        message: `Platba prijatá: ${tx.amount} ${tx.currency}, VS ${tx.vs}`,
        level: "success",
        metadata: { tx },
      });
      matched++;
      runTaskInBackground(task.id).catch((e) => console.error("auto-run:", e));
    }
    return { matched, checked: unpaid.length };
  } catch (e) {
    console.error("reconcilePayments:", e.message);
    return { error: e.message };
  }
}

// POST /api/fio/reconcile — manuálne spustenie
app.post("/api/fio/reconcile", async (_req, res) => {
  const result = await reconcilePayments();
  res.json(result);
});

// Periodický poller každých 90s
const POLL_MS = 30_000;
setInterval(() => {
  reconcilePayments().then((r) => {
    if (r && r.matched) console.log(`[fio] reconciled ${r.matched}/${r.checked}`);
  });
}, POLL_MS);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend beží na 0.0.0.0:${PORT} (Fio poller každých ${POLL_MS / 1000}s)`);
});

