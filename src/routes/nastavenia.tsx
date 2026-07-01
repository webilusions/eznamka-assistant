import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Settings2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_PRICES, loadPrices, savePrices, type VignetteKey } from "@/lib/prices";

export const Route = createFileRoute("/nastavenia")({
  head: () => ({
    meta: [{ title: "Nastavenia — Ceny známok" }],
  }),
  component: SettingsPage,
});

const LABELS: Record<VignetteKey, string> = {
  "1year": "365-dňová (ročná)",
  "1month": "30-dňová (mesačná)",
  "10day": "10-dňová",
  "1day": "1-dňová",
};

function SettingsPage() {
  const [prices, setPrices] = useState<Record<VignetteKey, number>>(() => loadPrices());

  const update = (k: VignetteKey, v: string) => {
    const n = parseFloat(v.replace(",", "."));
    setPrices((p) => ({ ...p, [k]: isNaN(n) ? 0 : n }));
  };

  const handleSave = () => {
    savePrices(prices);
    toast.success("Ceny boli uložené");
  };

  const handleReset = () => {
    setPrices({ ...DEFAULT_PRICES });
    savePrices({ ...DEFAULT_PRICES });
    toast.success("Obnovené na predvolené ceny");
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <Settings2 className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nastavenia</h1>
          <p className="text-sm text-muted-foreground">Ceny diaľničných známok (EUR s DPH)</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ceny známok</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(Object.keys(LABELS) as VignetteKey[]).map((k) => (
            <div key={k} className="grid grid-cols-3 items-center gap-3">
              <Label htmlFor={k} className="col-span-2">
                {LABELS[k]}
              </Label>
              <div className="relative">
                <Input
                  id={k}
                  type="number"
                  step="0.01"
                  min="0"
                  value={prices[k]}
                  onChange={(e) => update(k, e.target.value)}
                  className="pr-12"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  EUR
                </span>
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1">
              <Save className="mr-2 h-4 w-4" /> Uložiť
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="mr-2 h-4 w-4" /> Predvolené
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Ceny sa ukladajú lokálne v tomto prehliadači.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
