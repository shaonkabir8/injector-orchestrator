import { useState } from "react";
import { AppLayout } from "@/components/layout";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence } from "framer-motion";
import { PageTransition } from "@/components/page-transition";
import { SplashScreen } from "@/components/splash-screen";
import NotFound from "@/pages/not-found";

import DashboardPage from "@/pages/dashboard";
import LogsPage from "@/pages/logs";
import LoopPage from "@/pages/loop";
import CheckpointsPage from "@/pages/checkpoints";
import SettingsPage from "@/pages/settings";
import ModelsPage from "@/pages/models";

const queryClient = new QueryClient();

function Router() {
  const [location] = useState(() => window.location.pathname);

  return (
    <AppLayout>
      <AnimatePresence mode="wait">
        <PageTransition key={location}>
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/logs" component={LogsPage} />
            <Route path="/loop" component={LoopPage} />
            <Route path="/checkpoints" component={CheckpointsPage} />
            <Route path="/settings" component={SettingsPage} />
            <Route path="/models" component={ModelsPage} />
            <Route component={NotFound} />
          </Switch>
        </PageTransition>
      </AnimatePresence>
    </AppLayout>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
