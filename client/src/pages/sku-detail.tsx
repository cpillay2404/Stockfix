import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Store as StoreIcon, Wrench } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { BarTrend } from "./store-nexus-overview";
import Sf2LoadingState from "@/components/sf2-loading-state";
import "./StoreOverview.css";

interface SkuRow {
  barcode: string;
  articleDescription: string;
  storeSoh: number;
  dcSoh: number | null;
  sellOutP4: number | null;
  cover: number | null;
  estimatedMissedUnits: number;
  action: string;
  classification: string;
  issueDriver: string | null;
  suggestedOrderUnits: number | null;
  dcFulfillableUnits: number | null;
}
interface SkuListResponse {
  storeName: string;
  resolvedClient: string;
  rows: SkuRow[];
}
interface SkuHistoryResponse {
  resolvedClient: string;
  points: Array<{ weekEnding: string; storeSoh: number | null; sellOutP4: number | null; cover: number | null }>;
}
interface OverviewResponse {
  siteCode: string;
  banner: string;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// Same real WoW comparison as the store-overview trend cards - says in
// words what the sparkline shows, since a bare line "doesn't say anything"
// on its own.
function wowTakeaway(noun: string, values: number[]): string {
  if (values.length < 2) return "";
  const latest = values[values.length - 1];
  const prior = values[values.length - 2];
  if (!prior) return `${noun}: ${latest} this week.`;
  const pct = ((latest - prior) / prior) * 100;
  const dir = pct >= 0 ? "up" : "down";
  return `${noun} ${dir} ${Math.abs(pct).toFixed(0)}% vs last week (${prior} → ${latest}).`;
}

function statusTone(classification: string) {
  if (classification === "Out of Stock") return "red";
  if (classification.toLowerCase().includes("low")) return "orange";
  if (classification.toLowerCase().includes("overstock")) return "purple";
  return "amber";
}

export default function SkuDetail() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const classificationParam = params.get("classification") || "oos";
  const classification = ["oos", "low", "overstock", "risk", "distribution", "negsoh", "cover"].includes(classificationParam) ? classificationParam : "oos";
  const barcode = params.get("barcode") || "";
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";
  // Real bug found 2026-08-20 (Carin: "takes me back to the overstocks
  // screen and then it wants me to capture the task again") - scope=fix
  // (the narrow Fix-scoped list vs Insights' blanket list, only relevant
  // for overstock) was getting dropped on the way through sku-detail and
  // action-capture, so a capture made from Fix's list would land back on
  // the bigger blanket list, where the same SKU can still legitimately
  // appear (different universe) - looking like the capture didn't work.
  const scope = params.get("scope") || "";
  const scopeQS = scope ? `&scope=${encodeURIComponent(scope)}` : "";
  const requestedReturnTo = params.get("returnTo") || "";
  const defaultReturnTo = `/store-detail/list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${encodeURIComponent(classification)}${clientQS}${scopeQS}`;
  const returnTo = requestedReturnTo.startsWith("/store-detail/") ? requestedReturnTo : defaultReturnTo;

