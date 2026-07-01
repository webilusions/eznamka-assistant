import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/tasks.api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet, ArrowDownLeft, ArrowUpRight } from "lucide-react";

type Tx = {
  id?: string;
  date?: string;
  amount?: number;
  currency?: string;
  counterAccount?: string;
  counterName?: string;
  bankCode?: string;
  bankName?: string;
  vs?: string;
  message?: string;
  type?: string;
};

type FioData = {
  account: {
    accountId?: string;
    bankId?: string;
    currency?: string;
    iban?: string;
    openingBalance?: number;
    closingBalance?: number;
    dateStart?: string;
    dateEnd?: string;
  };
  transactions: Tx[];
};

export const Route = createFileRoute("/fio")({
  component: FioPage,
});

function FioPage() {
  const { data, isLoading, error } = useQuery<FioData>({
    queryKey: ["fio-account"],
    queryFn: () => apiFetch<FioData>("/fio/account?days=90"),
    refetchInterval: 30_000,
  });

  const fmtAmount = (n?: number, c?: string) =>
    typeof n === "number"
      ? new Intl.NumberFormat("sk-SK", { style: "currency", currency: c || "EUR" }).format(n)
      : "—";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <Wallet className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fio banka — účet</h1>
          <p className="text-sm text-muted-foreground">Posledných 90 dní</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Načítavam…
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            Chyba: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">IBAN</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-mono">{data.account.iban || `${data.account.accountId}/${data.account.bankId}`}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Počiatočný zostatok</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">{fmtAmount(data.account.openingBalance, data.account.currency)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Aktuálny zostatok</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-primary">{fmtAmount(data.account.closingBalance, data.account.currency)}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transakcie ({data.transactions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {data.transactions.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">Žiadne transakcie</p>
                )}
                {[...data.transactions].reverse().map((t, i) => {
                  const positive = (t.amount || 0) >= 0;
                  return (
                    <div key={t.id || i} className="flex items-start gap-3 py-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          positive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {positive ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium">
                            {t.counterName || t.message || t.type || "Transakcia"}
                          </p>
                          <p className={`shrink-0 text-sm font-semibold ${positive ? "text-green-700" : "text-red-700"}`}>
                            {positive ? "+" : ""}
                            {fmtAmount(t.amount, t.currency)}
                          </p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {t.date && <span>{(() => { const m = t.date.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/); if (!m) return t.date; const base = `${+m[3]}.${+m[2]}.${m[1]}`; return m[4] ? `${base} ${m[4]}:${m[5]}` : base; })()}</span>}
                          {t.counterAccount && (
                            <span className="font-mono">
                              {t.counterAccount}
                              {t.bankCode ? `/${t.bankCode}` : ""}
                            </span>
                          )}
                          {t.vs && <Badge variant="outline" className="font-mono">VS {t.vs}</Badge>}
                          {t.message && t.counterName && <span className="truncate">{t.message}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
