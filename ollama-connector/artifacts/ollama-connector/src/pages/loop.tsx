import { useState, useEffect } from "react";
import { 
  useGetLoopStatus, 
  useStartLoop, 
  useStopLoop, 
  useResumeLoop,
  useGetModels
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Square, FastForward, PlaySquare, Target, Settings2, Activity } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";

export default function LoopPage() {
  const queryClient = useQueryClient();
  const { data: loopStatus } = useGetLoopStatus({
    query: { refetchInterval: 3000, queryKey: ["/api/loop/status"] }
  });
  const { data: models } = useGetModels({
    query: { queryKey: ["/api/models"] }
  });

  const startMut = useStartLoop({ mutation: { onSuccess: () => invalidate() } });
  const stopMut = useStopLoop({ mutation: { onSuccess: () => invalidate() } });
  const resumeMut = useResumeLoop({ mutation: { onSuccess: () => invalidate() } });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/loop/status"] });

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<string>("");
  const [maxIterations, setMaxIterations] = useState<string>("50");
  const [parallelMode, setParallelMode] = useState(false);

  // Set default model when models load
  useEffect(() => {
    if (models?.length && !model) {
      setModel(models[0].name);
    }
  }, [models, model]);

  const handleStart = () => {
    if (!prompt.trim()) return;
    startMut.mutate({
      data: {
        prompt,
        model: model || undefined,
        maxIterations: parseInt(maxIterations) || undefined
      }
    });
  };

  const isRunning = loopStatus?.state === "running";
  const isPaused = loopStatus?.state === "paused";
  const isIdle = loopStatus?.state === "idle" || loopStatus?.state === "completed" || loopStatus?.state === "error";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card className="bg-card border-border rounded-none shadow-none">
          <CardHeader className="border-b border-border bg-sidebar p-4">
            <CardTitle className="text-sm uppercase font-bold flex items-center gap-2">
              <PlaySquare className="w-4 h-4 text-primary" />
              Initialization Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-xs uppercase text-primary">Master Prompt</Label>
              <Textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Initialize agentic sequence objective..."
                className="min-h-[200px] font-mono text-sm bg-background border-border rounded-none focus-visible:ring-primary focus-visible:border-primary resize-y"
                disabled={!isIdle}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase text-primary flex items-center gap-2">
                  <Target className="w-3 h-3" /> Target Model
                </Label>
                <Select value={model} onValueChange={setModel} disabled={!isIdle}>
                  <SelectTrigger className="rounded-none border-border bg-background font-mono text-sm">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-border">
                    {models?.map(m => (
                      <SelectItem key={m.name} value={m.name} className="font-mono">{m.name}</SelectItem>
                    ))}
                    {!models?.length && <SelectItem value="default" disabled>No models found</SelectItem>}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase text-primary flex items-center gap-2">
                  <Settings2 className="w-3 h-3" /> Max Iterations
                </Label>
                <Input 
                  type="number" 
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(e.target.value)}
                  className="rounded-none border-border bg-background font-mono"
                  disabled={!isIdle}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 border border-border bg-background/50">
              <Switch 
                checked={parallelMode}
                onCheckedChange={setParallelMode}
                disabled={!isIdle}
                className="data-[state=checked]:bg-primary"
              />
              <div className="space-y-0.5">
                <Label className="text-sm font-bold uppercase">Parallel Models Mode</Label>
                <div className="text-xs text-muted-foreground font-mono">Run prompt against multiple models simultaneously for consensus.</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Bar */}
        <div className="flex gap-4">
          <Button 
            onClick={handleStart}
            disabled={!isIdle || !prompt.trim() || startMut.isPending}
            className="flex-1 rounded-none h-14 text-lg font-bold tracking-widest bg-primary text-primary-foreground hover:bg-primary/80"
          >
            <Play className="w-5 h-5 mr-2" />
            EXECUTE SEQUENCE
          </Button>
          
          <Button 
            onClick={() => stopMut.mutate()}
            disabled={isIdle || stopMut.isPending}
            variant="destructive"
            className="flex-1 rounded-none h-14 text-lg font-bold tracking-widest"
          >
            <Square className="w-5 h-5 mr-2" />
            TERMINATE
          </Button>
        </div>
      </div>

      {/* Right Column: Status & Telemetry */}
      <div className="space-y-6">
        <Card className="bg-card border-border rounded-none shadow-none">
          <CardHeader className="border-b border-border bg-sidebar p-4">
            <CardTitle className="text-sm uppercase font-bold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Live Telemetry
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 font-mono text-sm">
            <div className="flex justify-between border-b border-border p-4">
              <span className="text-muted-foreground">STATE</span>
              <span className={`font-bold uppercase ${
                isRunning ? 'text-primary animate-pulse' :
                isPaused ? 'text-chart-3' :
                loopStatus?.state === 'error' ? 'text-destructive' : 'text-muted-foreground'
              }`}>
                {loopStatus?.state || "UNKNOWN"}
              </span>
            </div>
            <div className="flex justify-between border-b border-border p-4">
              <span className="text-muted-foreground">ACTIVE MODEL</span>
              <span className="text-foreground">{loopStatus?.currentModel || "NONE"}</span>
            </div>
            <div className="flex justify-between border-b border-border p-4">
              <span className="text-muted-foreground">ITERATION</span>
              <span className="text-foreground">{loopStatus?.iteration || 0} / {loopStatus?.maxIterations || "∞"}</span>
            </div>
            <div className="flex justify-between p-4">
              <span className="text-muted-foreground">STARTED</span>
              <span className="text-foreground">
                {loopStatus?.startedAt ? new Date(loopStatus.startedAt).toLocaleTimeString() : "-"}
              </span>
            </div>
          </CardContent>
        </Card>

        {isPaused && (
          <Button 
            onClick={() => resumeMut.mutate()}
            disabled={resumeMut.isPending}
            variant="outline"
            className="w-full rounded-none h-14 border-chart-3 text-chart-3 hover:bg-chart-3 hover:text-black font-bold tracking-widest text-lg"
          >
            <FastForward className="w-5 h-5 mr-2" />
            RESUME FROM CHECKPOINT
          </Button>
        )}
      </div>
    </div>
  );
}