  const { data, isLoading, error } = useQuery<SkuListResponse>({
    queryKey: ["nexus-sku-list", store, rep, classification, client, scope],
    queryFn: async () => {
      const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}${clientQS}${scopeQS}`);
      if (!res.ok) throw new Error("Failed to fetch SKU list");
      return res.json();
    },
    enabled: !!store,
  });

  const { data: overview } = useQuery<OverviewResponse>({
    queryKey: ["nexus-store-overview", store, rep, client],
    queryFn: async () => {
      const res = await fetch(`/api/roster/store-overview?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`);
      if (!res.ok) throw new Error("Failed to fetch store overview");
      return res.json();
    },
    enabled: !!store,
  });

  const historyQuery = useQuery<SkuHistoryResponse>({
    queryKey: ["nexus-sku-history", store, rep, barcode, client],
    queryFn: async () => {
      const res = await fetch(`/api/roster/sku-history?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&barcode=${encodeURIComponent(barcode)}${clientQS}`);
      if (!res.ok) throw new Error("Failed to fetch SKU history");
      return res.json();
    },
    enabled: !!store && !!barcode,
  });

  const onBack = () => setLocation(returnTo, { replace: true });
  const goToSkuTrend = (type: "soh" | "sales") => {
    const currentSkuPath = `${window.location.pathname}${window.location.search}`;
    setLocation(
      `/store-detail/sku-trend?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${encodeURIComponent(classification)}&barcode=${encodeURIComponent(barcode)}${clientQS}&type=${type}&name=${encodeURIComponent(row?.articleDescription || barcode)}&returnTo=${encodeURIComponent(currentSkuPath)}`
    );
  };

  const row = data?.rows.find((r) => r.barcode === barcode);

  if (isLoading) {
    return <Sf2LoadingState />;
  }
  if (error || !data || !row) {
    return <div className="stockfix2-page"><p className="error-state">Couldn't find this SKU right now.</p></div>;
  }

  const points = historyQuery.data?.points || [];
  const sohTakeaway = wowTakeaway("SOH", points.map((p) => p.storeSoh ?? 0));
  const salesTakeaway = wowTakeaway("Sales", points.map((p) => p.sellOutP4 ?? 0));
  const tone = statusTone(row.classification);

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

        <section className={`sf2-skusheet tone-${tone}`}>
          <div className="sf2-skusheet-title">{row.articleDescription}</div>
          <div className="sf2-skusheet-pills">
            <span className={`sf2-pill tone-${tone}`}>{row.classification.toUpperCase()}</span>
            <span className="sf2-pill-muted">{data.resolvedClient}</span>
          </div>

          <div className="sf2-skustats">
            <div className={`sf2-skustat tone-${tone}`}><div className="n">{row.storeSoh}</div><div className="l">Store SOH</div></div>
            <div className={`sf2-skustat tone-${tone}`}><div className="n">{row.dcSoh ?? "—"}</div><div className="l">DC SOH</div></div>
            <div className={`sf2-skustat tone-${tone}`}><div className="n">{row.sellOutP4 ?? "—"}</div><div className="l">Sell out P4W</div></div>
            <div className={`sf2-skustat tone-${tone}`}><div className="n">{row.cover !== null ? row.cover.toFixed(1) : "—"}</div><div className="l">WFC</div></div>
          </div>

          {/* Order call-to-action - only shown when the DC actually has
              stock to fulfill it (Carin, 2026-08-16: "they must order from
              DC heres how much" - matches the same DC-availability-wins
              logic already fixed on the list screen, so this never suggests
              an order the DC can't supply). One compact row, not a floating
              label + separate stat card. Placed right below the KPI cards
              (Carin, 2026-08-16: "bring it below the KPI cards"). */}
          {(row.dcSoh || 0) > 0 && !!row.suggestedOrderUnits && (
            <div className="sf2-ordercta">
              <span className="sf2-ordercta-text">DC has stock — order now</span>
              <span className="sf2-ordercta-value">{row.suggestedOrderUnits} <small>units</small></span>
            </div>
          )}

          <section
            className="sf2-trendcard"
            role="button"
            tabIndex={0}
            onClick={() => goToSkuTrend("soh")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                goToSkuTrend("soh");
              }
            }}
          >
            <div className="sf2-trendtop">
              <span>SOH trend</span>
              <strong className="tone-blue">{row.storeSoh}</strong>
            </div>
            {points.length > 1 ? (
              <>
                <BarTrend
                  weeks={points.map((p) => p.weekEnding)}
                  values={points.map((p) => p.storeSoh ?? 0)}
                  color="blue"
                  fmt={(v) => Math.round(v).toString()}
                />
                <div className="sf2-datelabels">
                  <span>{shortDate(points[0].weekEnding)}</span>
                  <span>{shortDate(points[points.length - 1].weekEnding)}</span>
                </div>
                <p className="sf2-trend-takeaway">{sohTakeaway}</p>
              </>
            ) : <p className="loading-state" style={{ fontSize: 11, padding: "12px 0" }}>Building history...</p>}
          </section>

          <section
            className="sf2-trendcard"
            role="button"
            tabIndex={0}
            onClick={() => goToSkuTrend("sales")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                goToSkuTrend("sales");
              }
            }}
          >
            <div className="sf2-trendtop">
              <span>Sales trend</span>
              <strong className="tone-green">{row.sellOutP4 ?? "—"}</strong>
            </div>
            {points.length > 1 ? (
              <>
                <BarTrend
                  weeks={points.map((p) => p.weekEnding)}
                  values={points.map((p) => p.sellOutP4 ?? 0)}
                  color="green"
                  fmt={(v) => Math.round(v).toString()}
                />
                <div className="sf2-datelabels">
                  <span>{shortDate(points[0].weekEnding)}</span>
                  <span>{shortDate(points[points.length - 1].weekEnding)}</span>
                </div>
                <p className="sf2-trend-takeaway">{salesTakeaway}</p>
              </>
            ) : <p className="loading-state" style={{ fontSize: 11, padding: "12px 0" }}>Building history...</p>}
          </section>

          <button
            className="sf2-fixbutton"
            onClick={() => setLocation(`/store-detail/action-capture?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}&barcode=${encodeURIComponent(barcode)}${clientQS}${scopeQS}&returnTo=${encodeURIComponent(returnTo)}`)}
          >
            <Wrench size={16} />
            FIX
          </button>
        </section>
      </main>
    </div>
  );
}
