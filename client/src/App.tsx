import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SplashScreen } from "@/components/splash-screen";
import { AccessProvider } from "@/context/AccessContext";
import NotFound from "@/pages/not-found";
import ChooseAccess from "@/pages/choose-access";
import SelectRepStore from "@/pages/select-rep-store";
import SelectClientStore from "@/pages/select-client-store";
import Home from "@/pages/home";
import TaskList from "@/pages/dashboard";
import TaskDetail from "@/pages/task-detail";
import ImportData from "@/pages/import-data";
import StoreSummary from "@/pages/store-summary";
import StoreOverview from "@/pages/store-overview";
import ExitVisit from "@/pages/exit-visit";
import RepProgress from "@/pages/rep-progress";
import ManagerProgress from "@/pages/manager-progress";
import SelectManager from "@/pages/select-manager";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChooseAccess} />
      <Route path="/select-rep" component={SelectRepStore} />
      <Route path="/select-client" component={SelectClientStore} />
      <Route path="/select-manager" component={SelectManager} />
      <Route path="/store-overview" component={StoreOverview} />
      <Route path="/dashboard" component={Home} />
      <Route path="/tasks" component={TaskList} />
      <Route path="/import" component={ImportData} />
      <Route path="/task/:id" component={TaskDetail} />
      <Route path="/store/:storeName" component={StoreSummary} />
      <Route path="/exit-visit" component={ExitVisit} />
      <Route path="/rep-progress" component={RepProgress} />
      <Route path="/manager-progress" component={ManagerProgress} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AccessProvider>
          {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} minDisplayTime={5000} />}
          <Toaster />
          <Router />
        </AccessProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
