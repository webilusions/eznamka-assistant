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

const formSchema = z.object({
  licensePlate: z
    .string()
    .min(3, "EČV musí mať aspoň 3 znaky")
    .max(15, "EČV je príliš dlhá")
    .regex(/^[A-Z0-9\- ]+$/i, "Neplatný formát EČV"),
  countryCode: z.string().min(1, "Vyberte krajinu registrácie"),
  vignetteType: z.string().min(1, "Vyberte typ známky"),
  validityDate: z.date({ required_error: "Vyberte dátum platnosti" }),
  email: z.string().email("Zadajte platný email"),
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

const vignetteTypes = [
  { value: "1year", label: "Ročná známka (1 rok)" },
  { value: "1month", label: "Mesačná známka (30 dní)" },
  { value: "10day", label: "10-dňová známka" },
  { value: "1day", label: "Jednodňová známka" },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nová úloha — eZnamka Automatizácia" },
      { name: "description", content: "Vytvorte novú úlohu automatizácie nákupu diaľničnej známky" },
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
        navigate({ to: "/auth" });
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
          Nová úloha
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

              <FormField
                control={form.control}
                name="vignetteType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Typ diaľničnej známky</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Vyberte typ známky" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {vignetteTypes.map((v) => (
                          <SelectItem key={v.value} value={v.value}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="validityDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Dátum začiatku platnosti</FormLabel>
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
                              format(field.value, "d. MMMM yyyy", { locale: sk })
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
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
