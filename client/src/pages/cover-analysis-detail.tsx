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
  cover: number | null;
}
interface SkuListResponse {
  resolvedClient: string;
  rows: SkuRow[];
}

// Bands match Nexus's own real classification thresholds confirmed in
// aggregate_duckdb.py (wfc<1 Critical, <2 Low, 2-6 Optimal, >6 Overstock) -
// not invented cutoffs.
function band(cover: number): string {
  if (cover < 1) return "Below 1 week";
  if (cover < 2) return "1-2 weeks";
  if (cover <= 6) return "Healthy";
  return "Overstock";
}

export default function CoverAnalysisDetail() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";

  const { data, isLoading, error } = useQuery<SkuListResponse>({
    queryKey: ["nexus-sku-list", store, rep, "cover", client],
    queryFn: async () => {
      const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=cover${clientQS}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!store,
  });

  const onBack = () => window.history.back();
  const goToSku = (barcode: string) =>
    setLocation(`/store-detail/sku?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=risk&barcode=${encodeURIComponent(barcode)}${clientQS}`);

  if (isLoading) return <Sf2LoadingState />;
  if (error || !data) return <div className="stockfix2-page"><p className="error-state">Couldn't load this data right now.</p></div>;

  const rows = data.rows.filter((r) => r.cover !== null);
  const avgCover = rows.length > 0 ? rows.reduce((s, r) => s + (r.cover || 0), 0) / rows.length : 0;
  const bandCounts = {
    "Below 1 week": rows.filter((r) => band(r.cover!) === "Below 1 week").length,
    "1-2 weeks": rows.filter((r) => band(r.cover!) === "1-2 weeks").length,
    "Healthy": rows.filter((r) => band(r.cover!) === "Healthy").length,
    "Overstock": rows.filter((r) => band(r.cover!) === "Overstock").length,
  };

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
            <div className="sf2-storemeta">visiting now</div>
          </div>
        </section>

        <h1 className="sf2-listtitle">Cover Analysis</h1>
        <p className="sf2-subtitle">{data.resolvedClient} · {rows.length} in-stock SKUs</p>

        <section className="sf2-statrow">
          <div className="sf2-stat tone-purple"><div className="sf2-stat-n">{avgCover.toFixed(1)}</div><div className="sf2-stat-l">Avg WFC</div></div>
          <div className="sf2-stat tone-red"><div className="sf2-stat-n">{bandCounts["Below 1 week"]}</div><div className="sf2-stat-l">Below 1 week</div></div>
          <div className="sf2-stat tone-orange"><div className="sf2-stat-n">{bandCounts["Overstock"]}</div><div className="sf2-stat-l">Overstock</div></div>
        </section>

        <div className="sf2-sectionhead"><span>BY COVER BAND</span></div>
        <section className="sf2-list">
          {Object.entries(bandCounts).map(([label, count]) => (
            <div className="sf2-listrow tone-purple sf2-listrow-static" key={label}>
              <div className="sf2-listrow-title">{label}</div>
              <div className="sf2-listrow-status ok">{count}</div>
            </div>
          ))}
        </section>

        <div className="sf2-sectionhead"><span>LOWEST COVER SKUS</span></div>
        <section className="sf2-list">
          {rows.slice(0, 20).map((r) => (
            <button className="sf2-listrow tone-amber" key={r.barcode} onClick={() => goToSku(r.barcode)}>
              <div>
                <div className="sf2-listrow-title">{r.articleDescription}</div>
                <div className="sf2-listrow-meta">{r.barcode} · SOH {r.storeSoh} · WFC {r.cover!.toFixed(1)}</div>
              </div>
            </button>
          ))}
          {rows.length === 0 && <p className="empty-state">No in-stock SKUs with cover data.</p>}
        </section>
      </main>
    </div>
  );
}
