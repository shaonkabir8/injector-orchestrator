import {
  SettingsInputLogLevel,
  useGetSettings,
  useUpdateSettings,
  useTestConnection,
} from "@workspace/api-client-react";
import type { TestConnectionResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, Save, Cable, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { useEffect, useRef, useState } from "react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

type SettingsInput = {
  ollamaUrl?: string;
  defaultModel?: string;
  fallbackModel?: string;
  maxIterations?: number;
  maxRamPercent?: number;
  gitAutoCommit?: boolean;
  enableNotifications?: boolean;
  telegramBotToken?: string | null;
  telegramChatId?: string | null;
  metricsInterval?: number;
  logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR";
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [connectionTest, setConnectionTest] = useState<TestConnectionResult | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  
  const { data: settings } = useGetSettings({
    query: { queryKey: ["/api/settings"] }
  });

  const updateMut = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
        toast({ title: "Configuration Saved", className: "bg-background border-primary text-primary rounded-none font-mono" });
      }
    }
  });

  const form = useForm<SettingsInput>({
    defaultValues: {
      ollamaUrl: "",
      defaultModel: "",
      fallbackModel: "",
      maxIterations: 50,
      maxRamPercent: 90,
      gitAutoCommit: false,
      enableNotifications: false,
      telegramBotToken: "",
      telegramChatId: "",
      metricsInterval: 5000,
      logLevel: "INFO" as "DEBUG" | "INFO" | "WARN" | "ERROR"
    }
  });

  const isInitialized = useRef(false);

  useEffect(() => {
    if (settings && !isInitialized.current) {
      form.reset({
        ollamaUrl: settings.ollamaUrl,
        defaultModel: settings.defaultModel,
        fallbackModel: settings.fallbackModel,
        maxIterations: settings.maxIterations,
        maxRamPercent: settings.maxRamPercent,
        gitAutoCommit: settings.gitAutoCommit,
        enableNotifications: settings.enableNotifications,
        telegramBotToken: settings.telegramBotToken || "",
        telegramChatId: settings.telegramChatId || "",
        metricsInterval: settings.metricsInterval,
        logLevel: settings.logLevel as "DEBUG" | "INFO" | "WARN" | "ERROR"
      });
      isInitialized.current = true;
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsInput) => {
    // Clean up empty strings to null where appropriate if API requires it, 
    // but schema says string | null. Let's send what form has.
    updateMut.mutate({
      data: {
        ...data,
        maxIterations: Number(data.maxIterations),
        maxRamPercent: Number(data.maxRamPercent),
        metricsInterval: Number(data.metricsInterval)
      }
    });
  };

  if (!settings) {
    return <div className="font-mono text-primary animate-pulse">LOADING CONFIGURATION...</div>;
  }

  return (
    <Card className="bg-card border-border rounded-none shadow-none max-w-4xl mx-auto">
      <CardHeader className="border-b border-border bg-sidebar p-4 flex flex-row items-center justify-between">
        <CardTitle className="text-sm uppercase font-bold flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          System Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 font-mono">
            
            <div className="space-y-4">
              <h3 className="text-xs uppercase text-primary border-b border-border/50 pb-2">Core Connection</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ollamaUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">MODEL PROVIDER ENDPOINT</FormLabel>
                      <FormControl>
                        <Input {...field} className="rounded-none border-border bg-background" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex flex-col justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      setTestingConnection(true);
                      setConnectionTest(null);
                      try {
                        const url = form.getValues("ollamaUrl");
                        const res = await fetch("/api/settings/test-connection", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ollamaUrl: url || undefined }),
                        });
                        const data: TestConnectionResult = await res.json();
                        setConnectionTest(data);
                      } catch {
                        setConnectionTest({
                          success: false,
                          reachable: false,
                          ollamaUrl: form.getValues("ollamaUrl") || "http://localhost:11434",
                          message: "Network error",
                          models: [],
                        });
                      } finally {
                        setTestingConnection(false);
                      }
                    }}
                    disabled={testingConnection}
                    className="rounded-none h-10 border-primary text-primary hover:bg-primary hover:text-black font-mono text-xs"
                  >
                    {testingConnection ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Cable className="w-4 h-4 mr-2" />
                    )}
                    {testingConnection ? "TESTING..." : "TEST PROVIDER CONNECTION"}
                  </Button>

                  {connectionTest && (
                    <div className={`text-xs font-mono p-3 border ${connectionTest.success ? "border-primary bg-primary/5" : "border-destructive bg-destructive/5"}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {connectionTest.success ? (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive" />
                        )}
                        <span className={connectionTest.success ? "text-primary" : "text-destructive"}>
                          {connectionTest.reachable ? "REACHABLE" : "UNREACHABLE"}
                        </span>
                        <span className="text-muted-foreground ml-auto">{connectionTest.ollamaUrl}</span>
                      </div>
                      <p className="text-foreground/80 mb-2">{connectionTest.message}</p>
                      {connectionTest.models && connectionTest.models.length > 0 && (
                        <div className="space-y-1">
                          {connectionTest.models.map((m) => (
                            <div key={m.name} className="flex items-center justify-between text-muted-foreground border-b border-border/30 pb-1 last:border-0">
                              <span>{m.name}</span>
                              <span className="text-xs">{(m.size / 1_000_000_000).toFixed(1)} GB</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="defaultModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">DEFAULT MODEL</FormLabel>
                      <FormControl>
                        <Input {...field} className="rounded-none border-border bg-background" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fallbackModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">FALLBACK MODEL</FormLabel>
                      <FormControl>
                        <Input {...field} className="rounded-none border-border bg-background" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs uppercase text-primary border-b border-border/50 pb-2">Limits & Safety</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="maxIterations"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">MAX LOOP ITERATIONS</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="rounded-none border-border bg-background" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxRamPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">MAX RAM USAGE (%)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="rounded-none border-border bg-background" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="metricsInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">METRICS POLL (MS)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} className="rounded-none border-border bg-background" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs uppercase text-primary border-b border-border/50 pb-2">Integrations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="gitAutoCommit"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-none border border-border p-4 bg-background/50">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Git Auto-Commit</FormLabel>
                        <div className="text-xs text-muted-foreground">Commit working dir on checkpoint</div>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-primary" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="enableNotifications"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-none border border-border p-4 bg-background/50">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Alerts Enabled</FormLabel>
                        <div className="text-xs text-muted-foreground">Send messages to Telegram</div>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-primary" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {form.watch("enableNotifications") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="telegramBotToken"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">TG BOT TOKEN</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} value={field.value || ""} className="rounded-none border-border bg-background" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="telegramChatId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">TG CHAT ID</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} className="rounded-none border-border bg-background" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-xs uppercase text-primary border-b border-border/50 pb-2">Logging</h3>
              <FormField
                control={form.control}
                name="logLevel"
                render={({ field }) => (
                  <FormItem className="w-64">
                    <FormLabel className="text-xs">MINIMUM LOG LEVEL</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="rounded-none border-border bg-background">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-none border-border">
                        {Object.values(SettingsInputLogLevel).map(lvl => (
                          <SelectItem key={lvl} value={lvl}>{lvl}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <Button 
              type="submit" 
              className="w-full h-14 rounded-none bg-primary text-black font-bold tracking-widest text-lg hover:bg-primary/80"
              disabled={updateMut.isPending}
            >
              <Save className="w-5 h-5 mr-2" />
              SAVE CONFIGURATION
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
