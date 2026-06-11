import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { format } from "date-fns";
import { sk } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Car,
  Clock,
  AlertCircle,
  CheckCircle,
  PauseCircle,
  XCircle,
  Loader2,
  Monitor,
  Calendar,
  Mail,
  Globe,
  CreditCard,
  Trash2,
  ExternalLink,
  Play,
} from "lucide-react";
import { getTask, getTaskLogs, getTaskScreenshots, deleteTask } from "@/lib/tasks.functions";
import { externalTasksApi, isExternalApiEnabled } from "@/lib/tasks.api";
import { useNavigate } from "@tanstack/react-router";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "warning"; icon: React.ReactNode; description: string }> = {
  pending: { label: "Čaká sa", variant: "secondary", icon: <Clock className="h-5 w-5" />, description: "Úloha čaká na spustenie automatizácie" },
  running: { label: "Prebieha", variant: "default", icon: <Loader2 className="h-5 w-5 animate-spin" />, description: "Playwright automatizuje kroky na eznamka.sk" },
  paused_before_payment: { label: "Pred platbou", variant: "warning", icon: <PauseCircle className="h-5 w-5" />, description: "Automatizácia sa zastavila pred platbou. Skontrolujte údaje a pokračujte ručne." },
  completed: { label: "Dokončené", variant: "default", icon: <CheckCircle className="h-5 w-5" />, description: "Úloha bola úspešne dokončená" },
  failed: { label: "Chyba", variant: "destructive", icon: <AlertCircle className="h-5 w-5" />, description: "Počas automatizácie nastala chyba. Pozrite si logy a screenshot." },
  cancelled: { label: "Zrušené", variant: "outline", icon: <XCircle className="h-5 w-5" />, description: "Úloha bola zrušená používateľom" },
};

const vignetteLabels: Record<string, string> = {
  "1year": "Ročná známka (1 rok)",
  "1month": "Mesačná známka (30 dní)",
  "10day": "10-dňová známka",
  "1day": "Jednodňová známka",
};

