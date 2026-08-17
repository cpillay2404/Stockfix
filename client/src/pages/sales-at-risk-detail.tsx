import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import Sf2LoadingState from "@/components/sf2-loading-state";
import "./StoreOverview.css";

interface SkuRow {
  barcode: string;
  articleDescription: string;
  estimatedMissedUnits: number;
  classification: string;
}
interface SkuListResponse {
  resolvedClient: string;
  rows: SkuRow[];
}

export default function SalesAtRiskDetail() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";

  const fetchList = (classification: string) => async (): Promise<SkuListResponse> => {
    const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}${clientQS}`);
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  };

  const oosQuery = useQuery({ queryKey: ["nexus-sku-list", store, rep, "oos", client], queryFn: fetchList("oos"), enabled: !!store });
  const lowQuery = useQuery({ queryKey: ["nexus-sku-list", store, rep, "low", client], queryFn: fetchList("low"), enabled: !!store });

  const onBack = () => window.history.back();
  const goToSku = (barcode: string, classification: string) =>
    setLocation(`/store-detail/sku?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}&barcode=${encodeURIComponent(barcode)}${clientQS}`);

  if (oosQuery.isLoading || lowQuery.isLoading) {
    return <Sf2LoadingState />;
  }
  if (oosQuery.error || lowQuery.error || !oosQuery.data || !lowQuery.data) {
    return <div className="store-overview-page"><p className="error-state">Couldn't load this data right now.</p></div>;
  }

  const oosRows = oosQuery.data.rows.map((r) => ({ ...r, source: "oos" as const }));
  const lowRows = lowQuery.data.rows.map((r) => ({ ...r, source: "low" as const }));
  const oosMissed = oosRows.reduce((s, r) => s + (r.estimatedMissedUnits || 0), 0);
  const lowMissed = lowRows.reduce((s, r) => s + (r.estimatedMissedUnits || 0), 0);
  const totalMissed = oosMissed + lowMissed;

  const topContributors = [...oosRows, ...lowRows]
    .filter((r) => (r.estimatedMissedUnits || 0) > 0)
    .sort((a, b) => (b.estimatedMissedUnits || 0) - (a.estimatedMissedUnits || 0))
    .slice(0, 20);

  return (
    <div className="store-overview-page">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack}><ArrowLeft size={24} /></button>
        <div className="brand"><BrandLogo size={20} /></div>
        <div className="sync-state"><span className="sync-dot" /><span>Synced</span></div>
      </header>

      <main className="page-content">
        <div className="detailhead">
          <h1>Sales at Risk</h1>
          <p>{oosQuery.data.resolvedClient} · Estimated missed sales opportunity</p>
        </div>

        <section className="summary">
          <div className="store-card stat"><div className="n">{Math.round(totalMissed)}</div><div className="l">Est. missed units</div></div>
          <div className="store-card stat"><div className="n">{Math.round(oosMissed)}</div><div className="l">From OOS</div></div>
          <div className="store-card stat"><div className="n">{Math.round(lowMissed)}</div><div className="l">From Low Stock</div></div>
        </section>

        <div className="sectionhead"><h2>Top Contributing SKUs</h2></div>
        <section className="store-card list">
          {topContributors.map((r) => (
            <button className="row" key={r.barcode} onClick={() => goToSku(r.barcode, r.source)}>
              <div>
                <div className="rowtitle">{r.articleDescription}</div>
                <div className="rowmeta">{r.classification}</div>
              </div>
              <div className="rowright">
                <div className="ordervalue">{Math.round(r.estimatedMissedUnits)}</div>
                <div className="small">units</div>
              </div>
            </button>
          ))}
          {topContributors.length === 0 && <p className="empty-state">No estimated missed sales at this store.</p>}
        </section>
      </main>
    </div>
  );
}
