import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Wrench, X } from "lucide-react";
import { buildActionCaptureUrl } from "@/lib/action-capture-navigation";

interface SkuRow {
  barcode: string;
  articleDescription: string;
  storeSoh: number;
  dcSoh: number | null;
  sellOutP4: number | null;
  cover: number | null;
  classification: string;
  client?: string;
  sourceStem?: string | null;
}
interface SkuListResponse {
  resolvedClient: string;
  rows: SkuRow[];
}
interface SkuHistoryResponse {
  points: Array<{ weekEnding: string; storeSoh: number | null; sellOutP4: number | null }>;
}

function buildPoints(values: number[], xStart = 6, xEnd = 214, yTop = 8, yBottom = 56): string {
  if (values.length === 0) return "";
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = Math.max(1, max - min);
  const step = values.length > 1 ? (xEnd - xStart) / (values.length - 1) : 0;
  return values.map((v, i) => `${(xStart + step * i).toFixed(1)},${(yBottom - ((v - min) / range) * (yBottom - yTop)).toFixed(1)}`).join(" ");
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

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

interface Props {
  store: string;
  rep: string;
  barcode: string;
  client?: string;
  onClear: () => void;
}

// Selecting a SKU stays on whatever screen you were on (Insights/Supply/
// Analysis/Fix) and shows this inline instead of navigating to a separate
// page - Carin, 2026-08-13: "stay on the insights screen and only change
// the numbers based on the selection." Same real fields/trend charts the
// old full-page SKU detail screen showed, just rendered in place; the FIX
// button still goes to the real Action Capture flow, since capturing an
// action is a genuinely separate task, not a display concern.
export default function Sf2SkuInlineCard({ store, rep, barcode, client, onClear }: Props) {
  const [, setLocation] = useLocation();
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";

  const { data } = useQuery<SkuListResponse>({
    queryKey: ["nexus-sku-list", store, rep, "cover", client],
    queryFn: async () => {
      const res = await fetch(`/api/roster/sku-list?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}&classification=cover${clientQS || "&client=ALL"}`);
      if (!res.ok) throw new Error("Failed to fetch SKU list");
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
    enabled: !!store && !!barcode && !!client,
  });

  const row = data?.rows.find((r) => r.barcode === barcode);
  if (!row) return <div className="sf2-skusheet"><p className="loading-state">Loading SKU...</p></div>;

  const tone = statusTone(row.classification);
  const points = historyQuery.data?.points || [];
  const sohPoints = buildPoints(points.map((p) => p.storeSoh ?? 0));
  const salesPoints = buildPoints(points.map((p) => p.sellOutP4 ?? 0));
  const sohTakeaway = wowTakeaway("SOH", points.map((p) => p.storeSoh ?? 0));
  const salesTakeaway = wowTakeaway("Sales", points.map((p) => p.sellOutP4 ?? 0));

  return (
    <section className={`sf2-skusheet tone-${tone}`}>
      <div className="sf2-skusheet-title-row">
        <div className="sf2-skusheet-title">{row.articleDescription}</div>
        <button className="sf2-skusheet-clear" onClick={onClear} aria-label="Clear SKU selection"><X size={16} /></button>
      </div>
      <div className="sf2-skusheet-pills">
        <span className={`sf2-pill tone-${tone}`}>{row.classification.toUpperCase()}</span>
        <span className="sf2-pill-muted">{row.client || data?.resolvedClient}</span>
      </div>

      <div className="sf2-skustats">
        <div className={`sf2-skustat tone-${tone}`}><div className="n">{row.storeSoh}</div><div className="l">Store SOH</div></div>
        <div className={`sf2-skustat tone-${tone}`}><div className="n">{row.dcSoh ?? "—"}</div><div className="l">DC SOH</div></div>
        <div className={`sf2-skustat tone-${tone}`}><div className="n">{row.sellOutP4 ?? "—"}</div><div className="l">Sell out P4W</div></div>
        <div className={`sf2-skustat tone-${tone}`}><div className="n">{row.cover !== null ? row.cover.toFixed(1) : "—"}</div><div className="l">WFC</div></div>
      </div>

      <div className="sf2-skutrends">
        <div className="sf2-skutrend">
          <div className="sf2-skutrend-head"><span>SOH</span><strong className="tone-blue">{row.storeSoh}</strong></div>
          {points.length > 1 ? (
            <svg viewBox="0 0 220 60" className="sf2-skutrend-svg"><polyline className="sf2-line-blue" points={sohPoints} /></svg>
          ) : <p className="loading-state" style={{ fontSize: 9, padding: "6px 0" }}>Building history...</p>}
          {points.length > 1 && (
            <>
              <div className="sf2-skutrend-dates"><span>{shortDate(points[0].weekEnding)}</span><span>{shortDate(points[points.length - 1].weekEnding)}</span></div>
              <p className="sf2-skutrend-takeaway">{sohTakeaway}</p>
            </>
          )}
        </div>
        <div className="sf2-skutrend">
          <div className="sf2-skutrend-head"><span>Sales</span><strong className="tone-green">{row.sellOutP4 ?? "—"}</strong></div>
          {points.length > 1 ? (
            <svg viewBox="0 0 220 60" className="sf2-skutrend-svg"><polyline className="sf2-line-green" points={salesPoints} /></svg>
          ) : <p className="loading-state" style={{ fontSize: 9, padding: "6px 0" }}>Building history...</p>}
          {points.length > 1 && (
            <>
              <div className="sf2-skutrend-dates"><span>{shortDate(points[0].weekEnding)}</span><span>{shortDate(points[points.length - 1].weekEnding)}</span></div>
              <p className="sf2-skutrend-takeaway">{salesTakeaway}</p>
            </>
          )}
        </div>
      </div>

      {/* No fix needed for an Optimal SKU - there's nothing to action
          (Carin, 2026-08-16: "cant have fix when the sku is optimal").
          classification param uses the SKU's real sourceStem (oos/low/
          overstock) so action-capture resolves the right task - falls back
          to "risk" only when sourceStem is absent, since a non-Optimal SKU
          with no oos/low/overstock flag showing here is by definition the
          At Risk cover-threshold case (Carin, 2026-08-17: fixed a bug where
          this always sent "cover", which resolved to the wrong task type).
          Overstock volume is capped at task-GENERATION time only (top 5
          worst per store, 3x over threshold) - every SKU stays fully
          visible and tappable here regardless; Carin, 2026-08-17: "dont
          grey it out but only cap these under the fix menu." If a rep taps
          Fix on an overstock SKU that didn't make this week's top 5, the
          resolve call below just won't find a task and shows that as a
          normal error, not a disabled button. */}
      {row.classification.toUpperCase() !== "OPTIMAL" && (
        <button
          className="sf2-fixbutton"
          onClick={() => {
            const returnTo = `${window.location.pathname}${window.location.search}`;
            setLocation(buildActionCaptureUrl({
              store,
              rep,
              classification: row.sourceStem || "risk",
              barcode,
              client,
              returnTo,
            }));
          }}
        >
          <Wrench size={16} />
          FIX
        </button>
      )}
    </section>
  );
}
