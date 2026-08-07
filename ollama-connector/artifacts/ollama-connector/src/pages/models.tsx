import { useState } from "react";
import { useGetModels, usePullModel } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Database, Download, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ModelsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: models } = useGetModels({
    query: { refetchInterval: 5000, queryKey: ["/api/models"] }
  });

  const pullMut = usePullModel({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["/api/models"] });
        if (data.success) {
          toast({ title: "Pull Initiated", description: data.message, className: "bg-background border-primary text-primary rounded-none font-mono" });
        } else {
          toast({ title: "Pull Failed", description: data.message, variant: "destructive", className: "rounded-none font-mono" });
        }
        setPullName("");
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to initiate pull", variant: "destructive", className: "rounded-none font-mono" });
      }
    }
  });

  const [pullName, setPullName] = useState("");

  const formatSize = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Pull Form */}
      <Card className="bg-card border-border rounded-none shadow-none">
        <CardHeader className="border-b border-border bg-sidebar p-4">
          <CardTitle className="text-sm uppercase font-bold flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            Pull New Model
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex gap-4">
          <Input 
            placeholder="e.g. llama3:8b, mistral, codellama..." 
            value={pullName}
            onChange={(e) => setPullName(e.target.value)}
            className="flex-1 rounded-none border-border bg-background font-mono text-sm h-12"
            disabled={pullMut.isPending}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pullName.trim()) {
                pullMut.mutate({ data: { name: pullName.trim() } });
              }
            }}
          />
          <Button 
            onClick={() => pullMut.mutate({ data: { name: pullName.trim() } })}
            disabled={!pullName.trim() || pullMut.isPending}
            className="rounded-none h-12 px-8 font-bold tracking-widest font-mono"
          >
            PULL
          </Button>
        </CardContent>
      </Card>

      {/* Model List */}
      <Card className="bg-card border-border rounded-none shadow-none">
        <CardHeader className="border-b border-border bg-sidebar p-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm uppercase font-bold flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Available Models
          </CardTitle>
          <div className="text-xs text-muted-foreground font-mono">
            TOTAL: {models?.length || 0}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!models?.length ? (
            <div className="p-12 text-center text-muted-foreground font-mono flex flex-col items-center gap-2">
              <Database className="w-8 h-8 opacity-20" />
              <div>NO MODELS FOUND IN REGISTRY</div>
            </div>
          ) : (
            <div className="divide-y divide-border font-mono text-sm">
              <div className="grid grid-cols-12 gap-4 p-4 text-xs text-muted-foreground uppercase tracking-widest bg-background/50">
                <div className="col-span-5">Model Name</div>
                <div className="col-span-2 text-right">Size</div>
                <div className="col-span-3">Modified</div>
                <div className="col-span-2 text-right">Status</div>
              </div>
              {models.map(model => (
                <div key={model.name} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-secondary/30 transition-colors">
                  <div className="col-span-5 font-bold text-primary truncate" title={model.name}>
                    {model.name}
                  </div>
                  <div className="col-span-2 text-right text-muted-foreground">
                    {formatSize(model.size)}
                  </div>
                  <div className="col-span-3 text-muted-foreground truncate">
                    {new Date(model.modifiedAt).toLocaleString()}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    {model.status === 'available' && (
                      <div className="flex items-center gap-1 text-primary text-xs">
                        <CheckCircle2 className="w-3 h-3" />
                        AVAILABLE
                      </div>
                    )}
                    {model.status === 'pulling' && (
                      <div className="flex items-center gap-1 text-chart-2 text-xs">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        PULLING
                      </div>
                    )}
                    {model.status === 'error' && (
                      <div className="flex items-center gap-1 text-destructive text-xs">
                        <AlertCircle className="w-3 h-3" />
                        ERROR
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
