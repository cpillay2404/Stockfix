import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bell, Store as StoreIcon, ShoppingCart, ChevronRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import Sf2BottomNav from "@/components/sf2-bottom-nav";
import Sf2ClientSkuFilters from "@/components/sf2-client-sku-filters";
import Sf2LoadingState from "@/components/sf2-loading-state";
import "./StoreOverview.css";

interface OverviewResponse {
  siteCode: string;
  banner: string;
  resolvedClient: string;
  dcAvailabilityPct: number;
  dcAvailableCount: number;
  noDcStockCount: number;
  suggestedOrderUnitsTotal: number;
  suggestedOrderSkuCount: number;
  suggestedOrderDcSupportedCount: number;
}
interface SkuRow {
  barcode: string;
  articleDescription: string;
  storeSoh: number;
  dcSoh: number | null;
  cover: number | null;
  suggestedOrderUnits: number | null;
  dcFulfillableUnits?: number | null;
}
interface SkuListResponse {
  rows: SkuRow[];
}

// Supply tab (Carin's 2026-08-13 restructure): "can we replenish it" - DC
// availability, replenishment opportunity, and the SKUs that are
// genuinely supply-constrained (OOS with zero DC stock, so an order
// wouldn't help), separated out from Insights' pure store-health KPIs.
export default function SupplyDetail() {
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

  const { data: lowStock } = useQuery<SkuListResponse>({
    queryKey: ["nexus-sku-list", store, rep, "low", client],
    queryFn: async () => {
      const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=low${clientQS || "&client=ALL"}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!store,
  });

  const { data: oosStock } = useQuery<SkuListResponse>({
    queryKey: ["nexus-sku-list", store, rep, "oos", client],
    queryFn: async () => {
      const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=oos${clientQS || "&client=ALL"}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!store,
  });

  const goToSku = (barcode: string, classification: "low" | "oos", rowClient?: string) => {
    const qs = rowClient ? `&client=${encodeURIComponent(rowClient)}` : clientQS;
    setLocation(`/store-detail/sku?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}&barcode=${encodeURIComponent(barcode)}${qs}`);
  };

  if (isLoading) return <Sf2LoadingState />;
  if (error || !data) return <div className="stockfix2-page"><p className="error-state">Couldn't load supply data right now.</p></div>;

  // Fixed 2026-08-17 (Carin: "shouldnt be in replenishment opportunities if
  // the DC has no stock... it must be under supply constraints right?") -
  // a DC-constrained SKU isn't a real order recommendation. It belongs in
  // Supply Constraints (below), not here.
  const topReplenishment = (lowStock?.rows || [])
    .filter((r) => (r.suggestedOrderUnits || 0) > 0 && ((r.dcSoh || 0) > 0 || (r.dcFulfillableUnits || 0) > 0))
    .sort((a, b) => (b.suggestedOrderUnits || 0) - (a.suggestedOrderUnits || 0))
    .slice(0, 5);

  const supplyConstraints = (oosStock?.rows || [])
    .filter((r) => (r.dcSoh || 0) === 0)
    .slice(0, 5);

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

        <Sf2ClientSkuFilters store={store} rep={rep} client={client} basePath="/store-detail/supply" />

        <div className="sf2-sectionhead"><span>SUPPLY · {data.resolvedClient}</span></div>

        <section className="kpi2-grid">
          <div className="kpi2-card tone-cyan">
            <div className="kpi2-value">{Math.round(data.dcAvailabilityPct)}%</div>
            <div className="kpi2-label">DC availability</div>
          </div>
          <div className="kpi2-card tone-green">
            <div className="kpi2-value">{data.dcAvailableCount}</div>
            <div className="kpi2-label">OOS with DC stock</div>
          </div>
          <div className="kpi2-card tone-red">
            <div className="kpi2-value">{data.noDcStockCount}</div>
            <div className="kpi2-label">No DC stock</div>
          </div>
        </section>

        <button
          className="sf2-replenish"
          onClick={() => setLocation(`/store-detail/replenishment?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`)}
        >
          <div className="sf2-replenish-icon"><ShoppingCart size={18} /></div>
          <div className="sf2-replenish-copy">
            <div className="sf2-replenish-title">Replenishment opportunity</div>
            <div className="sf2-replenish-sub">{data.suggestedOrderSkuCount} SKUs · {data.suggestedOrderDcSupportedCount} DC supported</div>
          </div>
          <div className="sf2-replenish-value">{data.suggestedOrderUnitsTotal}</div>
        </button>

        <div className="sf2-sectionhead"><span>TOP REPLENISHMENT OPPORTUNITIES</span></div>
        <section className="sf2-list">
          {topReplenishment.map((r) => (
            <button className="sf2-listrow tone-orange" key={r.barcode} onClick={() => goToSku(r.barcode, "low", (r as any).client)}>
              <div>
                <div className="sf2-listrow-title">{r.articleDescription}</div>
                <div className="sf2-listrow-meta">SOH {r.storeSoh} · DC {r.dcSoh ?? "—"}{r.cover !== null && ` · WFC ${r.cover.toFixed(1)}`}</div>
              </div>
              <div className="sf2-listrow-status ok">+{r.suggestedOrderUnits}</div>
            </button>
          ))}
          {topReplenishment.length === 0 && <p className="empty-state">No replenishment opportunities at this store.</p>}
        </section>

        <div className="sf2-sectionhead"><span>SUPPLY CONSTRAINTS</span></div>
        <p className="sf2-subtitle">Out of stock and DC has none either - escalate, don't order.</p>
        <section className="sf2-list">
          {supplyConstraints.map((r) => (
            <button className="sf2-listrow tone-red" key={r.barcode} onClick={() => goToSku(r.barcode, "oos", (r as any).client)}>
              <div>
                <div className="sf2-listrow-title">{r.articleDescription}</div>
                <div className="sf2-listrow-meta">SOH {r.storeSoh} · DC 0</div>
              </div>
              <ChevronRight size={16} className="kpi2-chevron" style={{ position: "static" }} />
            </button>
          ))}
          {supplyConstraints.length === 0 && <p className="empty-state">No supply-constrained SKUs right now.</p>}
        </section>
      </main>

      <Sf2BottomNav active="supply" store={store} rep={rep} clientQS={clientQS} />
    </div>
  );
}
