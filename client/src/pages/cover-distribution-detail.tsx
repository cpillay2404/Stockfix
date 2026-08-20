import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import Sf2LoadingState from "@/components/sf2-loading-state";
import "./StoreOverview.css";

interface SkuRow {
  cover: number | null;
}
interface SkuListResponse {
  resolvedClient: string;
  rows: SkuRow[];
}

const BANDS = [
  { label: "<1 week", test: (c: number) => c < 1 },
  { label: "1-2 weeks", test: (c: number) => c >= 1 && c < 2 },
  { label: "2-3 weeks", test: (c: number) => c >= 2 && c < 3 },
  { label: "3+ weeks", test: (c: number) => c >= 3 },
];

export default function CoverDistributionDetail() {
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

  const onBack = () => setLocation(
    `/store-detail/analysis?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`,
    { replace: true }
  );

  if (isLoading) return <Sf2LoadingState />;
  if (error || !data) return <div className="store-overview-page"><p className="error-state">Couldn't load this data right now.</p></div>;

  const rows = data.rows.filter((r) => r.cover !== null).map((r) => r.cover as number);
  const avgCover = rows.length > 0 ? rows.reduce((s, c) => s + c, 0) / rows.length : 0;
  const bandCounts = BANDS.map((b) => rows.filter((c) => b.test(c)).length);
  const maxCount = Math.max(1, ...bandCounts);
  const below1 = bandCounts[0];
  const oneToTwo = bandCounts[1];

  return (
    <div className="store-overview-page">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack}><ArrowLeft size={24} /></button>
        <div className="brand"><BrandLogo size={20} /></div>
        <div className="sync-state"><span className="sync-dot" /><span>Synced</span></div>
      </header>

      <main className="page-content">
        <div className="detailhead">
          <h1>Cover Distribution</h1>
          <p>{data.resolvedClient} · Weeks-of-cover distribution across in-stock SKUs</p>
        </div>

        <section className="summary">
          <div className="store-card stat"><div className="n">{avgCover.toFixed(1)}</div><div className="l">Avg WFC</div></div>
          <div className="store-card stat"><div className="n">{below1}</div><div className="l">Below 1 Week</div></div>
          <div className="store-card stat"><div className="n">{oneToTwo}</div><div className="l">1-2 Weeks</div></div>
        </section>

        <section className="store-card list">
          {BANDS.map((b, i) => (
            <div className="row" key={b.label} style={{ gridTemplateColumns: "70px 1fr 30px", alignItems: "center" }}>
              <div className="rowmeta">{b.label}</div>
              <div style={{ height: 6, background: "#0D2946", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(bandCounts[i] / maxCount) * 100}%`, background: "var(--blue)" }} />
              </div>
              <div className="ordervalue" style={{ textAlign: "right" }}>{bandCounts[i]}</div>
            </div>
          ))}
          {rows.length === 0 && <p className="empty-state">No in-stock SKUs with cover data.</p>}
        </section>
      </main>
    </div>
  );
}
