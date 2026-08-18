import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bell, Store as StoreIcon, ChevronRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import Sf2BottomNav from "@/components/sf2-bottom-nav";
import Sf2ClientSkuFilters from "@/components/sf2-client-sku-filters";
import Sf2LoadingState from "@/components/sf2-loading-state";
import "./StoreOverview.css";

interface OverviewResponse {
  siteCode: string;
  banner: string;
  resolvedClient: string;
  avgWeeksOfCover: number;
  salesAtRiskSkuCount: number;
  overstockCount: number;
}

// Analysis tab (Carin's 2026-08-13 restructure): "why / trend / risk" -
// an index into the real analysis pages already built (Avg WFC, Cover
// Distribution, Sales at Risk, Overstock), each carrying a real summary
// number pulled from the same store-overview data every other tab uses.
// Fastest Stock Decline / Strongest Sales Growth aren't built - both would
// need a new per-SKU week-over-week ranking across the full store_sku_current
// list, which doesn't exist yet - shown as a real "not built" state rather
// than a fabricated number.
export default function AnalysisIndex() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";

  const { data, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ["nexus-store-overview", store, rep, client],
    queryFn: async () => {
      const res = await fetch(`/api/roster/store-overview?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS || "&client=ALL"}`);
      if (!res.ok) throw new Error("Failed to fetch store overview");
      return res.json();
    },
    enabled: !!store,
  });

  if (isLoading) return <Sf2LoadingState />;
  if (error || !data) return <div className="stockfix2-page"><p className="error-state">Couldn't load analysis data right now.</p></div>;

  const nav = (path: string) => setLocation(`${path}?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`);

  return (
    <div className="stockfix2-page">
      <header className="sf2-topbar">
        <BrandLogo size={20} />
        <div className="sf2-topbar-right">
          <span className="sf2-sync"><span className="sf2-sync-dot" />Synced</span>
          <Bell size={18} />
        </div>
      </header>

      <main className="sf2-content">
        <section className="sf2-storecard">
          <div className="sf2-storeicon"><StoreIcon size={18} /></div>
          <div className="sf2-storeinfo">
            <div className="sf2-storename">{store.toUpperCase()}</div>
            <div className="sf2-storemeta">{data.siteCode} · {data.banner} · visiting now</div>
          </div>
        </section>

        <Sf2ClientSkuFilters store={store} rep={rep} client={client} basePath="/store-detail/analysis" />

        <div className="sf2-sectionhead"><span>ANALYSIS · {data.resolvedClient}</span></div>

        <section className="sf2-list">
          <button className="sf2-listrow tone-purple" onClick={() => nav("/store-detail/cover")}>
            <div>
              <div className="sf2-listrow-title">Avg Weeks of Cover</div>
              <div className="sf2-listrow-meta">By-SKU cover distribution across all in-stock lines</div>
            </div>
            <div className="sf2-listrow-status ok">{data.avgWeeksOfCover.toFixed(1)}w</div>
          </button>
          <button className="sf2-listrow tone-purple" onClick={() => nav("/store-detail/cover-distribution")}>
            <div>
              <div className="sf2-listrow-title">Cover Distribution</div>
              <div className="sf2-listrow-meta">How many SKUs sit in each cover band</div>
            </div>
            <ChevronRight size={16} />
          </button>
          <button className="sf2-listrow tone-red" onClick={() => nav("/store-detail/sales-at-risk")}>
            <div>
              <div className="sf2-listrow-title">Sales at Risk</div>
              <div className="sf2-listrow-meta">Estimated missed sales from OOS/Low Stock</div>
            </div>
            <div className="sf2-listrow-status warn">{data.salesAtRiskSkuCount} SKUs</div>
          </button>
          <button
            className="sf2-listrow tone-purple"
            onClick={() => setLocation(`/store-detail/list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=overstock${clientQS}`)}
          >
            <div>
              <div className="sf2-listrow-title">Overstock Analysis</div>
              <div className="sf2-listrow-meta">SKUs holding more than the 6-week cover target</div>
            </div>
            <div className="sf2-listrow-status warn">{data.overstockCount} SKUs</div>
          </button>
        </section>
      </main>

      <Sf2BottomNav active="analysis" store={store} rep={rep} clientQS={clientQS} />
    </div>
  );
}
