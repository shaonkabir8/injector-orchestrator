import { useState } from "react";
import { useGetCheckpoints, useDeleteCheckpoint, useRestoreCheckpoint } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive, Trash2, FastForward, Clock, Database, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function CheckpointsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [restoringId, setRestoringId] = useState<number | null>(null);
  
  const { data: checkpoints } = useGetCheckpoints({
    query: { queryKey: ["/api/checkpoints"] }
  });

  const deleteMut = useDeleteCheckpoint({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/checkpoints"] });
        toast({ title: "Checkpoint Deleted", className: "bg-background border-primary text-primary rounded-none font-mono" });
      }
    }
  });

  const restoreMut = useRestoreCheckpoint({
    mutation: {
      onSuccess: (data) => {
        setRestoringId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/loop/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/checkpoints"] });
        toast({
          title: `Restored Checkpoint #${data.checkpointId}`,
          description: `Resuming at iteration ${data.iteration} with ${data.model}`,
          className: "bg-background border-primary text-primary rounded-none font-mono",
        });
      },
      onError: () => {
        setRestoringId(null);
        toast({
          title: "Restore Failed",
          description: "Could not restore from this checkpoint",
          variant: "destructive",
          className: "rounded-none font-mono",
        });
      },
    }
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border rounded-none shadow-none">
        <CardHeader className="border-b border-border bg-sidebar p-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm uppercase font-bold flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-primary" />
            Saved State Checkpoints
          </CardTitle>
          <div className="text-xs text-muted-foreground font-mono">
            TOTAL: {checkpoints?.length || 0}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!checkpoints?.length ? (
            <div className="p-12 text-center text-muted-foreground font-mono flex flex-col items-center gap-2">
              <HardDrive className="w-8 h-8 opacity-20" />
              <div>NO CHECKPOINTS FOUND</div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {checkpoints.map(cp => (
                <div key={cp.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground uppercase">Iteration</span>
                      <span className="font-mono text-xl font-bold text-primary">#{cp.iteration}</span>
                    </div>
                    
                    <div className="h-8 w-px bg-border hidden md:block"></div>
                    
                    <div className="flex flex-col gap-1 font-mono text-xs">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(cp.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Database className="w-3 h-3" />
                        <span>{formatBytes(cp.fileSizeBytes)}</span>
                      </div>
                    </div>

                    {cp.notes && (
                      <>
                        <div className="h-8 w-px bg-border hidden md:block"></div>
                        <div className="text-sm italic opacity-80 max-w-xs truncate">
                          "{cp.notes}"
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-none border-primary text-primary hover:bg-primary hover:text-black font-mono text-xs"
                      onClick={() => {
                        setRestoringId(cp.id);
                        restoreMut.mutate({ id: cp.id });
                      }}
                      disabled={restoringId === cp.id}
                    >
                      {restoringId === cp.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FastForward className="w-4 h-4 mr-2" />
                      )}
                      {restoringId === cp.id ? "RESTORING..." : "RESTORE"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="rounded-none"
                      onClick={() => deleteMut.mutate({ id: cp.id })}
                      disabled={deleteMut.isPending || restoringId === cp.id}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
