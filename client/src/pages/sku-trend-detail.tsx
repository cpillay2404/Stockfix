import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import "./StoreOverview.css";

interface SkuHistoryResponse {
  resolvedClient: string;
  points: Array<{ weekEnding: string; storeSoh: number | null; sellOutP4: number | null; cover: number | null }>;
}

function buildPoints(values: number[], xStart = 20, xEnd = 500, yTop = 15, yBottom = 190): string {
  if (values.length === 0) return "";
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const step = values.length > 1 ? (xEnd - xStart) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = xStart + step * i;
      const y = yBottom - ((v - min) / range) * (yBottom - yTop);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function SkuTrendDetail() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const barcode = params.get("barcode") || "";
  const classification = params.get("classification") || "oos";
  const type = params.get("type") === "sales" ? "sales" : "soh";
  const name = params.get("name") || "";

  const { data, isLoading, error } = useQuery<SkuHistoryResponse>({
    queryKey: ["nexus-sku-history", store, rep, barcode],
    queryFn: async () => {
      const res = await fetch(
        `/api/roster/sku-history?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&barcode=${encodeURIComponent(barcode)}`
      );
      if (!res.ok) throw new Error("Failed to fetch SKU history");
      return res.json();
    },
    enabled: !!store && !!barcode,
  });

  const onBack = () => window.history.back();

  if (isLoading) {
    return (
      <div className="store-overview-page">
        <p className="loading-state">Loading real 13-week history — this SKU requires one live call per week, so it's slower than other pages.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="store-overview-page">
        <p className="error-state">Couldn't load this SKU's history right now.</p>
      </div>
    );
  }

  const values = data.points.map((p) => (type === "soh" ? p.storeSoh ?? 0 : p.sellOutP4 ?? 0));
  const points = buildPoints(values);

  return (
    <div className="store-overview-page">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack}><ArrowLeft size={24} /></button>
        <div className="brand">
          <BrandLogo size={20} />
        </div>
        <div className="sync-state">
          <span className="sync-dot" />
          <span>Synced</span>
        </div>
      </header>

      <main className="page-content">
        <div className="detailhead">
          <h1>{name || barcode}</h1>
          <p>{type === "soh" ? "Store SOH Trend" : "Sell Out Trend"} · {data.points.length} of last 13 real weeks found</p>
        </div>

        {data.points.length > 1 ? (
          <section className="store-card chartcard" style={{ padding: 16 }}>
            <svg viewBox="0 0 520 210" className="trend-svg" style={{ height: 220 }}>
              <line x1="20" y1="15" x2="20" y2="190" className="grid-line" />
              <line x1="260" y1="15" x2="260" y2="190" className="grid-line" />
              <line x1="500" y1="15" x2="500" y2="190" className="grid-line" />
              <polyline points={points} className={`series ${type === "soh" ? "series-red" : "series-blue"}`} />
              <text x="20" y="205" className="axis-label">{data.points[0].weekEnding}</text>
              <text x="500" y="205" textAnchor="end" className="axis-label">{data.points[data.points.length - 1].weekEnding}</text>
            </svg>
          </section>
        ) : (
          <p className="empty-state">This SKU doesn't have enough real history at this store yet.</p>
        )}

        <section className="store-card list" style={{ marginTop: 12 }}>
          {data.points.slice().reverse().map((p) => (
            <div className="row" key={p.weekEnding}>
              <div>
                <div className="rowtitle">{p.weekEnding}</div>
                <div className="rowmeta">
                  Store SOH {p.storeSoh ?? "—"} · Sell Out P4W {p.sellOutP4 ?? "—"}
                  {p.cover !== null && ` · WFC ${p.cover.toFixed(1)}`}
                </div>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
