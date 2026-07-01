
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { CalendarIcon, Car, Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { format, addDays } from "date-fns";
import { sk } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { createTask } from "@/lib/tasks.functions";
import { externalTasksApi, isExternalApiEnabled } from "@/lib/tasks.api";
import { loadPrices, formatPriceEUR, type VignetteKey } from "@/lib/prices";







const vignetteMaxAdvanceDays: Record<string, number> = {
  "1day": 60,
  "10day": 30,
  "1month": 30,
  "1year": 30,
};

const formSchema = z

  .object({
    licensePlate: z
      .string()
      .min(3, "EČV musí mať aspoň 3 znaky")
      .max(15, "EČV je príliš dlhá")
      .regex(/^[A-Z0-9\- ]+$/i, "Neplatný formát EČV"),
    countryCode: z.string().min(1, "Vyberte krajinu registrácie"),
    vignetteType: z.string().min(1, "Vyberte typ známky"),
    validityDate: z.date({ required_error: "Vyberte dátum platnosti" }),
    email: z.string().trim().min(1, "Email je povinný").email("Zadajte platný email"),
  })
  .superRefine((val, ctx) => {
    const max = vignetteMaxAdvanceDays[val.vignetteType];
    if (max && val.validityDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const limit = addDays(today, max);
      if (val.validityDate > limit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["validityDate"],
          message:
            val.vignetteType === "1day"
              ? `1-dňovú známku je možné kúpiť max. ${max} dní vopred (do ${format(limit, "dd.MM.yyyy")})`
              : `Túto známku je možné kúpiť max. ${max} dní vopred (do ${format(limit, "dd.MM.yyyy")})`,
        });
      }
    }
  });


type FormValues = z.infer<typeof formSchema>;

const countries = [
  { code: "SK", name: "Slovensko", flag: "🇸🇰" },
  { code: "CZ", name: "Česká republika", flag: "🇨🇿" },
  { code: "HU", name: "Maďarsko", flag: "🇭🇺" },
  { code: "PL", name: "Poľsko", flag: "🇵🇱" },
  { code: "UA", name: "Ukrajina", flag: "🇺🇦" },
  { code: "AT", name: "Rakúsko", flag: "🇦🇹" },
];

const buildVignetteTypes = () => {
  const p = loadPrices();
  return [
    {
      value: "1year",
      title: "365-DŇOVÁ 2026",
      badge: "365/D",
      badgeClass: "bg-[#1e4a7a] text-white",
      validity: "365 dní od začiatku platnosti",
      price: formatPriceEUR(p["1year"]),
    },
    {
      value: "1month",
      title: "30-DŇOVÁ 2026",
      badge: "30/D",
      badgeClass: "bg-[#5bb3e4] text-white",
      validity: "30 dní od začiatku platnosti",
      price: formatPriceEUR(p["1month"]),
    },
    {
      value: "10day",
      title: "10-DŇOVÁ 2026",
      badge: "10/D",
      badgeClass: "bg-[#9ca3af] text-white",
      validity: "10 dní od začiatku platnosti",
      price: formatPriceEUR(p["10day"]),
    },
    {
      value: "1day",
      title: "1-DŇOVÁ 2026",
      badge: "1/D",
      badgeClass: "bg-[#f5a623] text-white",
      validity: "1 deň od začiatku platnosti",
      price: formatPriceEUR(p["1day"]),
    },
  ];
};

const quickCountries = [
  { code: "SK", name: "Slovensko", flag: "🇸🇰" },
  { code: "CZ", name: "Česká republika", flag: "🇨🇿" },
  { code: "HU", name: "Maďarsko", flag: "🇭🇺" },
  { code: "PL", name: "Poľsko", flag: "🇵🇱" },
  { code: "UA", name: "Ukrajina", flag: "🇺🇦" },
  { code: "AT", name: "Rakúsko", flag: "🇦🇹" },
];

const vignetteDurationDays: Record<string, number> = {
  "1year": 365,
  "1month": 30,
  "10day": 10,
  "1day": 1,
};




