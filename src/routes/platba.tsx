import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Version } from "bysquare";
import { encode, PaymentOptions, CurrencyCode } from "bysquare/pay";
import QRCode from "qrcode";
import { format } from "date-fns";
import { sk } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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

        const payload = encode({
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
        } as Parameters<typeof encode>[0], { deburr: true, validate: true, version: Version["1.0.0"] });

        const dataUrl = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: "M",
          margin: 4,
          width: 360,
          color: { dark: "#000000", light: "#ffffff" },
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

  if (!summary) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-muted-foreground">
        Načítavam…
      </div>
    );
  }

  const validityDate = new Date(summary.validityDate);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      <div className="relative z-10 mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
        <div className="mb-6">
          <Button variant="ghost" asChild size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Späť na formulár
            </Link>
          </Button>
        </div>

        <Card className="rounded-3xl border-border/60 bg-card shadow-xl">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Sumár objednávky</CardTitle>
            <CardDescription>
              Zaplaťte naskenovaním QR kódu vo vašej bankovej aplikácii.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-secondary/40 p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">EČV</span><span className="font-medium">{summary.licensePlate}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Krajina</span><span className="font-medium">{countryNames[summary.countryCode] ?? summary.countryCode}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Typ známky</span><span className="font-medium">{vignetteTitles[summary.vignetteType] ?? summary.vignetteType}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Platná od</span><span className="font-medium">{format(validityDate, "dd.MM.yyyy", { locale: sk })}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="font-medium">{summary.email}</span></div>
              <div className="flex justify-between border-t border-border pt-2 mt-2"><span className="text-muted-foreground">Suma</span><span className="font-bold text-primary">{summary.amount} EUR</span></div>
            </div>

            <div className="flex flex-col items-center gap-2">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="PAY by square QR kód" className="h-auto w-[320px] max-w-full rounded-lg border border-border bg-white p-2" />
              ) : qrError ? (
                <div className="text-sm text-destructive">Nepodarilo sa vygenerovať QR kód: {qrError}</div>
              ) : (
                <div className="h-[320px] w-[320px] max-w-full animate-pulse rounded-lg bg-secondary" />
              )}
              <p className="text-xs text-muted-foreground">PAY by square — naskenujte v mobilnom bankovníctve</p>
            </div>

            <div className="rounded-lg border border-border p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Číslo účtu</span><span className="font-mono">{paymentAccount.accountNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">IBAN</span><span className="font-mono">{paymentAccount.ibanFormatted}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">BIC/SWIFT</span><span className="font-mono">{paymentAccount.bic}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Variabilný symbol</span><span className="font-mono font-bold">{summary.variableSymbol}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Suma</span><span className="font-mono font-bold">{summary.amount} EUR</span></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
