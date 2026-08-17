import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bell, ArrowLeft, ChevronDown, ChevronRight, Store as StoreIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
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
  suggestedOrderUnits: number | null;
  dcFulfillableUnits?: number | null;
  issueDriver?: string | null;
  client?: string;
}
interface SkuListResponse {
  storeName: string;
  resolvedClient: string;
  rows: SkuRow[];
  missingSkus?: number;
  rangedSkus?: number;
  avgCoveragePct?: number | null;
}
interface OverviewResponse {
  siteCode: string;
  banner: string;
}

// Same 6-week Overstock threshold already confirmed elsewhere in this app
// (cover-analysis-detail.tsx's band function, sourced from
// aggregate_duckdb-CarinPillay.py's own real classification bands) - not
// the unverified "3 weeks" seen in a design mockup, which doesn't match
// any confirmed real threshold in this codebase.
const OVERSTOCK_TARGET_WEEKS = 6;

const TITLES: Record<string, string> = {
  oos: "Out of Stock",
  low: "Low Stock",
  overstock: "Overstock",
  risk: "At Risk",
  distribution: "Distribution Gaps",
  negsoh: "Negative SOH",
  cover: "Cover Analysis",
};

const SUBTITLES: Record<string, string> = {
  oos: "Active ranged SKUs with zero store stock and expected demand.",
  low: "SKUs below the configured cover threshold.",
  risk: "SKUs projected to run out before replenishment.",
  distribution: "Expected ranged SKUs that are currently missing from this store.",
  overstock: `SKUs holding more cover than the maximum of ${OVERSTOCK_TARGET_WEEKS} weeks.`,
  negsoh: "SKUs showing a negative stock count - a data/count discrepancy.",
  cover: "All in-stock SKUs, ordered by weeks of cover.",
};

const TONE: Record<string, string> = {
  oos: "red", low: "orange", risk: "amber", distribution: "blue", overstock: "purple", negsoh: "red", cover: "cyan",
};