const logLevelIcons: Record<string, { color: string; icon: React.ReactNode }> = {
  info: { color: "text-info", icon: <Monitor className="h-3.5 w-3.5" /> },
  success: { color: "text-success", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  warning: { color: "text-warning", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  error: { color: "text-destructive", icon: <XCircle className="h-3.5 w-3.5" /> },
};

export const Route = createFileRoute("/tasks/$taskId")({
  head: () => ({
    meta: [
      { title: "Detail úlohy — eZnamka Automatizácia" },
      { name: "description", content: "Detail úlohy automatizácie nákupu diaľničnej známky" },
    ],
  }),
  component: TaskDetailPage,
});

function TaskDetailPage() {
  const { taskId } = useParams({ from: "/tasks/$taskId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);

  const fetchTask = useServerFn(getTask);
  const fetchLogs = useServerFn(getTaskLogs);
  const fetchScreenshots = useServerFn(getTaskScreenshots);
  const deleteTaskFn = useServerFn(deleteTask);

  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => isExternalApiEnabled() ? externalTasksApi.getTask(taskId) : fetchTask({ data: { id: taskId } }),
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.status;
      return s === "running" || s === "pending" ? 3000 : false;
    },
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["task-logs", taskId],
    queryFn: () => isExternalApiEnabled() ? externalTasksApi.getTaskLogs(taskId) : fetchLogs({ data: { taskId } }),
    refetchInterval: (q) => {
      const s = (task as any)?.status;
      return s === "running" || s === "pending" ? 3000 : false;
    },
  });

  const { data: screenshots = [], isLoading: screenshotsLoading } = useQuery({
    queryKey: ["task-screenshots", taskId],
    queryFn: () => isExternalApiEnabled() ? externalTasksApi.getTaskScreenshots(taskId) : fetchScreenshots({ data: { taskId } }),
    refetchInterval: () => {
      const s = (task as any)?.status;
      return s === "running" || s === "pending" ? 3000 : false;
    },
  });

  const handleDelete = async () => {
    if (!confirm("Naozaj chcete odstrániť túto úlohu?")) return;
    if (isExternalApiEnabled()) {
      await externalTasksApi.deleteTask(taskId);
    } else {
      await deleteTaskFn({ data: { id: taskId } });
    }
    navigate({ to: "/tasks" });
  };

  const handleRun = async () => {
    if (!isExternalApiEnabled()) {
      console.warn("[run] External API nie je nakonfigurované — manuálne spustenie nie je dostupné.");
      alert("Manuálne spustenie vyžaduje nakonfigurované externé API.");
      return;
    }
    setIsRunning(true);
    console.log("[run] Spúšťam úlohu", taskId);
    try {
      const res = await externalTasksApi.runTask(taskId);
      console.log("[run] Odpoveď zo servera:", res);
      // Krátky delay aby worker stihol prepnúť status na running
      setTimeout(() => {
        console.log("[run] Refresh detailu úlohy + logov");
        queryClient.invalidateQueries({ queryKey: ["task", taskId] });
        queryClient.invalidateQueries({ queryKey: ["task-logs", taskId] });
      }, 800);
    } catch (e) {
      console.error("[run] Chyba pri spúšťaní úlohy:", e);
      alert("Spustenie zlyhalo. Pozrite konzolu.");
    } finally {
      setIsRunning(false);
    }
  };

  const status = task ? (statusConfig[task.status] || statusConfig.pending) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate({ to: "/tasks" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Detail úlohy
            </h1>
            <p className="text-sm text-muted-foreground">{taskId.slice(0, 8)}...</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {task && task.status !== "completed" && (
            <Button
              variant="default"
              onClick={handleRun}
              disabled={isRunning || task.status === "running"}
            >
              {isRunning || task.status === "running" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {task.status === "running" ? "Beží..." : "Spustiť teraz"}
            </Button>
          )}
          {task?.eznamka_checkout_url && (
            <a href={task.eznamka_checkout_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <ExternalLink className="mr-2 h-4 w-4" />
                Pokračovať na eznamka.sk
              </Button>
            </a>
          )}
          <Button variant="destructive" size="icon" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {taskLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !task ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Úloha nenájdená</h3>
            <p className="text-muted-foreground">Úloha s týmto ID neexistuje alebo bola odstránená.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Status banner */}
          <Card className={`border-l-4 ${task.status === "failed" ? "border-l-destructive" : task.status === "paused_before_payment" ? "border-l-warning" : task.status === "completed" ? "border-l-success" : "border-l-primary"}`}>
            <CardContent className="py-4">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 shrink-0">
                  {status?.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{status?.label}</h2>
                    <Badge variant={status?.variant}>{task.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{status?.description}</p>
                  {task.error_message && (
                    <div className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      <strong>Chyba:</strong> {task.error_message}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* QR platba */}
          {task.payment_qr_base64 && (
            <Card className="border-l-4 border-l-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Platba cez TatraPay
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                  <img
                    src={task.payment_qr_base64}
                    alt="QR kód pre platbu"
                    className="h-48 w-48 rounded-md border bg-white p-2"
                  />
                  <div className="flex-1 space-y-2 text-sm">
                    <p className="font-semibold">QR kód načítajte v aplikácii Tatra banka</p>
                    <p className="text-muted-foreground">
                      V aplikácii Tatra banka vyberte možnosť „Skenovať IBAN/QR kód" v platbe.
                    </p>
                    {task.payment_amount && (
                      <p className="text-base">
                        <span className="text-muted-foreground">Suma:</span>{" "}
                        <strong>{task.payment_amount}</strong>
                      </p>
                    )}
                    {task.payment_url && (
                      <a
                        href={task.payment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Otvoriť platobnú stránku
                      </a>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Vehicle info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Car className="h-4 w-4 text-primary" />
                Údaje o vozidle
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Car className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">EČV</p>
                    <p className="text-sm text-muted-foreground">{task.license_plate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Krajina registrácie</p>
                    <p className="text-sm text-muted-foreground">{task.country_code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <CreditCard className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Typ známky</p>
                    <p className="text-sm text-muted-foreground">{vignetteLabels[task.vignette_type] || task.vignette_type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Platnosť od</p>
                    <p className="text-sm text-muted-foreground">
                      {task.validity_date
                        ? format(new Date(task.validity_date), "d. MMMM yyyy", { locale: sk })
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <Mail className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">{task.email}</p>
                  </div>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Vytvorené: {format(new Date(task.created_at), "d. MMMM yyyy HH:mm", { locale: sk })}</span>
                {task.updated_at !== task.created_at && (
                  <span>Aktualizované: {format(new Date(task.updated_at), "d. MMMM yyyy HH:mm", { locale: sk })}</span>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Logs */}
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Monitor className="h-4 w-4 text-primary" />
                  Logy automatizácie
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                {logsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : logs.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Zatiaľ žiadne logy. Automatizácia ešte nebola spustená.
                  </p>
                ) : (
                  <ScrollArea className="h-[400px] rounded-md border">
                    <div className="space-y-1 p-2">
                      {logs.map((log: any) => {
                        const level = logLevelIcons[log.level] || logLevelIcons.info;
                        return (
                          <div
                            key={log.id}
                            className="flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
                          >
                            <span className={`mt-0.5 shrink-0 ${level.color}`}>{level.icon}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(log.created_at), "HH:mm:ss")}
                                </span>
                                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                                  {log.step}
                                </span>
                              </div>
                              <p className="mt-0.5 text-foreground">{log.message}</p>
                              {log.metadata && (
                                <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted p-1.5 text-xs text-muted-foreground">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Screenshots */}
            <Card className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Monitor className="h-4 w-4 text-primary" />
                  Screenshoty
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1">
                {screenshotsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : screenshots.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Zatiaľ žiadne screenshoty. Zobrazia sa pri chybe alebo pred platbou.
                  </p>
                ) : (
                  <ScrollArea className="h-[400px] rounded-md border">
                    <div className="space-y-3 p-3">
                      {screenshots.map((screenshot: any) => {
                        const url: string = screenshot.screenshot_url || "";
                        const isHtml = url.startsWith("data:text/html");
                        const isJson = url.startsWith("data:application/json") || url.startsWith("data:text/plain");
                        const isImage = !isHtml && !isJson;
                        return (
                          <Dialog key={screenshot.id}>
                            <DialogTrigger asChild>
                              <div className="cursor-pointer overflow-hidden rounded-md border hover:border-primary transition-colors">
                                {isImage ? (
                                  <img
                                    src={url}
                                    alt={`Screenshot: ${screenshot.step}`}
                                    className="w-full h-auto object-cover max-h-[200px]"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="flex h-[140px] items-center justify-center bg-muted">
                                    <span className="text-xs font-mono text-muted-foreground">
                                      {isHtml ? "HTML snapshot" : "Raw response"}
                                    </span>
                                  </div>
                                )}
                                <div className="px-3 py-2">
                                  <p className="text-xs font-medium">{screenshot.step}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {format(new Date(screenshot.created_at), "d. MMM yyyy HH:mm:ss", { locale: sk })}
                                  </p>
                                </div>
                              </div>
                            </DialogTrigger>
                            <DialogContent className="max-w-5xl">
                              <DialogHeader>
                                <DialogTitle>{screenshot.step}</DialogTitle>
                              </DialogHeader>
                              {isImage && (
                                <img src={url} alt={`Screenshot: ${screenshot.step}`} className="w-full h-auto rounded-md" />
                              )}
                              {isHtml && (
                                <iframe
                                  src={url}
                                  title={screenshot.step}
                                  sandbox=""
                                  className="h-[70vh] w-full rounded-md border bg-white"
                                />
                              )}
                              {isJson && (
                                <pre className="max-h-[70vh] overflow-auto rounded-md border bg-muted p-3 text-xs">
                                  {(() => {
                                    try {
                                      const raw = atob(url.split(",")[1] || "");
                                      try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
                                    } catch { return url; }
                                  })()}
                                </pre>
                              )}
                            </DialogContent>
                          </Dialog>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
