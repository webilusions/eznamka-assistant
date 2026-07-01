import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { sk } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Car,
  Clock,
  AlertCircle,
  CheckCircle,
  PauseCircle,
  XCircle,
  Loader2,
  Play,
  ArrowRight,
} from "lucide-react";
import { getTasks } from "@/lib/tasks.functions";
import { externalTasksApi, isExternalApiEnabled } from "@/lib/tasks.api";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "warning"; icon: React.ReactNode }> = {
  pending: { label: "Čaká sa", variant: "secondary", icon: <Clock className="h-3.5 w-3.5" /> },
  unpaid: { label: "Nezaplatená", variant: "warning", icon: <Clock className="h-3.5 w-3.5" /> },
  paid: { label: "Zaplatená", variant: "default", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  running: { label: "Prebieha", variant: "default", icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
  paused_before_payment: { label: "Pred platbou", variant: "warning", icon: <PauseCircle className="h-3.5 w-3.5" /> },
  completed: { label: "Dokončené", variant: "default", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  failed: { label: "Chyba", variant: "destructive", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  cancelled: { label: "Zrušené", variant: "outline", icon: <XCircle className="h-3.5 w-3.5" /> },
};


const vignetteLabels: Record<string, string> = {
  "1year": "Ročná",
  "1month": "Mesačná",
  "10day": "10-dňová",
  "1day": "Jednodňová",
};

export const Route = createFileRoute("/tasks/")({
  head: () => ({
    meta: [
      { title: "Dashboard úloh — eZnamka Automatizácia" },
      { name: "description", content: "Prehľad všetkých úloh automatizácie" },
    ],
  }),
  component: TasksDashboard,
});

function TasksDashboard() {
  const fetchTasks = useServerFn(getTasks);
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => isExternalApiEnabled() ? externalTasksApi.getTasks() : fetchTasks(),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Dashboard úloh
          </h1>
          <p className="mt-1 text-muted-foreground">
            Prehľad všetkých úloh automatizácie nákupu diaľničných známok
          </p>
        </div>
        <Link to="/">
          <Button>
            <Play className="mr-2 h-4 w-4" />
            Nákup známky
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Všetky úlohy</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Car className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Žiadne úlohy</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Zatiaľ nemáte žiadne úlohy. Vytvorte prvú úlohu a spustite automatizáciu.
              </p>
              <Link to="/" className="mt-4">
                <Button>
                  <Play className="mr-2 h-4 w-4" />
                  Vytvoriť úlohu
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>EČV</TableHead>
                    <TableHead>Krajina</TableHead>
                    <TableHead>Typ známky</TableHead>
                    <TableHead>Platnosť od</TableHead>
                    <TableHead>Cena</TableHead>
                    <TableHead>Stav</TableHead>
                    <TableHead>Vytvorené</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task: any) => {
                    const status = statusConfig[task.status] || statusConfig.pending;
                    return (
                      <TableRow key={task.id} className="cursor-pointer hover:bg-accent/50">
                        <TableCell className="font-medium">{task.license_plate}</TableCell>
                        <TableCell>{task.country_code}</TableCell>
                        <TableCell>{vignetteLabels[task.vignette_type] || task.vignette_type}</TableCell>
                        <TableCell>
                          {task.validity_date
                            ? format(new Date(task.validity_date), "d. MMM yyyy", { locale: sk })
                            : "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {task.payment_amount ? `${task.payment_amount} €` : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="flex w-fit items-center gap-1">
                            {status.icon}
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(task.created_at), "d. MMM yyyy HH:mm", { locale: sk })}
                        </TableCell>
                        <TableCell>
                          <Link to="/tasks/$taskId" params={{ taskId: task.id }}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