export default function StoreSkuList() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const classificationParam = params.get("classification") || "oos";
  const classification = Object.keys(TITLES).includes(classificationParam) ? classificationParam : "oos";
  // Tapping the "SKUs w/ DC" stat filters the list down to just those SKUs -
  // Carin, 2026-08-16: "if you click on the 6 it must take you to the 6 skus".
  const [dcFilterActive, setDcFilterActive] = useState(false);
  // Client the rep picked on the overview page's dropdown - must be carried
  // through every fetch/link here, or a syndicated rep's selection silently
  // reverts to whatever this endpoint would've picked on its own (real bug
  // found 2026-08-13).
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";

  const { data, isLoading, error } = useQuery<SkuListResponse>({
    queryKey: ["nexus-sku-list", store, rep, classification, client],
    queryFn: async () => {
      const res = await fetch(
        `/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}${clientQS}`
      );
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

  const onBack = () => window.history.back();
  // A SKU always belongs to one real client, even when this list is
  // showing "All Clients" merged rows - sku-detail has no merged mode, so
  // the row's own tagged client wins over the page-level "ALL" state.
  const goToSku = (barcode: string, rowClient?: string) => {
    const qs = rowClient ? `&client=${encodeURIComponent(rowClient)}` : clientQS;
    setLocation(
      `/store-detail/sku?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=${classification}&barcode=${encodeURIComponent(barcode)}${qs}`
    );
  };

  if (isLoading) {
    return <Sf2LoadingState />;
  }
  if (error || !data) {
    return <div className="stockfix2-page"><p className="error-state">Couldn't load this list right now.</p></div>;
  }

  const rows = data.rows;
  const dcAvailableCount = rows.filter((r) => (r.dcSoh || 0) > 0).length;
  // Same fix as the per-row badge below: a suggested order is meaningless if
  // the DC has nothing to fulfill it with, so the total only counts units
  // the DC can actually supply, not every theoretical suggestion.
  const suggestedOrderTotal = rows
    .filter((r) => (r.dcSoh || 0) > 0 || (r.dcFulfillableUnits || 0) > 0)
    .reduce((sum, r) => sum + (r.suggestedOrderUnits || 0), 0);
  const tone = TONE[classification] || "red";

  const coverRows = rows.filter((r) => r.cover !== null);
  const avgCover = coverRows.length > 0 ? coverRows.reduce((s, r) => s + (r.cover || 0), 0) / coverRows.length : 0;
  // Real Nexus 4-week sell-out total across at-risk rows, not a count of
  // "estimatedMissedUnits > 0" - fixed 2026-08-16 after confirming Nexus's
  // low_stock_detail simply never sends estimatedMissedUnits at all (that
  // field only exists on OOS rows), so this always showed a misleading "0"
  // even when real at-risk SKUs existed. sellOutP4 is a genuine Nexus field.
  const salesAtRiskTotal = Math.round(rows.reduce((sum, r) => sum + (r.sellOutP4 || 0), 0));
  const avgExcessWfc = coverRows.length > 0
    ? coverRows.reduce((s, r) => s + ((r.cover || 0) - OVERSTOCK_TARGET_WEEKS), 0) / coverRows.length
    : 0;
  const unitsTiedUp = rows.reduce((s, r) => {
    const weeklyRate = (r.sellOutP4 || 0) / 4;
    const targetStock = weeklyRate * OVERSTOCK_TARGET_WEEKS;
    return s + Math.max(0, r.storeSoh - targetStock);
  }, 0);

  return (
    <div className="stockfix2-page">
      <header className="sf2-topbar">
        <div className="sf2-topbar-left">
          <button className="icon-btn" onClick={onBack}><ArrowLeft size={20} /></button>
          <BrandLogo size={20} />
        </div>
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
            <div className="sf2-storemeta">{overview?.siteCode || "—"} · {overview?.banner || ""} · visiting now</div>
          </div>
        </section>

        <section className="sf2-filters">
          <button className="sf2-filter"><span>Client</span><strong>{data.resolvedClient}</strong><ChevronDown size={14} /></button>
          <button className="sf2-filter"><span>SKU</span><strong>All SKUs</strong><ChevronDown size={14} /></button>
        </section>

        <h1 className="sf2-listtitle">{TITLES[classification]}</h1>
        <p className="sf2-subtitle">{SUBTITLES[classification]}</p>

        {classification === "distribution" ? (
          <>
            <section className="sf2-statrow">
              <div className="sf2-stat tone-blue"><div className="sf2-stat-n">{data.missingSkus ?? rows.length}</div><div className="sf2-stat-l">Gaps</div></div>
              <div className="sf2-stat tone-cyan"><div className="sf2-stat-n">{data.rangedSkus ?? "—"}</div><div className="sf2-stat-l">Ranged SKUs</div></div>
              <div className="sf2-stat tone-green"><div className="sf2-stat-n">{data.avgCoveragePct != null ? `${Math.round(data.avgCoveragePct)}%` : "—"}</div><div className="sf2-stat-l">Coverage</div></div>
            </section>

            {/* Information only - a rep/merchandiser can't fix a distribution
                gap in-store (it's a ranging/supply-chain decision), so these
                rows are plain, non-interactive info, not tappable Fix
                candidates (Carin, 2026-08-13). */}
            <section className="sf2-list">
              {rows.map((r) => (
                <div className="sf2-listrow tone-blue sf2-listrow-static" key={`${r.client || ""}-${r.barcode}`}>
                  <div>
                    <div className="sf2-listrow-title">{r.articleDescription}</div>
                    <div className="sf2-listrow-meta">
                      {r.barcode} · {client === "ALL" && r.client ? `${r.client} · ` : ""}
                      <span className="sf2-gaptype-red">{r.classification}</span>
                    </div>
                  </div>
                </div>
              ))}
              {rows.length === 0 && <p className="empty-state">No SKUs currently meet this condition.</p>}
            </section>
          </>
        ) : (
          <>
            <section className="sf2-statrow">
              <div className={`sf2-stat tone-${tone}`}><div className="sf2-stat-n">{rows.length}</div><div className="sf2-stat-l">SKUs</div></div>
              {classification === "risk" ? (
                <div className="sf2-stat tone-red"><div className="sf2-stat-n">{salesAtRiskTotal}</div><div className="sf2-stat-l">P4W sales at risk</div></div>
              ) : classification === "overstock" ? (
                <div className="sf2-stat tone-purple"><div className="sf2-stat-n">{avgExcessWfc.toFixed(1)}</div><div className="sf2-stat-l">Avg excess WFC</div></div>
              ) : classification === "low" ? (
                <div className="sf2-stat tone-purple"><div className="sf2-stat-n">{avgCover.toFixed(1)}</div><div className="sf2-stat-l">Avg WFC</div></div>
              ) : (
                <div className="sf2-stat tone-cyan"><div className="sf2-stat-n">{dcAvailableCount}</div><div className="sf2-stat-l">SKUs w/ DC</div></div>
              )}
              {classification === "overstock" ? (
                <div className="sf2-stat tone-orange"><div className="sf2-stat-n">{Math.round(unitsTiedUp)}</div><div className="sf2-stat-l">Units tied up</div></div>
              ) : (
                <div className="sf2-stat tone-orange"><div className="sf2-stat-n">{classification === "low" || classification === "oos" || classification === "risk" ? suggestedOrderTotal : "—"}</div><div className="sf2-stat-l">Suggested units</div></div>
              )}
            </section>

            <section className="sf2-list">
              {rows.map((r) => (
                <button className={`sf2-listrow tone-${tone}`} key={r.barcode} onClick={() => goToSku(r.barcode, r.client)}>
                  <div>
                    <div className="sf2-listrow-title">{r.articleDescription}</div>
                    <div className="sf2-listrow-meta">
                      {r.barcode} · SOH {r.storeSoh} · DC {r.dcSoh ?? "—"}
                      {r.cover !== null && ` · WFC ${r.cover.toFixed(1)}`}
                    </div>
                  </div>
                  {(() => {
                    // DC availability must win over a suggested-order number
                    // - fixed 2026-08-16 after a real case showed "+27" (a
                    // suggested order) on a SKU where the DC itself has zero
                    // stock, which is misleading: there's nothing to order.
                    // No DC stock = escalate, regardless of what the target-
                    // cover formula calculates as a theoretical order size.
                    const dcCanFulfill = (r.dcSoh || 0) > 0 || (r.dcFulfillableUnits || 0) > 0;
                    if (classification === "overstock" && r.cover !== null) {
                      return <div className="sf2-listrow-status ok">{`+${(r.cover - OVERSTOCK_TARGET_WEEKS).toFixed(1)}w`}</div>;
                    }
                    if (!dcCanFulfill && (classification === "low" || classification === "oos" || classification === "risk")) {
                      return <div className="sf2-listrow-status warn">no DC</div>;
                    }
                    if ((classification === "low" || classification === "oos" || classification === "risk") && r.suggestedOrderUnits) {
                      return <div className="sf2-listrow-status ok">{`+${r.suggestedOrderUnits}`}</div>;
                    }
                    return <div className={`sf2-listrow-status ${(r.dcSoh || 0) > 0 ? "ok" : "warn"}`}>{(r.dcSoh || 0) > 0 ? "DC available" : "no DC"}</div>;
                  })()}
                </button>
              ))}
              {rows.length === 0 && (
                <p className="empty-state">No {TITLES[classification].toLowerCase()} SKUs at this store.</p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
