import { useGetMetricsSummary, useGetLoopStatus, useGetMetrics, useGetLogs } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Clock, Cpu, MemoryStick, Target, Zap, Server, TerminalSquare } from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

export default function DashboardPage() {
  const { data: summary } = useGetMetricsSummary({
    query: { refetchInterval: 5000, queryKey: ["/api/metrics/summary"] }
  });
  
  const { data: loopStatus } = useGetLoopStatus({
    query: { refetchInterval: 3000, queryKey: ["/api/loop/status"] }
  });

  const { data: metrics } = useGetMetrics({ limit: 50 }, {
    query: { refetchInterval: 5000, queryKey: ["/api/metrics", { limit: 50 }] }
  });

  const { data: logs } = useGetLogs({ limit: 5 }, {
    query: { refetchInterval: 5000, queryKey: ["/api/logs", { limit: 5 }] }
  });

  // Re-map metrics to chronological order for charts
  const chartData = metrics ? [...metrics].reverse() : [];

  const StatCard = ({ title, value, icon, subValue }: { title: string, value: string | number, icon: React.ReactNode, subValue?: string }) => (
    <Card className="bg-card border-border shadow-none rounded-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase">{title}</CardTitle>
        <div className="text-primary">{icon}</div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="text-2xl font-bold font-sans tracking-tight">{value}</div>
        {subValue && <p className="text-xs text-muted-foreground mt-1">{subValue}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className={`border p-4 flex items-center justify-between ${
        loopStatus?.state === 'running' 
          ? 'bg-primary/10 border-primary text-primary' 
          : loopStatus?.state === 'error'
            ? 'bg-destructive/10 border-destructive text-destructive'
            : 'bg-card border-border text-muted-foreground'
      }`}>
        <div className="flex items-center gap-3">
          <TerminalSquare className="w-5 h-5" />
          <span className="font-bold tracking-widest uppercase">
            {loopStatus?.state || 'UNKNOWN'}
          </span>
        </div>
        <div className="flex gap-6 text-sm">
          {loopStatus?.currentModel && (
            <div className="flex items-center gap-2">
              <span className="opacity-70">MODEL:</span>
              <span>{loopStatus.currentModel}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="opacity-70">ITERATION:</span>
            <span>{loopStatus?.iteration || 0}</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Iterations" 
          value={summary?.totalIterations ?? '-'} 
          icon={<Target className="w-4 h-4" />} 
          subValue="All time"
        />
        <StatCard 
          title="Total Tokens" 
          value={(summary?.totalTokens ?? 0).toLocaleString()} 
          icon={<Activity className="w-4 h-4" />} 
          subValue={`~$${(summary?.estimatedCostUsd ?? 0).toFixed(4)}`}
        />
        <StatCard 
          title="Avg Latency" 
          value={`${summary?.avgLatencyMs ?? 0}ms`} 
          icon={<Clock className="w-4 h-4" />} 
        />
        <StatCard 
          title="Success Rate" 
          value={`${(summary?.successRate ?? 0).toFixed(1)}%`} 
          icon={<Zap className="w-4 h-4" />} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Token Usage Chart */}
        <Card className="bg-card border-border shadow-none rounded-none">
          <CardHeader className="p-4 border-b border-border">
            <CardTitle className="text-sm font-medium uppercase flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Token Velocity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="iteration" hide />
                <YAxis hide domain={['dataMin', 'dataMax']} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: 0 }}
                  itemStyle={{ color: 'hsl(var(--primary))' }}
                />
                <Area type="step" dataKey="totalTokens" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorTokens)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Resources Chart */}
        <Card className="bg-card border-border shadow-none rounded-none">
          <CardHeader className="p-4 border-b border-border">
            <CardTitle className="text-sm font-medium uppercase flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              System Load
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="iteration" hide />
                <YAxis hide domain={[0, 100]} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: 0 }}
                />
                <Line type="monotone" dataKey="ramPercent" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} name="RAM %" />
                <Line type="monotone" dataKey="cpuLoad" stroke="hsl(var(--chart-3))" dot={false} strokeWidth={2} name="CPU %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Logs Tail */}
      <Card className="bg-card border-border shadow-none rounded-none">
        <CardHeader className="p-4 border-b border-border">
          <CardTitle className="text-sm font-medium uppercase flex items-center gap-2">
            <TerminalSquare className="w-4 h-4 text-primary" />
            Recent Output
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="font-mono text-xs max-h-64 overflow-y-auto">
            {!logs?.length ? (
              <div className="p-4 text-muted-foreground">No recent logs.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="border-b border-border/50 p-2 hover:bg-secondary/50 flex gap-4">
                  <span className="text-muted-foreground whitespace-nowrap opacity-50">
                    {new Date(log.timestamp).toISOString().split('T')[1].replace('Z', '')}
                  </span>
                  <span className={`font-bold min-w-[60px] ${
                    log.level === 'ERROR' ? 'text-destructive' :
                    log.level === 'SUCCESS' ? 'text-primary' :
                    log.level === 'WARN' ? 'text-chart-3' :
                    log.level === 'STEP' ? 'text-chart-2' :
                    log.level === 'CHECK' ? 'text-chart-4' :
                    'text-foreground'
                  }`}>
                    [{log.level}]
                  </span>
                  <span className="text-foreground break-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
