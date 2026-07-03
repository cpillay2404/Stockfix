import { useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SplashScreen } from "@/components/splash-screen";
import { AccessProvider } from "@/context/AccessContext";
import { ClientGuard } from "@/components/ClientGuard";
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
import AdminLeaderboard from "@/pages/admin-leaderboard";
import QRPage from "@/pages/qr";
import MerchandiserPilot from "@/pages/merchandiser-pilot";
import InventoryDashboard from "@/pages/inventory-dashboard";
import Analytics from "@/pages/analytics";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChooseAccess} />
      <Route path="/select-rep">{() => <ClientGuard><SelectRepStore /></ClientGuard>}</Route>
      <Route path="/select-client" component={SelectClientStore} />
      <Route path="/select-client-store" component={SelectClientStore} />
      <Route path="/select-manager">{() => <ClientGuard><SelectManager /></ClientGuard>}</Route>
      <Route path="/store-overview" component={StoreOverview} />
      <Route path="/dashboard">{() => <ClientGuard><Home /></ClientGuard>}</Route>
      <Route path="/tasks" component={TaskList} />
      <Route path="/import">{() => <ClientGuard><ImportData /></ClientGuard>}</Route>
      <Route path="/task/:id" component={TaskDetail} />
      <Route path="/store/:storeName">{() => <ClientGuard><StoreSummary /></ClientGuard>}</Route>
      <Route path="/exit-visit" component={ExitVisit} />
      <Route path="/rep-progress">{() => <ClientGuard><RepProgress /></ClientGuard>}</Route>
      <Route path="/manager-progress">{() => <ClientGuard><ManagerProgress /></ClientGuard>}</Route>
      <Route path="/admin/leaderboard">{() => <ClientGuard><AdminLeaderboard /></ClientGuard>}</Route>
      <Route path="/qr" component={QRPage} />
      <Route path="/merchandiser-pilot" component={MerchandiserPilot} />
      <Route path="/inventory" component={InventoryDashboard} />
      <Route path="/analytics">{() => <ClientGuard><Analytics /></ClientGuard>}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [location] = useLocation();
  const skipSplash = location === '/merchandiser-pilot' || location === '/inventory' || location === '/analytics';

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AccessProvider>
          {showSplash && !skipSplash && <SplashScreen onComplete={() => setShowSplash(false)} minDisplayTime={5000} />}
          <Toaster />
          <Router />
        </AccessProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
