import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import Sf2LoadingState from "@/components/sf2-loading-state";
import "./StoreOverview.css";

interface OverviewResponse {
  storeName: string;
  resolvedClient: string;
  oosCount: number;
  lowStockCount: number;
  trend: Array<{ weekEnding: string; oosCount: number; lowStockCount: number; atRiskCount: number }>;
  salesTrend: Array<{ weekEnding: string; salesP4: number }>;
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

function weekLabel(weekEnding: string, index: number, total: number): string {
  const weeksAgo = total - 1 - index;
  if (weeksAgo === 0) return "This week";
  return `${weeksAgo}w ago`;
}

export default function StoreTrendDetail() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const type = params.get("type") === "sales" ? "sales" : "soh";

  const { data, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ["nexus-store-overview", store, rep],
    queryFn: async () => {
      const res = await fetch(`/api/roster/store-overview?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}`);
      if (!res.ok) throw new Error("Failed to fetch store overview");
      return res.json();
    },
    enabled: !!store,
  });

  const onBack = () => window.history.back();

  if (isLoading) {
    return <Sf2LoadingState />;
  }

  if (error || !data) {
    return (
      <div className="store-overview-page">
        <p className="error-state">Couldn't load trend data right now.</p>
      </div>
    );
  }

  const weeks = type === "soh" ? data.trend : data.salesTrend;
  const points = type === "soh"
    ? buildPoints(data.trend.map((t) => t.oosCount + t.lowStockCount))
    : buildPoints(data.salesTrend.map((t) => t.salesP4));

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
          <h1>{type === "soh" ? "Stock Health Trend Detail" : "Sell Out Trend Detail"}</h1>
          <p>{data.storeName.toUpperCase()} · {data.resolvedClient} · Past {weeks.length} weeks</p>
        </div>

        {weeks.length > 1 ? (
          <section className="store-card chartcard" style={{ padding: 16 }}>
            <svg viewBox="0 0 520 210" className="trend-svg" style={{ height: 220 }}>
              <line x1="20" y1="15" x2="20" y2="190" className="grid-line" />
              <line x1="260" y1="15" x2="260" y2="190" className="grid-line" />
              <line x1="500" y1="15" x2="500" y2="190" className="grid-line" />
              <polyline points={points} className={`series ${type === "soh" ? "series-red" : "series-blue"}`} />
              <text x="20" y="205" className="axis-label">
                {weekLabel(weeks[0].weekEnding, 0, weeks.length)}
              </text>
              <text x="500" y="205" textAnchor="end" className="axis-label">This week</text>
            </svg>
          </section>
        ) : (
          <p className="loading-state">Building history — check back once more weeks have synced.</p>
        )}

        <section className="store-card list" style={{ marginTop: 12 }}>
          {weeks.slice().reverse().map((w, i) => (
            <div className="row" key={w.weekEnding}>
              <div>
                <div className="rowtitle">{weekLabel(w.weekEnding, weeks.length - 1 - i, weeks.length)}</div>
                <div className="rowmeta">{w.weekEnding}</div>
              </div>
              <div className="rowright">
                <div className="ordervalue">
                  {type === "soh"
                    ? `${(w as any).oosCount + (w as any).lowStockCount} issues`
                    : `${(w as any).salesP4} units`}
                </div>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
