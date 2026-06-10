import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Car, ShieldCheck, ShieldAlert, Loader2, AlertTriangle, CheckCircle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { externalTasksApi, isExternalApiEnabled } from "@/lib/tasks.api";

const formSchema = z.object({
  licensePlate: z
    .string()
    .min(3, "EČV musí mať aspoň 3 znaky")
    .max(15, "EČV je príliš dlhá")
    .regex(/^[A-Z0-9\- ]+$/i, "Neplatný formát EČV"),
  countryCode: z.string().min(1, "Vyberte krajinu registrácie"),
});

type FormValues = z.infer<typeof formSchema>;

const countries = [
  { code: "SK", name: "Slovensko" },
  { code: "CZ", name: "Česká republika" },
  { code: "AT", name: "Rakúsko" },
  { code: "DE", name: "Nemecko" },
  { code: "HU", name: "Maďarsko" },
  { code: "PL", name: "Poľsko" },
  { code: "RO", name: "Rumunsko" },
  { code: "BG", name: "Bulharsko" },
  { code: "HR", name: "Chorvátsko" },
  { code: "SI", name: "Slovinsko" },
  { code: "OTHER", name: "Iná krajina" },
];

export const Route = createFileRoute("/check")({
  head: () => ({
    meta: [
      { title: "Kontrola platnosti — eZnamka Automatizácia" },
      { name: "description", content: "Skontrolujte platnosť diaľničnej známky pre vaše vozidlo" },
    ],
  }),
  component: CheckValidityPage,
});

function CheckValidityPage() {
  const [result, setResult] = useState<{
    conflict: boolean;
    summary: string;
    reasons?: string[];
    vignettes?: any[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      licensePlate: "",
      countryCode: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (!isExternalApiEnabled()) {
        throw new Error("Externé API nie je dostupné");
      }

      const data = await externalTasksApi.checkValidity({
        licensePlate: values.licensePlate.toUpperCase().trim(),
        countryCode: values.countryCode,
      });

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Neznáma chyba");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <ShieldCheck className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Kontrola platnosti
        </h1>
        <p className="mt-2 text-muted-foreground">
          Skontrolujte, či má vozidlo už zakúpenú platnú diaľničnú známku
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Údaje o vozidle</CardTitle>
          <CardDescription>
            Zadajte EČV a krajinu registrácie pre kontrolu platnosti známky
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="licensePlate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>EČV (Evidenčné číslo vozidla)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="napr. BA123AB"
                        {...field}
                        className="uppercase"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="countryCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Krajina registrácie</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Vyberte krajinu" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {countries.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />


              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading} size="lg">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Skontrolovať platnosť
              </Button>
            </form>
          </Form>

          {result && (
            <div className="space-y-4 pt-2">
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">Výsledok kontroly</h3>

                {result.conflict ? (
                  <div className="rounded-lg border border-warning/20 bg-warning/5 p-4">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="mt-0.5 h-5 w-5 text-warning shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-warning-foreground">
                          Zistený konflikt
                        </p>
                        <p className="text-sm text-muted-foreground">{result.summary}</p>
                        {result.reasons && result.reasons.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {result.reasons.map((reason, i) => (
                              <li key={i} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                                {reason}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-success/20 bg-success/5 p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-5 w-5 text-success shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-success">{result.summary}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Pre toto vozidlo a dátum nebola nájdená žiadna platná diaľničná známka.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
