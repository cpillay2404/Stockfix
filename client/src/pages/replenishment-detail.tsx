import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Store as StoreIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import Sf2LoadingState from "@/components/sf2-loading-state";
import "./StoreOverview.css";

interface SkuRow {
  barcode: string;
  articleDescription: string;
  storeSoh: number;
  dcSoh: number | null;
  sellOutP4: number | null;
  suggestedOrderUnits: number | null;
  dcFulfillableUnits?: number | null;
}
interface SkuListResponse {
  resolvedClient: string;
  rows: SkuRow[];
}
interface OverviewResponse {
  siteCode: string;
  banner: string;
}

export default function ReplenishmentDetail() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";

  const { data, isLoading, error } = useQuery<SkuListResponse>({
    queryKey: ["nexus-sku-list", store, rep, "low", client],
    queryFn: async () => {
      const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=low${clientQS}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!store,
  });

  const { data: overview } = useQuery<OverviewResponse>({
    queryKey: ["nexus-store-overview", store, rep, client],
    queryFn: async () => {
      const res = await fetch(`/api/roster/store-overview?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS || "&client=ALL"}`);
      if (!res.ok) throw new Error("Failed to fetch store overview");
      return res.json();
    },
    enabled: !!store,
  });

  const supplyPath = `/store-detail/supply?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`;
  const onBack = () => setLocation(supplyPath, { replace: true });
  const goToSku = (barcode: string) => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    setLocation(`/store-detail/sku?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=low&barcode=${encodeURIComponent(barcode)}${clientQS}&returnTo=${encodeURIComponent(returnTo)}`);
  };

  if (isLoading) return <Sf2LoadingState />;
  if (error || !data) return <div className="stockfix2-page"><p className="error-state">Couldn't load this data right now.</p></div>;

  // Fixed 2026-08-17 (Carin: "some of these skus shouldnt be here because
  // the dc is zero, how can we suggest an order") - a DC-constrained SKU
  // isn't a "recommended order," there's nothing to order. These belong in
  // Supply Constraints (escalate to supply chain) instead, not this list.
  const rows = data.rows
    .filter((r) => (r.suggestedOrderUnits || 0) > 0 && ((r.dcSoh || 0) > 0 || (r.dcFulfillableUnits || 0) > 0))
    .sort((a, b) => (b.suggestedOrderUnits || 0) - (a.suggestedOrderUnits || 0));
  const totalUnits = rows.reduce((s, r) => s + (r.suggestedOrderUnits || 0), 0);
  const dcSupported = rows.length;

  return (
    <div className="stockfix2-page">
      <header className="sf2-topbar">
        <div className="sf2-topbar-left">
          <button className="icon-btn" onClick={onBack}><ArrowLeft size={20} /></button>
          <BrandLogo size={20} />
        </div>
        <div className="sf2-topbar-right">
          <span className="sf2-sync"><span className="sf2-sync-dot" />Synced</span>
        </div>
      </header>

      <main className="sf2-content">
        <section className="sf2-storecard">
          <div className="sf2-storeicon"><StoreIcon size={18} /></div>
          <div className="sf2-storeinfo">
            <div className="sf2-storename">{store.toUpperCase()}</div>
            <div className="sf2-storemeta">{overview?.siteCode || "—"} · {overview?.banner || ""} · visiting now</div>
          </div>
        </section>

        <section className="sf2-filters">
          <div className="sf2-filter"><span>Client</span><strong>{data.resolvedClient}</strong></div>
          <div className="sf2-filter"><span>SKU</span><strong>All SKUs</strong></div>
        </section>

        <h1 className="sf2-listtitle">Replenishment Opportunity</h1>
        <p className="sf2-subtitle">Suggested orders from current SOH, sell-out and a 4-week cover target.</p>

        <section className="sf2-statrow">
          <div className="sf2-stat tone-orange"><div className="sf2-stat-n">{totalUnits}</div><div className="sf2-stat-l">Recommended units</div></div>
          <div className="sf2-stat tone-red"><div className="sf2-stat-n">{rows.length}</div><div className="sf2-stat-l">SKUs</div></div>
          <div className="sf2-stat tone-cyan"><div className="sf2-stat-n">{dcSupported}</div><div className="sf2-stat-l">DC supported</div></div>
        </section>

        <section className="sf2-list">
          {rows.map((r) => (
            <button className="sf2-listrow tone-orange" key={r.barcode} onClick={() => goToSku(r.barcode)}>
              <div>
                <div className="sf2-listrow-title">{r.articleDescription}</div>
                <div className="sf2-listrow-meta">
                  SOH {r.storeSoh} · {((r.sellOutP4 || 0) / 4).toFixed(1)}/wk · DC {r.dcSoh ?? "—"}
                </div>
              </div>
              <div className="sf2-listrow-status ok">+{r.suggestedOrderUnits}</div>
            </button>
          ))}
          {rows.length === 0 && <p className="empty-state">No replenishment opportunities at this store.</p>}
        </section>
      </main>
    </div>
  );
}
