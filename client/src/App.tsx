import { useEffect, useState } from "react";
import { Redirect, Switch, Route, useLocation, useSearch } from "wouter";
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
import NexusExitVisit from "@/pages/nexus-exit-visit";
import StoreTrendDetail from "@/pages/store-trend-detail";
import SkuTrendDetail from "@/pages/sku-trend-detail";
import ImportData from "@/pages/import-data";
import NexusRepProgress from "@/pages/nexus-rep-progress";
import ManagerProgress from "@/pages/manager-progress";
import SelectManager from "@/pages/select-manager";
import AdminLeaderboard from "@/pages/admin-leaderboard";
import QRPage from "@/pages/qr";
import MerchandiserPilot from "@/pages/merchandiser-pilot";
import InventoryDashboard from "@/pages/inventory-dashboard";
import { getEndVisitPath, getUnclosedVisit, isActiveVisitContext, LeaveVisitPrompt } from "@/lib/visit-guard";
import {
  getStockFixEmbeddedCaptureContext,
  installEmbeddedRosterFetchGuard,
} from "@/lib/stockfix-embedded";

if (typeof window !== "undefined") {
  installEmbeddedRosterFetchGuard();
}

function LegacyRouteRedirect({
  to,
  params = {},
}: {
  to: string;
  params?: Record<string, string | undefined>;
}) {
  const search = useSearch();
  const query = new URLSearchParams(search);

  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });

  const queryString = query.toString();
  return <Redirect to={`${to}${queryString ? `?${queryString}` : ""}`} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChooseAccess} />
      <Route path="/select-rep">{() => <ClientGuard><SelectRepStore /></ClientGuard>}</Route>
      <Route path="/select-client" component={SelectClientStore} />
      <Route path="/select-client-store" component={SelectClientStore} />
      <Route path="/select-manager">{() => <ClientGuard><SelectManager /></ClientGuard>}</Route>
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
      <Route path="/store-detail/exit-visit" component={NexusExitVisit} />
      <Route path="/store-detail/trend" component={StoreTrendDetail} />
      <Route path="/store-detail/sku-trend" component={SkuTrendDetail} />
      <Route path="/import">{() => <ClientGuard><ImportData /></ClientGuard>}</Route>
      <Route path="/nexus-rep-progress">{() => <ClientGuard><NexusRepProgress /></ClientGuard>}</Route>
      <Route path="/manager-progress">{() => <ClientGuard><ManagerProgress /></ClientGuard>}</Route>
      <Route path="/admin/leaderboard">{() => <ClientGuard><AdminLeaderboard /></ClientGuard>}</Route>
      <Route path="/qr" component={QRPage} />
      <Route path="/merchandiser-pilot" component={MerchandiserPilot} />
      <Route path="/inventory" component={InventoryDashboard} />
      {/* Retain old deep links without exposing the retired screens. */}
      <Route path="/store-overview/insights">
        {() => <LegacyRouteRedirect to="/store-detail" />}
      </Route>
      <Route path="/store-overview/insights/availability">
        {() => <LegacyRouteRedirect to="/store-detail/instock" />}
      </Route>
      <Route path="/store-overview/insights/line-list/:classification">
        {(params) => (
          <LegacyRouteRedirect
            to="/store-detail/list"
            params={{ classification: params.classification }}
          />
        )}
      </Route>
      <Route path="/store-overview/insights/sku/:barcode">
        {(params) => (
          <LegacyRouteRedirect
            to="/store-detail/sku"
            params={{ barcode: params.barcode, classification: "all" }}
          />
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [location, setLocation] = useLocation();
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);
  // Skip splash for direct deep links and signed PerfectStorePro embeds. The
  // latter carries route context in its token rather than duplicating it in
  // query parameters.
  const hasRepParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('rep');
  const hasEmbeddedCaptureContext = Boolean(getStockFixEmbeddedCaptureContext());
  const skipSplash = location === '/merchandiser-pilot'
    || location === '/inventory'
    || hasRepParam
    || hasEmbeddedCaptureContext;

  // A browser/device Back gesture can bypass page-level buttons. Apply the
  // open-visit rule once at the app boundary so it protects every in-store
  // page, while still allowing navigation between /store-detail pages.
  useEffect(() => {
    let restoringHistory = false;
    const handlePopState = () => {
      if (restoringHistory) {
        restoringHistory = false;
        return;
      }
      const activeVisit = getUnclosedVisit();
      if (!activeVisit) return;
      const destination = new URL(window.location.href);
      const remainsInActiveVisit = destination.pathname.startsWith("/store-detail")
        && isActiveVisitContext(
          destination.searchParams.get("store"),
          destination.searchParams.get("rep")
        );
      if (remainsInActiveVisit) return;

      restoringHistory = true;
      window.history.forward();
      setShowLeavePrompt(true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const resumeEndVisit = () => {
    const activeVisit = getUnclosedVisit();
    if (!activeVisit) {
      setShowLeavePrompt(false);
      return;
    }
    setShowLeavePrompt(false);
    setLocation(getEndVisitPath(activeVisit));
  };

  // Mutually exclusive by construction: the role-selection UI (Router) is
  // never mounted while the splash is showing - not hidden behind it, not
  // faded under it. Confirmed bug 2026-08-08: previously Router rendered
  // unconditionally alongside the splash, so the old screen was visible
  // in the DOM the whole time regardless of the splash's own opacity.
  if (showSplash && !skipSplash) {
    return (
      <SplashScreen
        onComplete={() => setShowSplash(false)}
        minDisplayTime={1100}
      />
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AccessProvider>
          <Toaster />
          <Router />
          {showLeavePrompt && (
            <LeaveVisitPrompt
              onStay={() => setShowLeavePrompt(false)}
              onEndVisit={resumeEndVisit}
            />
          )}
        </AccessProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
