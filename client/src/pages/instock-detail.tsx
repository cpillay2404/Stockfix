import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import Sf2LoadingState from "@/components/sf2-loading-state";
import "./StoreOverview.css";

interface OverviewResponse {
  storeName: string;
  resolvedClient: string;
  totalSkus: number;
  oosCount: number;
  lowStockCount: number;
  overstockCount: number;
  optimalCount: number;
  atRiskCount: number;
  distributionGapsCount: number;
  inStockPct: number;
}

export default function InStockDetail() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";

  const { data, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ["nexus-store-overview", store, rep, client],
    queryFn: async () => {
      const res = await fetch(`/api/roster/store-overview?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`);
      if (!res.ok) throw new Error("Failed to fetch store overview");
      return res.json();
    },
    enabled: !!store,
  });

  const onBack = () => setLocation(
    `/store-detail?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`,
    { replace: true }
  );
  const goToList = (classification: string) =>
    setLocation(`/store-detail/list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}${clientQS}`);

  if (isLoading) {
    return <Sf2LoadingState />;
  }
  if (error || !data) {
    return <div className="store-overview-page"><p className="error-state">Couldn't load this data right now.</p></div>;
  }

  return (
    <div className="store-overview-page">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack}><ArrowLeft size={24} /></button>
        <div className="brand"><BrandLogo size={20} /></div>
        <div className="sync-state"><span className="sync-dot" /><span>Synced</span></div>
      </header>

      <main className="page-content">
        <div className="detailhead">
          <h1>Assortment / Availability</h1>
          <p>{data.storeName.toUpperCase()} · {data.resolvedClient}</p>
        </div>

        <section className="summary">
          <div className="store-card stat"><div className="n">{data.totalSkus}</div><div className="l">Ranged SKUs</div></div>
          <div className="store-card stat"><div className="n">{Math.round(data.inStockPct)}%</div><div className="l">In Stock</div></div>
          <div className="store-card stat"><div className="n">{data.optimalCount}</div><div className="l">Optimal</div></div>
        </section>

        <section className="store-card list">
          <button className="row" onClick={() => goToList("oos")}>
            <div><div className="rowtitle">Out of Stock</div><div className="rowmeta">Ranged SKUs with zero stock</div></div>
            <div className="rowright"><div className="ordervalue">{data.oosCount}</div></div>
          </button>
          <button className="row" onClick={() => goToList("low")}>
            <div><div className="rowtitle">Low Stock</div><div className="rowmeta">In stock, below cover threshold</div></div>
            <div className="rowright"><div className="ordervalue">{data.lowStockCount}</div></div>
          </button>
          <button className="row" onClick={() => goToList("risk")}>
            <div><div className="rowtitle">At Risk</div><div className="rowmeta">In stock, projected to run out soon</div></div>
            <div className="rowright"><div className="ordervalue">{data.atRiskCount}</div></div>
          </button>
          <button className="row" onClick={() => goToList("distribution")}>
            <div><div className="rowtitle">Distribution Gaps</div><div className="rowmeta">Ranging opportunities</div></div>
            <div className="rowright"><div className="ordervalue">{data.distributionGapsCount}</div></div>
          </button>
          <button className="row" onClick={() => goToList("overstock")}>
            <div><div className="rowtitle">Overstock</div><div className="rowmeta">Excess cover</div></div>
            <div className="rowright"><div className="ordervalue">{data.overstockCount}</div></div>
          </button>
        </section>
      </main>
    </div>
  );
}
