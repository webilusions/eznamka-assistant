import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Version } from "bysquare";
import { encode, PaymentOptions, CurrencyCode } from "bysquare/pay";
import QRCode from "qrcode";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import {
  ArrowLeft,
  Check,
  Copy,
  Mail,
  CalendarDays,
  Car,
  MapPin,
  Ticket,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

const paymentAccount = {
  accountNumber: "2603456997",
  iban: "SK7683300000002603456997",
  ibanFormatted: "SK76 8330 0000 0026 0345 6997",
  bic: "FIOZSKBAXXX",
  name: "Kozart",
};

const normalizePaymentText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 /\-?:().,'+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const countryNames: Record<string, string> = {
  SK: "Slovensko",
  CZ: "Česká republika",
  HU: "Maďarsko",
  PL: "Poľsko",
  UA: "Ukrajina",
  AT: "Rakúsko",
};

const vignetteTitles: Record<string, string> = {
  "1year": "365-DŇOVÁ 2026",
  "1month": "30-DŇOVÁ 2026",
  "10day": "10-DŇOVÁ 2026",
  "1day": "1-DŇOVÁ 2026",
};

type StoredSummary = {
  licensePlate: string;
  countryCode: string;
  vignetteType: string;
  validityDate: string;
  email: string;
  variableSymbol: string;
  amount: string;
};

const STORAGE_KEY = "eznamka-summary";

export const Route = createFileRoute("/platba")({
  head: () => ({
    meta: [
      { title: "Platba — eZnamka Automatizácia" },
      { name: "description", content: "Sumár objednávky a platobný QR kód" },
    ],
  }),
  component: PaymentPage,
});

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* ignore */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
      aria-label={label ?? "Kopírovať"}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Skopírované" : "Kopírovať"}
    </button>
  );
}

function PaymentPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<StoredSummary | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) {
        navigate({ to: "/" });
        return;
      }
      setSummary(JSON.parse(raw) as StoredSummary);
    } catch {
      navigate({ to: "/" });
    }
  }, [navigate]);

  useEffect(() => {
    if (!summary) return;
    let cancelled = false;
    (async () => {
      try {
        setQrDataUrl(null);
        setQrError(null);

        const payload = encode(
          {
            payments: [
              {
                type: PaymentOptions.PaymentOrder,
                amount: Number.parseFloat(summary.amount),
                currencyCode: CurrencyCode.EUR,
                variableSymbol: summary.variableSymbol,
                paymentNote: normalizePaymentText(`Dialnicna znamka ${summary.licensePlate}`),
                bankAccounts: [{ iban: paymentAccount.iban }],
              },
            ],
          } as Parameters<typeof encode>[0],
          { deburr: true, validate: true, version: Version["1.0.0"] },
        );

        const dataUrl = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 420,
          color: { dark: "#0b1220", light: "#ffffff" },
        });

        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (e) {
        if (!cancelled) setQrError(e instanceof Error ? e.message : "QR error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summary]);

  const validityDate = useMemo(
    () => (summary ? new Date(summary.validityDate) : null),
    [summary],
  );

  if (!summary || !validityDate) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-muted-foreground">
        Načítavam…
      </div>
    );
  }

  const detailRows: Array<{ icon: typeof Car; label: string; value: string }> = [
    { icon: Car, label: "EČV", value: summary.licensePlate },
    { icon: MapPin, label: "Krajina", value: countryNames[summary.countryCode] ?? summary.countryCode },
    { icon: Ticket, label: "Typ známky", value: vignetteTitles[summary.vignetteType] ?? summary.vignetteType },
    { icon: CalendarDays, label: "Platná od", value: format(validityDate, "dd.MM.yyyy", { locale: sk }) },
    { icon: Mail, label: "Email", value: summary.email },
  ];

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background selection:bg-primary/30">
      {/* Ambient background glows — zladené s indexom */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 -z-0 h-[420px] w-[420px] rounded-full blur-[120px]"
        style={{ background: "oklch(0.74 0.14 230 / 0.18)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-32 -z-0 h-[420px] w-[420px] rounded-full blur-[120px]"
        style={{ background: "oklch(0.55 0.18 280 / 0.18)" }}
      />

      <div className="relative z-10 mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
        {/* Top bar */}
        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" asChild size="sm" className="text-muted-foreground hover:text-foreground">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Späť na formulár
            </Link>
          </Button>
          <Badge variant="outline" className="gap-1.5 border-success/30 bg-success/10 text-success">
            <ShieldCheck className="h-3.5 w-3.5" />
            Bezpečná platba
          </Badge>
        </div>

        {/* Header — rovnaký štýl ako index */}
        <div className="mb-10 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Sumár objednávky
          </h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Skontrolujte údaje a zaplaťte QR kódom v bankovej aplikácii.
          </p>
        </div>

        {/* Main Card */}
        <Card className="relative overflow-hidden rounded-3xl border-border bg-card p-2 shadow-2xl">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full blur-[100px]"
            style={{ background: "oklch(0.74 0.14 230 / 0.10)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full blur-[100px]"
            style={{ background: "oklch(0.55 0.18 280 / 0.10)" }}
          />
          <CardContent className="relative p-6 sm:p-8">
            {/* Suma */}
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Ticket className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">Detail objednávky</div>
                  <div className="text-xs text-muted-foreground">
                    VS <span className="font-mono font-semibold text-foreground">{summary.variableSymbol}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-2 text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                  K úhrade
                </div>
                <div className="font-display text-2xl font-bold text-primary">
                  {summary.amount} €
                </div>
              </div>
            </div>

            {/* Detaily */}
            <div className="divide-y divide-border/60 rounded-2xl border border-border/60 bg-background/40">
              {detailRows.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-4 px-4 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {label}
                    </div>
                    <div className="truncate text-sm font-semibold text-foreground">
                      {value}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-6" />

            {/* QR kód + Platobné údaje vedľa seba */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* QR kód */}
              <div className="flex flex-col items-center text-center">
                <Badge variant="secondary" className="mb-3 gap-1.5">
                  <Smartphone className="h-3.5 w-3.5" />
                  Zaplatiť QR kódom
                </Badge>




                <div className="relative my-6 flex items-center justify-center">
                  <div
                    aria-hidden
                    className="absolute -inset-3 rounded-3xl opacity-60 blur-2xl"
                    style={{ background: "var(--gradient-primary)" }}
                  />
                  <div className="relative rounded-2xl border border-border/60 bg-white p-3 shadow-lg">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="PAY by square QR kód"
                        className="block h-[240px] w-[240px] max-w-full"
                      />
                    ) : qrError ? (
                      <div className="flex h-[240px] w-[240px] items-center justify-center px-4 text-sm text-destructive">
                        {qrError}
                      </div>
                    ) : (
                      <div className="h-[240px] w-[240px] animate-pulse rounded-lg bg-secondary" />
                    )}
                  </div>
                </div>
              </div>

              {/* Platobné údaje */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-foreground">Platobné údaje</h3>
                <dl className="space-y-2.5 text-sm">
                  {[
                    { k: "Príjemca", v: paymentAccount.name, mono: false },
                    { k: "IBAN", v: paymentAccount.ibanFormatted, copy: paymentAccount.iban, mono: true },
                    { k: "BIC / SWIFT", v: paymentAccount.bic, mono: true },
                    { k: "Variabilný symbol", v: summary.variableSymbol, mono: true },
                    { k: "Suma", v: `${summary.amount} EUR`, mono: true },
                  ].map((row) => (
                    <div
                      key={row.k}
                      className="flex items-center justify-between gap-3 rounded-lg px-1 py-1"
                    >
                      <dt className="text-muted-foreground">{row.k}</dt>
                      <dd className="flex items-center gap-2">
                        <span className={row.mono ? "font-mono font-medium" : "font-medium"}>
                          {row.v}
                        </span>
                        {"copy" in row || row.mono ? (
                          <CopyButton value={(row as { copy?: string }).copy ?? row.v} />
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Po pripísaní platby vám pošleme potvrdenie na{" "}
          <span className="font-medium text-foreground">{summary.email}</span>.
        </p>
      </div>
    </div>
  );
}
