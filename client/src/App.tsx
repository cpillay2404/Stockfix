import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SplashScreen } from "@/components/splash-screen";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import TaskList from "@/pages/dashboard";
import TaskDetail from "@/pages/task-detail";
import ImportData from "@/pages/import-data";
import StoreSummary from "@/pages/store-summary";
import StoreOverview from "@/pages/store-overview";
import ExitVisit from "@/pages/exit-visit";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/store-overview" component={StoreOverview} />
      <Route path="/dashboard" component={Home} />
      <Route path="/tasks" component={TaskList} />
      <Route path="/import" component={ImportData} />
      <Route path="/task/:id" component={TaskDetail} />
      <Route path="/store/:storeName" component={StoreSummary} />
      <Route path="/exit-visit" component={ExitVisit} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} minDisplayTime={5000} />}
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