export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nákup známky — eZnamka Automatizácia" },
      { name: "description", content: "Pripravte nákup diaľničnej známky cez automatizáciu" },
    ],
  }),
  component: VehicleFormPage,
});

function VehicleFormPage() {
  const navigate = useNavigate();
  const createTaskFn = useServerFn(createTask);
  const vignetteTypes = buildVignetteTypes();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      licensePlate: "",
      countryCode: "",
      vignetteType: "",
      validityDate: addDays(new Date(), 1),
      email: "",
    },
  });

  const watchedVignette = form.watch("vignetteType");
  const watchedDate = form.watch("validityDate");
  const validUntil =
    watchedDate && vignetteDurationDays[watchedVignette]
      ? addDays(watchedDate, vignetteDurationDays[watchedVignette] - 1)
      : null;

  const maxAdvanceDays = vignetteMaxAdvanceDays[watchedVignette];
  const maxDate = maxAdvanceDays
    ? addDays(new Date(new Date().setHours(0, 0, 0, 0)), maxAdvanceDays)
    : null;




  const mutation = useMutation({
    mutationFn: (variables: { data: { licensePlate: string; countryCode: string; vignetteType: string; validityDate: string; email: string } }) =>
      isExternalApiEnabled() ? externalTasksApi.createTask(variables.data) : createTaskFn(variables),
    onSuccess: (data) => {
      navigate({ to: "/tasks/$taskId", params: { taskId: data.id } });
    },
  });

  const onSubmit = async (values: FormValues) => {
    const prices = loadPrices();
    const vs = Math.floor(1000000000 + Math.random() * 9000000000).toString();
    const amount = (prices[values.vignetteType as VignetteKey] ?? 0).toFixed(2);
    const payload = {
      licensePlate: values.licensePlate.toUpperCase().trim(),
      countryCode: values.countryCode,
      vignetteType: values.vignetteType,
      validityDate: values.validityDate.toISOString().slice(0, 10),
      email: values.email.trim(),
      variableSymbol: vs,
      amount,
    };

    try {
      if (isExternalApiEnabled()) {
        await externalTasksApi.createTask(payload as any);
      } else {
        await createTaskFn({ data: payload as any });
      }
    } catch (e) {
      console.error("createTask failed:", e);
      // pokračujeme aj tak — používateľ uvidí QR kód
    }

    sessionStorage.setItem(
      "eznamka-summary",
      JSON.stringify({ ...payload, validityDate: values.validityDate.toISOString() }),
    );
    navigate({ to: "/platba" });
  };



  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background selection:bg-primary/30">
      {/* Ambient background glows */}
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
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Diaľničná známka
          </h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Kúpte si elektronickú známku rýchlo a bezpečne.
          </p>
        </div>

        {/* Main Form Card */}
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
          <CardHeader className="relative">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Car className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl">Údaje o vozidle</CardTitle>
                <CardDescription>
                  Vyplňte polia pre prípravu nákupu
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        <CardContent className="relative">


          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="licensePlate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>EČV (Evidenčné číslo vozidla) <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input
                          placeholder=" napr. BA123AB"
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
                      <FormLabel>
                        Krajina registrácie vozidla <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Vyberte krajinu" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {countries.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              <span className="flex items-center gap-2">
                                <img
                                  src={`https://flagcdn.com/w40/${c.code.toLowerCase()}.png`}
                                  alt={c.name}
                                  className="h-3.5 w-5 object-cover"
                                  loading="lazy"
                                />

                                {c.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>

                      </Select>
                      <div className="mt-2 grid w-full gap-1" style={{ gridTemplateColumns: `repeat(${quickCountries.length}, minmax(0, 1fr))` }}>
                        {quickCountries.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => field.onChange(c.code)}
                            aria-label={c.name}
                            title={c.name}
                            className={cn(
                              "flex h-6 w-full items-center justify-center overflow-hidden rounded-none transition",
                              field.value === c.code
                                ? "ring-2 ring-primary"
                                : "opacity-70 hover:opacity-100"
                            )}
                          >
                            <img
                              src={`https://flagcdn.com/w40/${c.code.toLowerCase()}.png`}
                              alt={c.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </button>


                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>


              <FormField
                control={form.control}
                name="vignetteType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Typ diaľničnej známky <span className="text-destructive">*</span>
                    </FormLabel>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {vignetteTypes.map((v) => {
                        const selected = field.value === v.value;
                        return (
                          <button
                            type="button"
                            key={v.value}
                            onClick={() => field.onChange(v.value)}
                            className={cn(
                              "rounded-xl border-2 p-3 text-left transition",
                              selected
                                ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                                : "border-border bg-secondary/40 hover:border-primary/40"
                            )}
                          >
                            <div className="mb-2 text-sm font-bold text-foreground">
                              {v.title}
                            </div>
                            <div className="flex gap-2">
                              <div
                                className={cn(
                                  "flex h-16 w-12 shrink-0 items-end justify-center rounded pb-1 text-[10px] font-bold",
                                  v.badgeClass
                                )}
                              >
                                {v.badge}
                              </div>
                              <div className="flex-1 rounded bg-background/60 p-2 text-xs">
                                <div className="text-muted-foreground">Platnosť</div>
                                <div className="font-semibold text-foreground">{v.validity}</div>
                                <div className="mt-1 text-muted-foreground">Cena s DPH</div>
                                <div className="font-bold text-foreground">{v.price}</div>
                              </div>
                            </div>
                          </button>

                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />


              <div className="pt-2">
                <h3 className="text-base font-semibold text-primary">
                  Platnosť diaľničnej známky
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="validityDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>
                        Platná od <span className="text-destructive">*</span>
                      </FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "dd.MM.yyyy", { locale: sk })
                              ) : (
                                <span>Vyberte dátum</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              const today = new Date(new Date().setHours(0, 0, 0, 0));
                              if (date < today) return true;
                              if (maxDate && date > maxDate) return true;
                              return false;
                            }}
                            locale={sk}
                            initialFocus
                            className="pointer-events-auto"
                          />
                          {maxDate && (
                            <p className="px-3 pb-2 text-xs text-muted-foreground">
                              {watchedVignette === "1day"
                                ? `1-dňová známka: max. do ${format(maxDate, "dd.MM.yyyy", { locale: sk })}`
                                : `Max. dátum: ${format(maxDate, "dd.MM.yyyy", { locale: sk })}`}
                            </p>
                          )}
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2 flex flex-col">
                  <Label className="flex items-center gap-1">
                    Platná do
                    <span className="text-warning">**</span>
                  </Label>
                  <Input
                    readOnly
                    disabled
                    value={
                      validUntil
                        ? format(validUntil, "dd.MM.yyyy", { locale: sk })
                        : ""
                    }
                    placeholder="—"
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    ** automaticky vypočítané
                  </p>
                </div>
              </div>




              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Email pre potvrdenie <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="vas@email.sk" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="rounded-lg border border-warning/20 bg-warning/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-warning shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-warning-foreground">
                      Dôležité upozornenie
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Úhrada elektronickej diaľničnej známky sa vzťahuje VÝHRADNE na užívanie vymedzených úsekov diaľnic a rýchlostných ciest Slovenskej republiky.
                    </p>
                  </div>
                </div>
              </div>

              {mutation.isSuccess && (
                <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 p-3 text-sm text-success">
                  <CheckCircle className="h-4 w-4" />
                  Úloha bola vytvorená. Presmerovávam na detail...
                </div>
              )}

              {mutation.isError && (
                <p className="text-sm text-destructive">
                  {mutation.error instanceof Error ? mutation.error.message : "Chyba pri vytváraní úlohy"}
                </p>
              )}

              <Button
                type="submit"
                className="w-full rounded-2xl bg-primary py-6 text-base font-bold text-primary-foreground shadow-xl shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98]"
                disabled={mutation.isPending}
                size="lg"
              >
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Potvrdiť a zaplatiť
              </Button>

            </form>
          </Form>
        </CardContent>
      </Card>
      </div>

    </div>
  );
}

