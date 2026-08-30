import { useState, useRef, useEffect } from "react";
import { useGetLogs, useClearLogs } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, PauseCircle, PlayCircle, Filter } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function LogsPage() {
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const queryParams = levelFilter === "ALL" ? { limit: 1000 } : { limit: 1000, level: levelFilter };

  const { data: logs } = useGetLogs(queryParams, {
    query: { refetchInterval: autoScroll ? 2000 : false, queryKey: ["/api/logs", queryParams] }
  });

  const clearLogsMut = useClearLogs({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      }
    }
  });

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const levels = ["ALL", "INFO", "SUCCESS", "WARN", "ERROR", "STEP", "CHECK"];

  return (
    <div className="flex flex-col h-full bg-card border border-border">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-sidebar">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-primary font-bold uppercase tracking-widest text-sm">
            <Filter className="w-4 h-4" />
            <span>Filter:</span>
          </div>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-32 h-8 rounded-none border-border bg-background text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none border-border">
              {levels.map(lvl => (
                <SelectItem key={lvl} value={lvl} className="font-mono text-xs">{lvl}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setAutoScroll(!autoScroll)}
            className={`rounded-none h-8 text-xs font-mono ${autoScroll ? 'text-primary border-primary' : 'text-muted-foreground'}`}
          >
            {autoScroll ? <PauseCircle className="w-4 h-4 mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            {autoScroll ? "PAUSE SCROLL" : "RESUME SCROLL"}
          </Button>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => clearLogsMut.mutate()}
            disabled={clearLogsMut.isPending}
            className="rounded-none h-8 text-xs font-mono"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            CLEAR
          </Button>
        </div>
      </div>

      {/* Log Output */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-auto p-4 font-mono text-xs bg-background space-y-1"
        onScroll={(e) => {
          // Disable auto-scroll if user scrolls up
          const target = e.target as HTMLDivElement;
          const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
          if (!isAtBottom && autoScroll) setAutoScroll(false);
        }}
      >
        {!logs?.length ? (
          <div className="text-muted-foreground opacity-50 flex h-full items-center justify-center">
            [ NO LOGS FOUND ]
          </div>
        ) : (
          logs.map((log) => {
            const time = new Date(log.timestamp).toISOString().split('T')[1].replace('Z', '');
            let colorClass = "text-foreground";
            if (log.level === "ERROR") colorClass = "text-destructive";
            if (log.level === "SUCCESS") colorClass = "text-primary";
            if (log.level === "WARN") colorClass = "text-chart-3";
            if (log.level === "STEP") colorClass = "text-chart-2";
            if (log.level === "CHECK") colorClass = "text-chart-4";
            if (log.level === "INFO") colorClass = "text-muted-foreground";

            return (
              <div key={log.id} className="flex gap-4 hover:bg-secondary/50 py-0.5 px-2">
                <span className="text-muted-foreground opacity-40 select-none">{time}</span>
                <span className={`font-bold min-w-[70px] ${colorClass}`}>
                  [{log.level}]
                </span>
                <span className={`break-all ${colorClass}`}>
                  {log.message}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
