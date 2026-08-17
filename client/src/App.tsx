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
import RepHome from "@/pages/rep-home";
import StoresList from "@/pages/stores-list";
import StoreNexusOverview from "@/pages/store-nexus-overview";
import StoreSkuList from "@/pages/store-sku-list";
import SkuDetail from "@/pages/sku-detail";
import InStockDetail from "@/pages/instock-detail";
import DcAvailabilityDetail from "@/pages/dc-availability-detail";
import CoverAnalysisDetail from "@/pages/cover-analysis-detail";
import SalesAtRiskDetail from "@/pages/sales-at-risk-detail";
import AllIssues from "@/pages/all-issues";
import ReplenishmentDetail from "@/pages/replenishment-detail";
import CoverDistributionDetail from "@/pages/cover-distribution-detail";
import ActionCapture from "@/pages/action-capture";
import SupplyDetail from "@/pages/supply-detail";
import AnalysisIndex from "@/pages/analysis-index";
import FixIndex from "@/pages/fix-index";
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
import InsightsOverview from "@/pages/insights-overview";
import InsightsAvailability from "@/pages/insights-availability";
import InsightsLineList from "@/pages/insights-line-list";
import InsightsSku from "@/pages/insights-sku";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChooseAccess} />
      <Route path="/select-rep">{() => <ClientGuard><SelectRepStore /></ClientGuard>}</Route>
      <Route path="/select-client" component={SelectClientStore} />
      <Route path="/select-client-store" component={SelectClientStore} />
      <Route path="/select-manager">{() => <ClientGuard><SelectManager /></ClientGuard>}</Route>
      <Route path="/store-overview" component={StoreOverview} />
      <Route path="/home" component={RepHome} />
      <Route path="/stores" component={StoresList} />
      <Route path="/store-detail" component={StoreNexusOverview} />
      <Route path="/store-detail/list" component={StoreSkuList} />
      <Route path="/store-detail/sku" component={SkuDetail} />
      <Route path="/store-detail/instock" component={InStockDetail} />
      <Route path="/store-detail/dc-availability" component={DcAvailabilityDetail} />
      <Route path="/store-detail/cover" component={CoverAnalysisDetail} />
      <Route path="/store-detail/sales-at-risk" component={SalesAtRiskDetail} />
      <Route path="/store-detail/all-issues" component={AllIssues} />
      <Route path="/store-detail/replenishment" component={ReplenishmentDetail} />
      <Route path="/store-detail/cover-distribution" component={CoverDistributionDetail} />
      <Route path="/store-detail/action-capture" component={ActionCapture} />
      <Route path="/store-detail/supply" component={SupplyDetail} />
      <Route path="/store-detail/analysis" component={AnalysisIndex} />
      <Route path="/store-detail/fix" component={FixIndex} />
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
      <Route path="/store-overview/insights" component={InsightsOverview} />
      <Route path="/store-overview/insights/availability" component={InsightsAvailability} />
      <Route path="/store-overview/insights/line-list/:classification" component={InsightsLineList} />
      <Route path="/store-overview/insights/sku/:barcode" component={InsightsSku} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [location] = useLocation();
  const skipSplash = location === '/merchandiser-pilot' || location === '/inventory';

  // Mutually exclusive by construction: the role-selection UI (Router) is
  // never mounted while the splash is showing - not hidden behind it, not
  // faded under it. Confirmed bug 2026-08-08: previously Router rendered
  // unconditionally alongside the splash, so the old screen was visible
  // in the DOM the whole time regardless of the splash's own opacity.
  if (showSplash && !skipSplash) {
    return (
      <SplashScreen
        onComplete={() => setShowSplash(false)}
        minDisplayTime={8000 /* TEMP for review - revert to 1100 before shipping */}
      />
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AccessProvider>
          <Toaster />
          <Router />
        </AccessProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
