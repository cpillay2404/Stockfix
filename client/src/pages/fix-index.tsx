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
  immediateActionCount: number;
  oosP1Count: number;
  lowStockP1Count: number;
  suggestedOrderSkuCount: number;
  negSOHCount: number;
  oosCount: number;
  lowStockCount: number;
  // Carin, 2026-08-18: "the fix menu must only show the client computed
  // overstocks" - the nexus_tasks-based number, NOT the same "all
  // overstocks" blanket number Insights shows.
  overstockCountFix: number;
  atRiskCount: number;
  distributionGapsCount: number;
}

// Fix tab (Carin's 2026-08-13 restructure): "what do I need to do" - a real
// work queue built from the same overview counts every other tab already
// uses, each entry routing to the real classification list or task flow
// that already exists, not a separate fabricated queue.
export default function FixIndex() {
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
  if (error || !data) return <div className="stockfix2-page"><p className="error-state">Couldn't load the work queue right now.</p></div>;

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

        <Sf2ClientSkuFilters store={store} rep={rep} client={client} basePath="/store-detail/fix" />

        <div className="sf2-sectionhead"><span>FIX · {data.resolvedClient}</span></div>

        {/* Compact rows (no subtitle line) 2026-08-17 (Carin: "can we bring
            everything above the fold") - 8 categories is too many to fit
            with a full description under each; title + count is enough for
            a menu a rep returns to often, description isn't needed every time. */}
        <section className="sf2-list sf2-list-compact">
          {/* Carin, 2026-08-18: "we need to show the 64 here" - the real
              full count (matching the list), not the further-narrowed P1
              subset which could legitimately read much smaller or 0.
              priority=P1 removed from the tap-through too, so the badge and
              the list it opens always agree. */}
          <button
            className="sf2-listrow tone-red"
            onClick={() => setLocation(`/store-detail/list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=oos${clientQS}`)}
          >
            <div className="sf2-listrow-title">Out of Stock</div>
            <div className="sf2-fixrow-right"><span className="sf2-listrow-status warn">{data.oosCount}</span><ChevronRight size={16} /></div>
          </button>

          <button
            className="sf2-listrow tone-orange"
            onClick={() => setLocation(`/store-detail/list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=low${clientQS}`)}
          >
            <div className="sf2-listrow-title">Low Stock</div>
            <div className="sf2-fixrow-right"><span className="sf2-listrow-status warn">{data.lowStockCount}</span><ChevronRight size={16} /></div>
          </button>

          <button
            className="sf2-listrow tone-orange"
            onClick={() => setLocation(`/store-detail/replenishment?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`)}
          >
            <div className="sf2-listrow-title">Recommended Orders to review</div>
            <div className="sf2-fixrow-right"><span className="sf2-listrow-status warn">{data.suggestedOrderSkuCount}</span><ChevronRight size={16} /></div>
          </button>

          <button
            className="sf2-listrow tone-red"
            onClick={() => setLocation(`/store-detail/list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=negsoh${clientQS}`)}
          >
            <div className="sf2-listrow-title">Negative SOH corrections</div>
            <div className="sf2-fixrow-right"><span className="sf2-listrow-status warn">{data.negSOHCount}</span><ChevronRight size={16} /></div>
          </button>

          <button
            className="sf2-listrow tone-purple"
            onClick={() => setLocation(`/store-detail/list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=overstock${clientQS}`)}
          >
            <div className="sf2-listrow-title">Overstock</div>
            <div className="sf2-fixrow-right"><span className="sf2-listrow-status warn">{data.overstockCountFix}</span><ChevronRight size={16} /></div>
          </button>

          <button
            className="sf2-listrow tone-amber"
            onClick={() => setLocation(`/store-detail/list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=risk${clientQS}`)}
          >
            <div className="sf2-listrow-title">At Risk</div>
            <div className="sf2-fixrow-right"><span className="sf2-listrow-status warn">{data.atRiskCount}</span><ChevronRight size={16} /></div>
          </button>

          <button
            className="sf2-listrow tone-blue"
            onClick={() => setLocation(`/store-detail/list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=distribution${clientQS}`)}
          >
            <div className="sf2-listrow-title">Distribution Gaps</div>
            <div className="sf2-fixrow-right"><span className="sf2-listrow-status warn">{data.distributionGapsCount}</span><ChevronRight size={16} /></div>
          </button>
        </section>
      </main>

      <Sf2BottomNav active="fix" store={store} rep={rep} clientQS={clientQS} />
    </div>
  );
}
