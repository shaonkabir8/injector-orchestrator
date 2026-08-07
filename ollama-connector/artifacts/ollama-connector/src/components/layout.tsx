import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Terminal, Activity, FileText, Settings, PlaySquare, HardDrive, Database, Cpu } from "lucide-react";
import { useGetLoopStatus } from "@workspace/api-client-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileNav } from "./mobile-nav";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const { data: loopStatus } = useGetLoopStatus({
    query: { refetchInterval: 3000, queryKey: ["/api/loop/status"] }
  });

  const isRunning = loopStatus?.state === "running";

  return (
    <div className="flex h-dvh w-full bg-background text-foreground overflow-hidden font-mono text-sm">
      {/* Desktop Sidebar — hidden on mobile */}
      {!isMobile && (
        <div className="w-64 border-r border-border bg-sidebar flex flex-col h-full flex-shrink-0 relative">
          {/* Terminal Header */}
          <div className="p-4 border-b border-border flex items-center gap-3">
            <Terminal className="text-primary w-5 h-5" />
            <div>
              <div className="font-bold tracking-widest text-primary font-sans uppercase">OLLAMA_CONN</div>
              <div className="text-xs text-muted-foreground">v0.1.0-alpha</div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            <div className="text-xs text-muted-foreground mb-2 px-2 uppercase tracking-wider">System</div>
            <NavLink href="/" icon={<Activity className="w-4 h-4" />} label="Dashboard" active={location === "/"} />
            <NavLink href="/loop" icon={<PlaySquare className="w-4 h-4" />} label="Loop Control" active={location === "/loop"} />
            <NavLink href="/logs" icon={<FileText className="w-4 h-4" />} label="System Logs" active={location === "/logs"} />
            
            <div className="text-xs text-muted-foreground mt-4 mb-2 px-2 uppercase tracking-wider">Resources</div>
            <NavLink href="/models" icon={<Database className="w-4 h-4" />} label="Models" active={location === "/models"} />
            <NavLink href="/checkpoints" icon={<HardDrive className="w-4 h-4" />} label="Checkpoints" active={location === "/checkpoints"} />
            
            <div className="text-xs text-muted-foreground mt-4 mb-2 px-2 uppercase tracking-wider">Config</div>
            <NavLink href="/settings" icon={<Settings className="w-4 h-4" />} label="Settings" active={location === "/settings"} />
          </nav>

          {/* Global Status Footer */}
          <div className="p-4 border-t border-border bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">ENGINE_STATUS</span>
              <div className="flex items-center gap-2">
                {isRunning && <span className="animate-pulse w-2 h-2 rounded-full bg-primary" />}
                <span className={`text-xs font-bold ${isRunning ? "text-primary" : "text-muted-foreground"}`}>
                  {loopStatus?.state?.toUpperCase() || "OFFLINE"}
                </span>
              </div>
            </div>
            {isRunning && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">ITERATION</span>
                  <span>{loopStatus?.iteration}/{loopStatus?.maxIterations || "∞"}</span>
                </div>
                <div className="h-1 bg-muted w-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-500 ease-in-out"
                    style={{ width: `${loopStatus?.maxIterations ? (loopStatus.iteration / loopStatus.maxIterations) * 100 : 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-background">
        <div className="scanline" />
        {/* Top bar — compact on mobile */}
        <div className="px-3 md:px-4 border-b border-border bg-background flex items-center justify-between flex-shrink-0 h-10 md:h-auto md:py-4">
          <div className="flex items-center gap-2 text-muted-foreground overflow-hidden">
            <span className="text-primary shrink-0">{'>'}</span>
            <span className="truncate text-xs md:text-sm">{location || '/'}</span>
          </div>
          <div className="flex items-center gap-3 md:gap-4 text-[10px] md:text-xs">
            {/* Mobile: show running indicator */}
            {isMobile && (
              <div className="flex items-center gap-2">
                {isRunning && <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-primary" />}
                <span className={`font-bold ${isRunning ? "text-primary" : "text-muted-foreground"}`}>
                  {loopStatus?.state?.toUpperCase() || "OFFLINE"}
                </span>
              </div>
            )}
            <div className="hidden md:flex items-center gap-2">
              <Cpu className="w-3 h-3" />
              <span>SYS_READY</span>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3 md:p-6 relative z-10 scroll-smooth overscroll-contain">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      {isMobile && <MobileNav />}

      {/* Mobile spacer for bottom nav */}
      {isMobile && <div className="h-16 shrink-0" />}
    </div>
  );
}

function NavLink({ href, icon, label, active }: { href: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <Link href={href} className={`flex items-center gap-3 px-3 py-2 transition-colors hover:bg-secondary hover:text-primary group ${active ? 'bg-secondary text-primary border-l-2 border-primary' : 'text-muted-foreground border-l-2 border-transparent'}`}>
      {icon}
      <span>{label}</span>
      <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-primary">{'>'}</span>
    </Link>
  );
}
