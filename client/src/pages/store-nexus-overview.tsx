import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronDown, ChevronRight, ArrowLeft, Store as StoreIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import Sf2BottomNav from "@/components/sf2-bottom-nav";
import Sf2SkuInlineCard from "@/components/sf2-sku-inline-card";
import Sf2LoadingState from "@/components/sf2-loading-state";
import "./StoreOverview.css";

interface OverviewResponse {
  storeName: string;
  resolvedClient: string;
  siteCode: string;
  banner: string;
  totalSkus: number;
  oosCount: number;
  lowStockCount: number;
  overstockCount: number;
  atRiskCount: number;
  distributionGapsCount: number;
  inStockPct: number;
  missedUnits: number;
  dcAvailabilityPct: number;
  avgWeeksOfCover: number;
  suggestedOrderSkuCount: number;
  suggestedOrderUnitsTotal: number;
  suggestedOrderDcSupportedCount: number;
  salesAtRiskSkuCount: number;
  negSOHCount: number;
  trend: Array<{ weekEnding: string; oosCount: number; lowStockCount: number; atRiskCount: number; storeSoh: number }>;
  salesTrend: Array<{ weekEnding: string; salesP4: number }>;
  deltas: Record<string, number> | null;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// Real week-on-week / month-on-month % change from the actual synced
// weeks - "vs LY" is deliberately not offered anywhere, since neither
// Nexus nor our own sync retains more than 13 real weeks of history, so
// a year-ago comparison would have to be fabricated.
function pctChange(values: number[], weeksBack: number): number | null {
  if (values.length <= weeksBack) return null;
  const latest = values[values.length - 1];
  const prior = values[values.length - 1 - weeksBack];
  if (!prior) return null;
  return ((latest - prior) / prior) * 100;
}

const PctBadge = ({ label, value }: { label: string; value: number | null }) => {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span className={`sf2-pctbadge ${up ? "up" : "down"}`}>
      {label} {up ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
};

// A real "so what" sentence - the WoW/MoM badges already say the week-over-
// week direction, so repeating that in words was pure duplication (flagged
// 2026-08-13). This instead places the current week against the full
// observed window (high/low/average) - genuinely different real information,
// computed straight from the same trend array, nothing invented.
function trendTakeaway(noun: string, values: number[], weekCount: number): string {
  if (values.length < 3) return `Not enough weekly history yet to put ${noun.toLowerCase()} in context.`;
  const latest = values[values.length - 1];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  if (latest === max) return `${noun} is at its highest point in the last ${weekCount} weeks.`;
  if (latest === min) return `${noun} is at its lowest point in the last ${weekCount} weeks.`;
  const vsAvg = latest - avg;
  const dir = vsAvg >= 0 ? "above" : "below";
  const pct = avg > 0 ? Math.abs((vsAvg / avg) * 100) : 0;
  return `${noun} is ${pct.toFixed(0)}% ${dir} its ${weekCount}-week average of ${Math.round(avg)}.`;
}

// Real weekly bar chart - a small number of discrete weekly points reads far
// clearer as labeled bars than as a bare unlabeled line (the "squiggly lines
// that don't say anything" complaint). Baseline gridline + direct value
// labels on the first and current bar only (not every bar, per dataviz
// convention), current bar gets the accent color so the eye lands on "now."
export function BarTrend({ weeks, values, color, fmt }: { weeks: string[]; values: number[]; color: "blue" | "green"; fmt: (v: number) => string }) {
  if (values.length === 0) return null;
  const W = 350, H = 100, padTop = 22, padBottom = 22, gap = 4;
  const barW = (W - gap * (values.length - 1)) / values.length;
  const max = Math.max(1, ...values);
  const scale = (v: number) => (v / max) * (H - padTop - padBottom);
  const baseline = H - padBottom;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sf2-bartrend-svg">
      <line x1={0} y1={baseline} x2={W} y2={baseline} className="sf2-bartrend-base" />
      {values.map((v, i) => {
        const h = scale(v);
        const x = i * (barW + gap);
        const y = baseline - h;
        const isLast = i === values.length - 1;
        const isFirst = i === 0;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={Math.max(h, 2)} rx={3} className={`sf2-bar-${color} ${isLast ? "current" : ""}`} />
            {(isLast || isFirst) && (
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="sf2-bar-label">{fmt(v)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// invertDeltaColor: for problem-count tiles (Out of Stock, Low Stock, At
// Risk, Overstock, Negative SOH, Distribution Gaps) a rise vs last week is
// BAD and a drop is GOOD - the opposite of the default "up=green" assumption
// that only fits genuinely positive metrics. Fixed 2026-08-17 (Carin: "out
// of stocks that grew vs last week is bad... low stocks that came down vs
// last week is good" etc.) - every one of these six tiles needs this flag.
const KPI = ({ label, value, unit, tone, delta, deltaUnit, invertDeltaColor, onClick }: any) => {
  const isGood = delta == null ? null : invertDeltaColor ? delta < 0 : delta > 0;
  const deltaClass = delta == null || delta === 0 ? "flat" : isGood ? "up" : "down";
  return (
    <button className={`kpi2-card tone-${tone}`} onClick={onClick}>
      {delta != null && (
        <span className={`kpi2-delta ${deltaClass}`}>
          {delta > 0 ? "+" : ""}{delta}{deltaUnit || ""}
          <small>vs LW</small>
        </span>
      )}
      <div className="kpi2-value">{value}{unit && <span className="kpi2-unit">{unit}</span>}</div>
      <div className="kpi2-label">{label}</div>
      <ChevronRight size={14} className="kpi2-chevron" />
    </button>
  );
};

interface SkuOption {
  barcode: string;
  articleDescription: string;
  classification: string;
  client?: string;
  storeSoh: number;
  sellOutP4: number | null;
}

export default function StoreOverview() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const role = params.get("role") || "Rep";
  const [clientOverride, setClientOverride] = useState("");
  // Picking a SKU stays on this screen and shows its numbers inline instead
  // of navigating away (Carin, 2026-08-13: "stay on the insights screen and
  // only change the numbers based on the selection").
  const [selectedSku, setSelectedSku] = useState<{ barcode: string; client?: string } | null>(null);

  const { data: clientOptions } = useQuery<{ clients: string[] }>({
    queryKey: ["clients-for-store", store, rep],
    queryFn: async () => {
      const res = await fetch(`/api/roster/clients-for-store?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}`);
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
    enabled: !!store,
  });

  // Default is "ALL" - a real combined view across every client at this
  // store, not an arbitrary "loudest" pick (Carin, 2026-08-13: "it must say
  // all and then the filter must drop down to the client"). Only a real,
  // explicitly-picked client is ever a filterable single-client value.
  const { data, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ["nexus-store-overview", store, rep, clientOverride],
    queryFn: async () => {
      const res = await fetch(`/api/roster/store-overview?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&client=${encodeURIComponent(clientOverride || "ALL")}`);
      if (!res.ok) throw new Error("Failed to fetch store overview");
      return res.json();
    },
    enabled: !!store,
  });

  // "All Clients" now has a real merged SKU list (every real client's rows,
  // concatenated and tagged with which client each one belongs to - not a
  // fabricated blend), so the SKU dropdown works in both modes. A specific
  // client picked from the dropdown filters to just that client's rows;
  // "ALL" (the default) shows every client's SKUs together.
  const activeClient = clientOverride || "ALL";

  const { data: skuOptions } = useQuery<{ rows: SkuOption[] }>({
    queryKey: ["nexus-sku-list", store, rep, "cover", activeClient],
    queryFn: async () => {
      const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=cover&client=${encodeURIComponent(activeClient)}`);
      if (!res.ok) throw new Error("Failed to fetch SKU list");
      return res.json();
    },
    enabled: !!store,
  });

  // Threaded through to every drill-in link below so a syndicated rep's
  // client choice survives navigation instead of each child page silently
  // re-resolving its own (real bug found 2026-08-13: overview showed 11 OOS
  // for one client, drilling in showed 0 for another).
  const clientQS = activeClient ? `&client=${encodeURIComponent(activeClient)}` : "";

  // Real "biggest current contributor" to the store-level SOH/Sales
  // totals - reuses the SKU dropdown's already-fetched per-SKU data, no
  // extra call needed. This is the current week's largest single
  // contributor by volume, not necessarily what caused the week-over-week
  // swing (that would need per-SKU history across weeks, which isn't
  // synced anywhere - flagged to Carin 2026-08-13, this is the "quick
  // version" she asked for instead).
  const skuRows = skuOptions?.rows || [];
  const topSohSku = skuRows.length > 0 ? [...skuRows].sort((a, b) => b.storeSoh - a.storeSoh)[0] : null;
  const topSalesSku = skuRows.length > 0 ? [...skuRows].sort((a, b) => (b.sellOutP4 || 0) - (a.sellOutP4 || 0))[0] : null;

  // Picking a SKU stays on Insights and shows its numbers inline instead of
  // navigating to a separate page (Carin, 2026-08-13). A single SKU always
  // belongs to one real client even in "All Clients" mode, so the row's own
  // tagged client wins over the page-level "ALL" state.
  const goToSku = (barcode: string, skuClient?: string) => {
    setSelectedSku({ barcode, client: skuClient || (activeClient !== "ALL" ? activeClient : undefined) });
  };

  const goToList = (classification: string) =>
    setLocation(`/store-detail/list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}${clientQS}`);
  const goToTrend = (type: "soh" | "sales") =>
    setLocation(`/store-detail/trend?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&type=${type}${clientQS}`);

  if (isLoading) {
    return <Sf2LoadingState />;
  }
  if (error || !data) {
    return <div className="stockfix2-page"><p className="error-state">Couldn't load live data for this store right now. Task capture still works normally.</p></div>;
  }

  const latestSoh = data.trend.length > 0 ? data.trend[data.trend.length - 1].storeSoh : null;
  const latestSales = data.salesTrend.length > 0 ? data.salesTrend[data.salesTrend.length - 1].salesP4 : null;
  const sohWoW = pctChange(data.trend.map((t) => t.storeSoh), 1);
  const sohMoM = pctChange(data.trend.map((t) => t.storeSoh), 4);
  const salesWoW = pctChange(data.salesTrend.map((t) => t.salesP4), 1);
  const salesMoM = pctChange(data.salesTrend.map((t) => t.salesP4), 4);
  const weekRangeLabel = data.trend.length > 0
    ? `${data.trend.length} WKS TO ${shortDate(data.trend[data.trend.length - 1].weekEnding).toUpperCase()}`
    : "";
  const dateLabels = data.trend.length > 0
    ? [data.trend[0], data.trend[Math.floor((data.trend.length - 1) / 2)], data.trend[data.trend.length - 1]]
    : [];

  return (
    <div className="stockfix2-page">
      <header className="sf2-topbar">
        <div className="sf2-topbar-left">
          {/* Added 2026-08-16 - this is the top-level entry screen for a
              store, but had no way out at all once a SKU was selected
              inline (Carin: "now i cant get out of here, no back button").
              Goes back to store selection, the screen before this one. */}
          <button className="icon-btn" onClick={() => setLocation(`/select-rep?role=${encodeURIComponent(role)}`)}><ArrowLeft size={20} /></button>
          <BrandLogo size={20} />
        </div>
        <div className="sf2-topbar-right">
          <span className="sf2-sync"><span className="sf2-sync-dot" />Synced</span>
          <Bell size={18} />
        </div>
      </header>

      <main className="sf2-content">
        <div className="sf2-greeting">{greeting()}, {rep || role}</div>

        <section className="sf2-storecard">
          <div className="sf2-storeicon"><StoreIcon size={18} /></div>
          <div className="sf2-storeinfo">
            <div className="sf2-storename">{store.toUpperCase()}</div>
            <div className="sf2-storemeta">{data.siteCode} · {data.banner} · visiting now</div>
          </div>
        </section>

        <section className="sf2-filters">
          {(clientOptions?.clients?.length ?? 0) > 1 ? (
            <div className="sf2-filter sf2-filter-select">
              <span>Client</span>
              <select
                value={clientOverride}
                onChange={(e) => setClientOverride(e.target.value)}
              >
                <option value="">All Clients</option>
                {clientOptions!.clients.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="sf2-filter">
              <span>Client</span>
              <strong>{data.resolvedClient}</strong>
            </div>
          )}
          <div className="sf2-filter sf2-filter-select">
            <span>SKU</span>
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const [barcode, skuClient] = e.target.value.split("::");
                goToSku(barcode, skuClient || undefined);
                e.target.value = "";
              }}
            >
              <option value="">All SKUs</option>
              {(skuOptions?.rows || []).map((r) => (
                <option key={`${r.client || ""}-${r.barcode}`} value={`${r.barcode}::${r.client || ""}`}>
                  {r.articleDescription}{activeClient === "ALL" && r.client ? ` (${r.client})` : ""}
                </option>
              ))}
            </select>
          </div>
        </section>

        {selectedSku ? (
          <Sf2SkuInlineCard
            store={store}
            rep={rep}
            barcode={selectedSku.barcode}
            client={selectedSku.client}
            onClear={() => setSelectedSku(null)}
          />
        ) : (
        <>
        {/* Redesign 2026-08-13 (Carin's mockup): the primary grid drops to
            the 6 "needs attention" counts; In Stock gets promoted to its
            own wide summary banner below. DC availability / Avg weeks of
            cover / Sales at risk aren't in the mockup, but per Carin's
            explicit instruction not to remove anything already built, they
            move to a smaller secondary row rather than disappearing -
            still real data, still clickable, still carrying their vs LW
            deltas, just visually deprioritized. Negative SOH moves from a
            conditional banner into a proper always-visible tile (real
            count, 0 included) matching the mockup, replacing the old
            banner rather than duplicating it. */}
        <section className="kpi2-grid kpi2-grid-primary">
          <KPI label="Out of stock" value={data.oosCount} tone="red" delta={data.deltas?.oosCount} invertDeltaColor onClick={() => goToList("oos")} />
          <KPI label="Low stock" value={data.lowStockCount} tone="orange" delta={data.deltas?.lowStockCount} invertDeltaColor onClick={() => goToList("low")} />
          <KPI label="At risk" value={data.atRiskCount} tone="amber" delta={data.deltas?.atRiskCount} invertDeltaColor onClick={() => goToList("risk")} />
          <KPI label="Overstock" value={data.overstockCount} tone="purple" delta={data.deltas?.overstockCount} invertDeltaColor onClick={() => goToList("overstock")} />
          <KPI label="Negative SOH" value={data.negSOHCount} tone="red" delta={data.deltas?.negSOHCount} invertDeltaColor onClick={() => goToList("negsoh")} />
          <KPI label="Distribution gaps" value={data.distributionGapsCount} tone="blue" delta={data.deltas?.distributionGapsCount} invertDeltaColor onClick={() => goToList("distribution")} />
        </section>

        <button
          className="sf2-instock-banner"
          onClick={() => setLocation(`/store-detail/instock?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`)}
        >
          <div className="sf2-instock-copy">
            <div className="sf2-instock-title">In stock</div>
            <div className="sf2-instock-value">{Math.round(data.inStockPct)}%</div>
            <div className="sf2-instock-sub">Availability across ranged SKUs</div>
          </div>
          {data.deltas?.inStockPct != null && data.deltas.inStockPct !== 0 && (
            <span className={`sf2-instock-delta ${data.deltas.inStockPct > 0 ? "up" : "down"}`}>
              {data.deltas.inStockPct > 0 ? "+" : ""}{data.deltas.inStockPct}% <small>vs LW</small>
            </span>
          )}
        </button>

        {/* DC availability, Replenishment opportunity moved to the Supply
            tab; Avg weeks of cover and Sales at risk moved to the Analysis
            tab (Carin's 2026-08-13 restructure) - Insights stays focused
            on pure store health: the 6 KPI tiles above, In Stock, and
            Store Trends below. */}

        <div className="sf2-sectionhead">
          <span>STORE TRENDS · {weekRangeLabel}</span>
        </div>

        <section className="sf2-trendcard">
          <div className="sf2-trendtop">
            <span>SOH trend</span>
            <div className="sf2-pctrow">
              <PctBadge label="WoW" value={sohWoW} />
              <PctBadge label="MoM" value={sohMoM} />
            </div>
          </div>
          {data.trend.length > 1 ? (
            <>
              <BarTrend
                weeks={data.trend.map((t) => t.weekEnding)}
                values={data.trend.map((t) => t.storeSoh)}
                color="blue"
                fmt={(v) => Math.round(v).toString()}
              />
              <div className="sf2-datelabels">
                {dateLabels.map((t, i) => <span key={i}>{shortDate(t.weekEnding)}</span>)}
              </div>
              <p className="sf2-trend-takeaway">
                {trendTakeaway("Stock on hand", data.trend.map((t) => t.storeSoh), data.trend.length)}
                {topSohSku && <em> Highest contributor: {topSohSku.articleDescription} ({topSohSku.storeSoh} units).</em>}
              </p>
            </>
          ) : <p className="loading-state" style={{ fontSize: 11, padding: "12px 0" }}>Building history...</p>}
        </section>

        <section className="sf2-trendcard">
          <div className="sf2-trendtop">
            <span>Sales trend</span>
            <div className="sf2-pctrow">
              <PctBadge label="WoW" value={salesWoW} />
              <PctBadge label="MoM" value={salesMoM} />
            </div>
          </div>
          {data.salesTrend.length > 1 ? (
            <>
              <BarTrend
                weeks={data.salesTrend.map((t) => t.weekEnding)}
                values={data.salesTrend.map((t) => t.salesP4)}
                color="green"
                fmt={(v) => Math.round(v).toString()}
              />
              <div className="sf2-datelabels">
                {dateLabels.map((t, i) => <span key={i}>{shortDate(t.weekEnding)}</span>)}
              </div>
              <p className="sf2-trend-takeaway">
                {trendTakeaway("Sales", data.salesTrend.map((t) => t.salesP4), data.salesTrend.length)}
                {topSalesSku && <em> Highest contributor: {topSalesSku.articleDescription} ({(topSalesSku.sellOutP4 || 0).toFixed(0)} units).</em>}
              </p>
            </>
          ) : <p className="loading-state" style={{ fontSize: 11, padding: "12px 0" }}>Building history...</p>}
        </section>
        </>
        )}
      </main>

      <Sf2BottomNav active="insights" store={store} rep={rep} clientQS={clientQS} />
    </div>
  );
}
