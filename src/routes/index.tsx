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
    email: z.string().email("Zadajte platný email"),
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

const vignetteTypes = [
  {
    value: "1year",
    title: "365-DŇOVÁ 2026",
    badge: "365/D",
    badgeClass: "bg-[#1e4a7a] text-white",
    validity: "365 dní od začiatku platnosti",
    price: "90,00 EUR",
  },
  {
    value: "1month",
    title: "30-DŇOVÁ 2026",
    badge: "30/D",
    badgeClass: "bg-[#5bb3e4] text-white",
    validity: "30 dní od začiatku platnosti",
    price: "17,10 EUR",
  },
  {
    value: "10day",
    title: "10-DŇOVÁ 2026",
    badge: "10/D",
    badgeClass: "bg-[#9ca3af] text-white",
    validity: "10 dní od začiatku platnosti",
    price: "10,80 EUR",
  },
  {
    value: "1day",
    title: "1-DŇOVÁ 2026",
    badge: "1/D",
    badgeClass: "bg-[#f5a623] text-white",
    validity: "1 deň od začiatku platnosti",
    price: "8,10 EUR",
  },
];

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
    if (!isExternalApiEnabled()) {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/prihlasenie" });
        return;
      }
    }
    mutation.mutate({
      data: {
        licensePlate: values.licensePlate.toUpperCase().trim(),
        countryCode: values.countryCode,
        vignetteType: values.vignetteType,
        validityDate: values.validityDate.toISOString().split("T")[0],
        email: values.email.trim(),
      },
    });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Car className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Nákup známky
        </h1>
        <p className="mt-2 text-muted-foreground">
          Zadajte údaje o vozidle a pripravíme nákup diaľničnej známky
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Údaje o vozidle</CardTitle>
          <CardDescription>
            Vyplňte všetky polia pre automatizovanú prípravu nákupu
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                            <span className="mr-2">{c.flag}</span>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickCountries.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => field.onChange(c.code)}
                          aria-label={c.name}
                          title={c.name}
                          className={cn(
                            "flex h-9 w-12 items-center justify-center rounded-md border text-xl transition",
                            field.value === c.code
                              ? "border-primary ring-2 ring-primary/30"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          {c.flag}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vignetteType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Typ diaľničnej známky</FormLabel>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {vignetteTypes.map((v) => {
                        const selected = field.value === v.value;
                        return (
                          <button
                            type="button"
                            key={v.value}
                            onClick={() => field.onChange(v.value)}
                            className={cn(
                              "rounded-lg border-2 p-3 text-left transition bg-[#d6e9f5]",
                              selected
                                ? "border-primary ring-2 ring-primary/30"
                                : "border-transparent hover:border-primary/40"
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
                              <div className="flex-1 rounded bg-white p-2 text-xs">
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
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          locale={sk}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
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
                  ** automaticky vypočítané podľa typu známky
                </p>
              </div>



              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email pre potvrdenie</FormLabel>
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
                      Automatizácia sa zastaví pred finálnym krokom platby. Údaje objednávky si
                      musíte ručne skontrolovať pred zaplatením. Nepodporujeme automatizáciu platieb.
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
                className="w-full"
                disabled={mutation.isPending}
                size="lg"
              >
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Vytvoriť úlohu a spustiť automatizáciu
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
