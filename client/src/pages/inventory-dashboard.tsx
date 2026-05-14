import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle, BarChart3, Package, RefreshCw, ShoppingCart, Store,
  TrendingDown, X, ChevronDown, ChevronUp, ArrowLeft,
  MapPin, Building2, Activity, Database, Zap, AlertTriangle,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtWeek(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function fmt(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-ZA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtK(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  const v = Number(n);
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000)     return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return v.toLocaleString("en-ZA", { maximumFractionDigits: 0 });
}

function pct(part: number, total: number): string {
  if (!total) return "0%";
  return ((part / total) * 100).toFixed(1) + "%";
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Filters { client: string; banner: string; region: string; week: string; }
interface KPIs {
  totalSkus: number; oosCount: number; noSalesCount: number; negativeSohCount: number;
  totalStoreSoh: number; totalDcSoh: number; totalSalesP4: number; storeCount: number; weekEnding: string | null;
}
interface StoreSummaryRow {
  storeName: string; banner: string; repName: string; lineManager: string;
  skuCount: number; oosSkuCount: number; noSalesSkuCount: number; negativeSohSkuCount: number;
  totalStoreSoh: number; totalDcSoh: number; totalSalesP4: number;
}
interface SkuRow {
  id: number; barcode: string; articleDescription: string; brand: string; category: string;
  storeName: string; banner: string; region: string; repName: string;
  storeSoh: number; dcSoh: number; sellOutP4: number; openPoQty: number;
  avgSales: number; wfc: number; wfcWithPo: number;
  stockClassification: string; action: string;
  oosFlag: number; noSalesFlag: number; negativeSohFlag: number; exceptionFlag: boolean;
}
interface FilterOptions { clients: string[]; banners: string[]; regions: string[]; weeks: string[]; }
interface SyncLog { syncedAt: string; storeRows: number; skuRows: number; durationMs: number; status: string; error: string | null; }
interface Insights {
  weekEnding: string;
  topBanners: { banner: string; oosCount: number; totalSkus: number; noSalesCount: number }[];
  topRegions: { region: string; oosCount: number; totalSkus: number }[];
  topStores: { storeName: string; banner: string; oosCount: number; totalSkus: number; dcSoh: number }[];
  dcSplit: { storeReplenish: number; dcConstrained: number };
}
interface ClientRow { client: string; stores: number; skus: number; latest_week: string; synced_at: string; }
type BrowseItem = { type: "folder"; name: string; id: string } | { type: "file"; name: string; id: string; size: number };
type NavEntry = { label: string; itemId?: string; path?: string };
type NavSection = "overview" | "oos" | "nosales" | "negative" | "stores" | "skus" | "sync";

// Design tokens
const ORANGE = "#F58220";
const NAVY   = "#071A2D";
const NAVY_L = "#163B5C";

// ─── API helpers ──────────────────────────────────────────────────────────────

const apiFetch = (url: string) => fetch(url).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
const qs = (f: Filters, extra?: Record<string, string>) => {
  const p = new URLSearchParams();
  if (f.client) p.set("client", f.client);
  if (f.banner) p.set("banner", f.banner);
  if (f.region) p.set("region", f.region);
  if (f.week)   p.set("week", f.week);
  if (extra) Object.entries(extra).forEach(([k, v]) => v && p.set(k, v));
  const s = p.toString(); return s ? "?" + s : "";
};

// ─── Mini components ──────────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-gray-100 flex-1 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: color }} />
    </div>
  );
}

function RingChart({ healthy, oos, nosales, neg }: { healthy: number; oos: number; nosales: number; neg: number }) {
  const total = healthy + oos + nosales + neg || 1;
  const R = 38, cx = 44, cy = 44, circ = 2 * Math.PI * R;
  const segs = [
    { v: healthy, color: "#22c55e" },
    { v: oos,     color: "#ef4444" },
    { v: nosales, color: ORANGE    },
    { v: neg,     color: "#eab308" },
  ];
  let cum = 0;
  return (
    <svg width={88} height={88} viewBox="0 0 88 88" className="flex-shrink-0">
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#e2e8f0" strokeWidth={13} />
      {segs.filter(s => s.v > 0).map((s, i) => {
        const dash = (s.v / total) * circ;
        const off  = -(cum / total) * circ;
        cum += s.v;
        return <circle key={i} cx={cx} cy={cy} r={R} fill="none"
          stroke={s.color} strokeWidth={13}
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={off}
          transform={`rotate(-90, ${cx}, ${cy})`} />;
      })}
    </svg>
  );
}

function KpiCard({ label, value, tooltip, sub, subRed, icon: Icon, iconColor }: {
  label: string; value: string; tooltip?: string; sub?: string; subRed?: boolean; icon: any; iconColor: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-3 py-2.5 min-w-0 flex flex-col gap-0.5" title={tooltip}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest leading-none">{label}</p>
        <Icon size={13} style={{ color: iconColor }} />
      </div>
      <p className="text-xl font-bold leading-tight text-gray-900">{value}</p>
      {sub && <p className={`text-[11px] font-medium leading-none ${subRed ? "text-red-500" : "text-gray-400"}`}>{sub}</p>}
    </div>
  );
}

function FilterBar({ options, filters, onChange }: { options: FilterOptions; filters: Filters; onChange: (f: Filters) => void }) {
  const sel = "h-7 text-xs border border-gray-200 rounded-lg px-2 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400";
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <select className={sel} value={filters.client} onChange={e => onChange({ ...filters, client: e.target.value, banner: "", region: "" })} data-testid="filter-client">
        <option value="">All Clients</option>
        {options.clients.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select className={sel} value={filters.banner} onChange={e => onChange({ ...filters, banner: e.target.value })} data-testid="filter-banner">
        <option value="">All Banners</option>
        {options.banners.map(b => <option key={b} value={b}>{b}</option>)}
      </select>
      <select className={sel} value={filters.region} onChange={e => onChange({ ...filters, region: e.target.value })} data-testid="filter-region">
        <option value="">All Regions</option>
        {options.regions.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <select className={sel} value={filters.week} onChange={e => onChange({ ...filters, week: e.target.value })} data-testid="filter-week">
        <option value="">Latest Week</option>
        {options.weeks.map(w => <option key={w} value={w}>{fmtWeek(w)}</option>)}
      </select>
      {(filters.client || filters.banner || filters.region || filters.week) && (
        <button onClick={() => onChange({ client: "", banner: "", region: "", week: "" })}
          className="flex items-center gap-1 h-7 px-2 text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg bg-white" data-testid="btn-clear-filters">
          <X size={11} /> Clear
        </button>
      )}
    </div>
  );
}

function SortableHeader({ label, col, sort, onSort }: { label: string; col: string; sort: { col: string; dir: "asc" | "desc" }; onSort: (c: string) => void }) {
  const active = sort.col === col;
  return (
    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-800 select-none whitespace-nowrap"
      onClick={() => onSort(col)}>
      <span className="flex items-center gap-1">
        {label}
        {active ? (sort.dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ChevronDown size={11} className="opacity-20" />}
      </span>
    </th>
  );
}

function FlagBadge({ flag, label }: { flag: number | boolean | null; label: string }) {
  if (flag !== 1 && flag !== true) return null;
  return <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">{label}</span>;
}

function ClassificationBadge({ val }: { val: string | null }) {
  if (!val) return null;
  const lower = val.toLowerCase();
  const color = lower.includes("oos") ? "bg-red-100 text-red-700"
    : lower.includes("no sales") || lower.includes("no_sales") ? "bg-orange-100 text-orange-700"
    : lower.includes("low") ? "bg-yellow-100 text-yellow-700"
    : lower.includes("healthy") || lower.includes("ok") ? "bg-green-100 text-green-700"
    : "bg-gray-100 text-gray-600";
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${color}`}>{val}</span>;
}

// ─── Executive Overview ────────────────────────────────────────────────────────

function OverviewPage({ kpis, filters }: { kpis: KPIs | undefined; filters: Filters }) {
  const { data: insights } = useQuery<Insights>({
    queryKey: ["inv-insights", filters],
    queryFn: () => apiFetch(`/api/inventory/insights${qs(filters)}`),
    staleTime: 60000,
  });

  const totalSkus   = kpis?.totalSkus   ?? 0;
  const oosCount    = kpis?.oosCount    ?? 0;
  const noSales     = kpis?.noSalesCount ?? 0;
  const negSoh      = kpis?.negativeSohCount ?? 0;
  const healthy     = Math.max(0, totalSkus - oosCount - noSales - negSoh);

  const maxBanner   = Math.max(1, ...(insights?.topBanners.map(b => b.oosCount) ?? [1]));
  const maxRegion   = Math.max(1, ...(insights?.topRegions.map(r => r.oosCount) ?? [1]));
  const maxStore    = Math.max(1, ...(insights?.topStores.map(s => s.oosCount)  ?? [1]));

  const storeReplenish = insights?.dcSplit.storeReplenish ?? 0;
  const dcConstrained  = insights?.dcSplit.dcConstrained  ?? 0;
  const totalOos       = storeReplenish + dcConstrained || 1;

  const worstStore  = insights?.topStores[0];
  const topBanner   = insights?.topBanners[0];

  const attentionItems = [
    oosCount    > 0 ? `${fmtK(oosCount)} OOS SKU-store combinations require urgent review.` : null,
    noSales     > 0 ? `${fmtK(noSales)} SKU-store combinations have no sales in 4 weeks.` : null,
    negSoh      > 0 ? `${fmtK(negSoh)} records show negative SOH — possible data or execution issue.` : null,
    storeReplenish > 0 ? `${fmtK(storeReplenish)} OOS SKUs can be replenished from DC stock now.` : null,
    worstStore ? `${worstStore.storeName} has ${fmtK(worstStore.oosCount)} OOS SKUs (${pct(worstStore.oosCount, worstStore.totalSkus)} of range).` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col h-full overflow-hidden gap-3">

      {/* KPI Row */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2 flex-shrink-0">
        <KpiCard label="Stores"    value={fmtK(kpis?.storeCount)}     tooltip={fmt(kpis?.storeCount)}    icon={Store}       iconColor="#3b82f6" />
        <KpiCard label="Total SKUs" value={fmtK(kpis?.totalSkus)}     tooltip={fmt(kpis?.totalSkus)}     icon={Package}     iconColor="#6b7280" />
        <KpiCard label="OOS SKUs"  value={fmtK(oosCount)}             tooltip={fmt(oosCount)}            icon={AlertCircle} iconColor="#ef4444"
          sub={kpis ? pct(oosCount, totalSkus) : undefined} subRed />
        <KpiCard label="No Sales"  value={fmtK(noSales)}              tooltip={fmt(noSales)}             icon={TrendingDown} iconColor={ORANGE}
          sub={kpis ? pct(noSales, totalSkus) : undefined} />
        <KpiCard label="Neg SOH"   value={fmtK(negSoh)}               tooltip={fmt(negSoh)}              icon={AlertTriangle} iconColor="#eab308"
          sub={kpis ? pct(negSoh, totalSkus) : undefined} />
        <KpiCard label="Store SOH" value={fmtK(kpis?.totalStoreSoh)}  tooltip={fmt(kpis?.totalStoreSoh)} icon={Database}    iconColor="#0ea5e9" />
        <KpiCard label="DC SOH"    value={fmtK(kpis?.totalDcSoh)}     tooltip={fmt(kpis?.totalDcSoh)}    icon={Activity}    iconColor="#8b5cf6" />
        <KpiCard label="Sales P4"  value={fmtK(kpis?.totalSalesP4)}   tooltip={fmt(kpis?.totalSalesP4)}  icon={Zap}         iconColor="#22c55e" />
      </div>

      {/* Main Visual Grid */}
      <div className="grid grid-cols-12 gap-3 flex-1 min-h-0">

        {/* Col A: Stock Health + DC vs Store */}
        <div className="col-span-3 flex flex-col gap-3 min-h-0">

          {/* Stock Health Ring */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1 min-h-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Stock Health</p>
            <div className="flex items-center gap-3">
              <RingChart healthy={healthy} oos={oosCount} nosales={noSales} neg={negSoh} />
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {[
                  { label: "Healthy",  value: healthy,  color: "#22c55e" },
                  { label: "OOS",      value: oosCount,  color: "#ef4444" },
                  { label: "No Sales", value: noSales,   color: ORANGE    },
                  { label: "Neg SOH",  value: negSoh,    color: "#eab308" },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-[11px] text-gray-500 flex-1 truncate">{s.label}</span>
                    <span className="text-[11px] font-semibold text-gray-700 font-mono">{fmtK(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* DC vs Store Split */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-shrink-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">OOS Supply Split</p>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-600 font-medium">Store Replenishment</span>
                  <span className="font-mono font-semibold text-blue-600">{fmtK(storeReplenish)}</span>
                </div>
                <MiniBar value={storeReplenish} max={totalOos} color="#3b82f6" />
                <p className="text-[10px] text-gray-400 mt-0.5">OOS but DC has stock</p>
              </div>
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-600 font-medium">DC Constrained</span>
                  <span className="font-mono font-semibold text-red-600">{fmtK(dcConstrained)}</span>
                </div>
                <MiniBar value={dcConstrained} max={totalOos} color="#ef4444" />
                <p className="text-[10px] text-gray-400 mt-0.5">OOS and DC also empty</p>
              </div>
            </div>
          </div>
        </div>

        {/* Col B: Top 5 Banners + Top 5 Regions */}
        <div className="col-span-4 flex flex-col gap-3 min-h-0">

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={13} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Top 5 Banners by OOS</p>
            </div>
            <div className="space-y-2.5">
              {(insights?.topBanners ?? []).map((b, i) => (
                <div key={b.banner} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-300 w-4">{i + 1}</span>
                  <span className="text-[11px] text-gray-700 capitalize w-28 truncate flex-shrink-0">{b.banner}</span>
                  <MiniBar value={b.oosCount} max={maxBanner} color="#ef4444" />
                  <span className="text-[11px] font-mono font-semibold text-red-600 w-10 text-right flex-shrink-0">{fmtK(b.oosCount)}</span>
                </div>
              ))}
              {!insights && <div className="text-xs text-gray-300">Loading…</div>}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={13} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Top 5 Regions by OOS</p>
            </div>
            <div className="space-y-2.5">
              {(insights?.topRegions ?? []).map((r, i) => (
                <div key={r.region} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-300 w-4">{i + 1}</span>
                  <span className="text-[11px] text-gray-700 w-28 truncate flex-shrink-0">{r.region}</span>
                  <MiniBar value={r.oosCount} max={maxRegion} color={ORANGE} />
                  <span className="text-[11px] font-mono font-semibold w-10 text-right flex-shrink-0" style={{ color: ORANGE }}>{fmtK(r.oosCount)}</span>
                </div>
              ))}
              {!insights && <div className="text-xs text-gray-300">Loading…</div>}
            </div>
          </div>
        </div>

        {/* Col C: Top 5 Problem Stores + What Needs Attention */}
        <div className="col-span-5 flex flex-col gap-3 min-h-0">

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-3">
              <Store size={13} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Top 5 Problem Stores</p>
            </div>
            <div className="space-y-2">
              {(insights?.topStores ?? []).map((s, i) => {
                const oosPct = s.totalSkus > 0 ? ((s.oosCount / s.totalSkus) * 100).toFixed(0) : "0";
                const canReplenish = s.dcSoh > 0;
                return (
                  <div key={s.storeName} className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-gray-300 w-4 pt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-gray-800 truncate">{s.storeName}</span>
                        <span className="text-[10px] text-gray-400 capitalize">{s.banner}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <MiniBar value={s.oosCount} max={maxStore} color="#ef4444" />
                        <span className="text-[10px] font-mono text-red-600 font-semibold flex-shrink-0">{fmtK(s.oosCount)} ({oosPct}%)</span>
                      </div>
                    </div>
                    {canReplenish && (
                      <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-semibold flex-shrink-0 mt-0.5">DC→</span>
                    )}
                  </div>
                );
              })}
              {!insights && <div className="text-xs text-gray-300">Loading…</div>}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex-shrink-0">
            <div className="flex items-center gap-2 mb-2.5">
              <AlertCircle size={13} style={{ color: ORANGE }} />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">What Needs Attention</p>
            </div>
            <ol className="space-y-1.5">
              {attentionItems.slice(0, 5).map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-gray-600">
                  <span className="font-bold flex-shrink-0 mt-0.5" style={{ color: ORANGE }}>{i + 1}.</span>
                  <span className="leading-tight">{item}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* Commentary Card */}
      <div className="flex-shrink-0 rounded-2xl px-5 py-3 flex items-center gap-4"
        style={{ backgroundColor: NAVY, borderLeft: `4px solid ${ORANGE}` }}>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white mb-1">Executive Summary — Week ending {fmtWeek(kpis?.weekEnding)}</p>
          <p className="text-[11px] leading-relaxed" style={{ color: "#9FB3C8" }}>
            Stock health is under pressure with{" "}
            <span style={{ color: ORANGE }} className="font-semibold">{fmtK(oosCount)} OOS</span> and{" "}
            <span style={{ color: ORANGE }} className="font-semibold">{fmtK(noSales)} no-sales</span> SKU-store combinations.
            {storeReplenish > 0 && <> <span className="text-blue-300 font-semibold">{fmtK(storeReplenish)}</span> OOS SKUs can be resolved immediately via DC replenishment.</>}
            {topBanner && <> OOS risk is concentrated in <span className="text-white font-semibold capitalize">{topBanner.banner}</span> ({fmtK(topBanner.oosCount)} SKUs).</>}
            {" "}Priority: replenish from DC, investigate no-sales SKUs, and clear negative SOH exceptions.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Store table ──────────────────────────────────────────────────────────────

function StoreTable({ filters, onDrill }: { filters: Filters; onDrill: (store: string) => void }) {
  const [sort, setSort] = useState({ col: "oosSkuCount", dir: "desc" as "asc" | "desc" });
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery<StoreSummaryRow[]>({
    queryKey: ["inv-stores", filters],
    queryFn: () => apiFetch(`/api/inventory/stores${qs(filters)}`),
    staleTime: 60000,
  });

  const sorted = useMemo(() => {
    let rows = data.filter(r => !search || r.storeName?.toLowerCase().includes(search.toLowerCase()) || r.banner?.toLowerCase().includes(search.toLowerCase()));
    return [...rows].sort((a, b) => {
      const av = (a as any)[sort.col] ?? 0, bv = (b as any)[sort.col] ?? 0;
      return sort.dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [data, sort, search]);

  const toggleSort = (col: string) => setSort(s => ({ col, dir: s.col === col && s.dir === "desc" ? "asc" : "desc" }));
  if (isLoading) return <div className="flex items-center justify-center h-40 text-gray-400">Loading stores…</div>;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="mb-3 flex items-center gap-2 flex-shrink-0">
        <input className="h-8 px-3 text-sm border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="Search store or banner…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-store-search" />
        <span className="text-xs text-gray-400">{sorted.length} stores</span>
      </div>
      <div className="overflow-auto rounded-xl border border-gray-100 flex-1 min-h-0">
        <table className="w-full text-sm bg-white">
          <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
            <tr>
              <SortableHeader label="Store"    col="storeName"         sort={sort} onSort={toggleSort} />
              <SortableHeader label="Banner"   col="banner"            sort={sort} onSort={toggleSort} />
              <SortableHeader label="Rep"      col="repName"           sort={sort} onSort={toggleSort} />
              <SortableHeader label="SKUs"     col="skuCount"          sort={sort} onSort={toggleSort} />
              <SortableHeader label="OOS"      col="oosSkuCount"       sort={sort} onSort={toggleSort} />
              <SortableHeader label="No Sales" col="noSalesSkuCount"   sort={sort} onSort={toggleSort} />
              <SortableHeader label="Neg SOH"  col="negativeSohSkuCount" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Store SOH" col="totalStoreSoh"    sort={sort} onSort={toggleSort} />
              <SortableHeader label="DC SOH"   col="totalDcSoh"        sort={sort} onSort={toggleSort} />
              <SortableHeader label="Sales P4" col="totalSalesP4"      sort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-orange-50 cursor-pointer transition-colors"
                onClick={() => onDrill(row.storeName)} data-testid={`row-store-${i}`}>
                <td className="px-3 py-2 font-medium text-blue-700 hover:underline">{row.storeName}</td>
                <td className="px-3 py-2 text-gray-600 capitalize text-xs">{row.banner}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{row.repName}</td>
                <td className="px-3 py-2 text-center font-mono text-xs">{fmt(row.skuCount)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`font-mono font-semibold text-xs ${row.oosSkuCount > 0 ? "text-red-600" : "text-gray-300"}`}>{fmt(row.oosSkuCount)}</span>
                  {row.skuCount > 0 && row.oosSkuCount > 0 && <span className="ml-1 text-[10px] text-gray-400">{pct(row.oosSkuCount, row.skuCount)}</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`font-mono font-semibold text-xs ${row.noSalesSkuCount > 0 ? "text-orange-600" : "text-gray-300"}`}>{fmt(row.noSalesSkuCount)}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`font-mono font-semibold text-xs ${row.negativeSohSkuCount > 0 ? "text-yellow-600" : "text-gray-300"}`}>{fmt(row.negativeSohSkuCount)}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-gray-600">{fmtK(row.totalStoreSoh)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-gray-600">{fmtK(row.totalDcSoh)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-gray-600">{fmtK(row.totalSalesP4)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400">No stores found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── SKU table ────────────────────────────────────────────────────────────────

function SkuTable({ filters, flagFilter, drillStore }: { filters: Filters; flagFilter?: "oos" | "nosales" | "negative"; drillStore?: string }) {
  const [sort, setSort] = useState({ col: "storeSoh", dir: "asc" as "asc" | "desc" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 100;
  const extra: Record<string, string> = {};
  if (flagFilter) extra.flag = flagFilter;
  if (drillStore) extra.store = drillStore;

  const { data = [], isLoading } = useQuery<SkuRow[]>({
    queryKey: ["inv-skus", filters, flagFilter, drillStore],
    queryFn: () => apiFetch(`/api/inventory/skus${qs(filters, extra)}`),
    staleTime: 60000,
  });

  const filtered = useMemo(() => data.filter(r =>
    !search || r.articleDescription?.toLowerCase().includes(search.toLowerCase()) ||
    r.barcode?.includes(search) || r.brand?.toLowerCase().includes(search.toLowerCase()) ||
    r.storeName?.toLowerCase().includes(search.toLowerCase())
  ), [data, search]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = (a as any)[sort.col] ?? 0, bv = (b as any)[sort.col] ?? 0;
    return sort.dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  }), [filtered, sort]);

  const paged = sorted.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.ceil(sorted.length / PAGE);
  const toggleSort = (col: string) => { setPage(0); setSort(s => ({ col, dir: s.col === col && s.dir === "desc" ? "asc" : "desc" })); };
  if (isLoading) return <div className="flex items-center justify-center h-40 text-gray-400">Loading SKUs…</div>;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <input className="h-8 px-3 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="Search article, barcode, brand…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} data-testid="input-sku-search" />
        <span className="text-xs text-gray-400">{sorted.length.toLocaleString()} SKUs · page {page + 1}/{Math.max(1, totalPages)}</span>
        <div className="flex gap-1 ml-auto">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="h-7 px-2 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50" data-testid="btn-prev-page">Prev</button>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            className="h-7 px-2 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50" data-testid="btn-next-page">Next</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm bg-white min-w-[900px]">
          <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
            <tr>
              <SortableHeader label="Article"  col="articleDescription" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Brand"    col="brand"              sort={sort} onSort={toggleSort} />
              <SortableHeader label="Store"    col="storeName"          sort={sort} onSort={toggleSort} />
              <SortableHeader label="Banner"   col="banner"             sort={sort} onSort={toggleSort} />
              <SortableHeader label="Region"   col="region"             sort={sort} onSort={toggleSort} />
              <SortableHeader label="Store SOH" col="storeSoh"          sort={sort} onSort={toggleSort} />
              <SortableHeader label="DC SOH"   col="dcSoh"              sort={sort} onSort={toggleSort} />
              <SortableHeader label="Sell P4"  col="sellOutP4"          sort={sort} onSort={toggleSort} />
              <SortableHeader label="WFC"      col="wfc"                sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Flags</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={row.id ?? i} className="border-b border-gray-50 hover:bg-orange-50 transition-colors" data-testid={`row-sku-${i}`}>
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-800 text-xs">{row.articleDescription}</div>
                  <div className="text-gray-400 text-[10px] font-mono">{row.barcode}</div>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">{row.brand}</td>
                <td className="px-3 py-2 text-xs">{row.storeName}</td>
                <td className="px-3 py-2 text-xs text-gray-500 capitalize">{row.banner}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{row.region}</td>
                <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                  <span className={row.storeSoh <= 0 ? "text-red-600" : row.storeSoh < 5 ? "text-orange-500" : "text-gray-700"}>{fmt(row.storeSoh, 1)}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmt(row.dcSoh, 0)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmt(row.sellOutP4, 0)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmt(row.wfc, 1)}</td>
                <td className="px-3 py-2"><ClassificationBadge val={row.stockClassification} /></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 flex-wrap">
                    <FlagBadge flag={row.oosFlag} label="OOS" />
                    <FlagBadge flag={row.noSalesFlag} label="No Sales" />
                    <FlagBadge flag={row.negativeSohFlag} label="Neg SOH" />
                    <FlagBadge flag={row.exceptionFlag} label="Exception" />
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-gray-400">No SKUs found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sync Panel ───────────────────────────────────────────────────────────────

type NavEntrySync = { label: string; itemId?: string; path?: string };

function SyncPanel() {
  const queryClient = useQueryClient();
  const [navStack, setNavStack] = useState<NavEntrySync[]>([{ label: "My OneDrive", path: "." }]);
  const currentNav = navStack[navStack.length - 1];
  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ id: string; name: string; folderLabel: string } | null>(null);
  const [resyncingClient, setResyncingClient] = useState<string | null>(null);

  const { data: log } = useQuery<SyncLog | null>({ queryKey: ["inv-sync-log"], queryFn: () => apiFetch("/api/inventory/sync-status"), staleTime: 30000 });
  const { data: clients = [] } = useQuery<ClientRow[]>({ queryKey: ["inv-clients"], queryFn: () => apiFetch("/api/inventory/clients"), staleTime: 30000 });

  const invalidateAll = () => {
    ["inv-stores","inv-skus","inv-kpis","inv-filters","inv-sync-log","inv-clients","inv-insights"].forEach(k =>
      queryClient.invalidateQueries({ queryKey: [k] })
    );
  };

  const syncFileMut = useMutation({
    mutationFn: (body: { fileId?: string; drivePath?: string; label?: string }) =>
      fetch("/api/inventory/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { invalidateAll(); setSelectedFile(null); setResyncingClient(null); },
  });

  const isSyncing = syncFileMut.isPending;

  const browse = async (nav: NavEntrySync) => {
    setBrowsing(true); setBrowseError(""); setBrowseItems([]); setSelectedFile(null);
    try {
      const qs2 = nav.itemId ? `itemId=${encodeURIComponent(nav.itemId)}` : `path=${encodeURIComponent(nav.path || ".")}`;
      const r = await fetch(`/api/inventory/browse?${qs2}`);
      const data = await r.json();
      if (data.error) { setBrowseError(data.error); setBrowsing(false); return; }
      const items: BrowseItem[] = [
        ...(data.folders || []).map((f: any) => ({ type: "folder" as const, name: f.name, id: f.id })),
        ...(data.files   || []).map((f: any) => ({ type: "file"   as const, name: f.name, id: f.id, size: f.size })),
      ];
      setBrowseItems(items);
    } catch (e: any) { setBrowseError(e.message); }
    setBrowsing(false);
  };

  const openFolder = (item: { name: string; id: string }) => {
    const entry: NavEntrySync = { label: item.name, itemId: item.id };
    setNavStack(s => [...s, entry]);
    browse(entry);
  };

  const goUp = () => {
    if (navStack.length <= 1) return;
    const newStack = navStack.slice(0, -1);
    setNavStack(newStack);
    browse(newStack[newStack.length - 1]);
  };

  const handleResync = (c: ClientRow) => {
    setResyncingClient(c.client);
    syncFileMut.mutate({ drivePath: `Client Service Team - SOH Weekly Updates/${c.client}/Inventory_Combined.parquet`, label: c.client });
  };

  const breadcrumb = navStack.map(n => n.label).join(" › ");

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="text-lg font-bold text-gray-800">Data Sync</h2>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Currently Loaded Clients</h3>
        {clients.length === 0 ? (
          <p className="text-sm text-gray-400">No data loaded yet. Use the browser below to add a client.</p>
        ) : (
          <div className="space-y-2">
            {clients.map(c => (
              <div key={c.client} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl" data-testid={`client-row-${c.client}`}>
                <div>
                  <span className="font-semibold text-gray-800">{c.client}</span>
                  <span className="ml-3 text-xs text-gray-500">
                    {Number(c.stores).toLocaleString()} stores · {Number(c.skus).toLocaleString()} SKUs · week {fmtWeek(c.latest_week)}
                  </span>
                </div>
                <button onClick={() => handleResync(c)} disabled={isSyncing}
                  className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 flex items-center gap-1"
                  data-testid={`btn-resync-${c.client}`}>
                  <RefreshCw size={11} className={isSyncing && resyncingClient === c.client ? "animate-spin" : ""} />
                  Re-sync
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Add / Update a Client</h3>
          <button onClick={() => browse(currentNav)} disabled={browsing}
            className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 flex items-center gap-1" data-testid="btn-open-browser">
            <RefreshCw size={11} className={browsing ? "animate-spin" : ""} />
            {browseItems.length === 0 && !browsing ? "Open file browser" : "Refresh"}
          </button>
        </div>
        <p className="text-xs text-gray-400">Browse your OneDrive to find the parquet file for the next client. Click folders to navigate, then select the file to sync.</p>

        {browseItems.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {navStack.length > 1 && <button onClick={goUp} className="hover:text-blue-600" data-testid="btn-go-up">← Back</button>}
            <span className="font-mono truncate">{breadcrumb}</span>
          </div>
        )}
        {browseError && <div className="text-xs text-red-600">{browseError}</div>}
        {browseItems.length > 0 && (
          <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {browseItems.map(item => (
              <button key={item.id}
                onClick={() => item.type === "folder" ? openFolder(item) : setSelectedFile({ id: item.id, name: item.name, folderLabel: currentNav.label })}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-orange-50 transition-colors
                  ${item.type === "file" && selectedFile?.id === item.id ? "bg-orange-50 text-orange-700" : "text-gray-700"}`}
                data-testid={`browse-item-${item.name}`}>
                <span className="text-base leading-none">{item.type === "folder" ? "📁" : "📄"}</span>
                <span className="flex-1 text-xs font-mono">{item.name}</span>
                {item.type === "file" && <span className="text-xs text-gray-400">{(item.size / 1024 / 1024).toFixed(1)} MB</span>}
                {item.type === "folder" && <span className="text-xs text-gray-400">›</span>}
              </button>
            ))}
          </div>
        )}
        {selectedFile && (
          <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl">
            <div className="flex-1 text-sm text-gray-800 truncate">
              Selected: <strong>{selectedFile.name}</strong>
              <span className="text-xs ml-2 text-gray-400">from {selectedFile.folderLabel}</span>
            </div>
            <button onClick={() => syncFileMut.mutate({ fileId: selectedFile.id, label: selectedFile.folderLabel })} disabled={isSyncing}
              className="h-7 px-3 text-xs text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
              style={{ backgroundColor: ORANGE }} data-testid="btn-sync-selected">
              <RefreshCw size={11} className={syncFileMut.isPending ? "animate-spin" : ""} />
              {syncFileMut.isPending ? "Syncing…" : "Sync This File"}
            </button>
          </div>
        )}
      </div>

      {isSyncing && (
        <div className="rounded-xl p-3 bg-blue-50 text-blue-800 text-sm flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin flex-shrink-0" /> Syncing from SharePoint… this may take 1–2 minutes.
        </div>
      )}
      {syncFileMut.data?.error && !isSyncing && (
        <div className="rounded-xl p-3 bg-red-50 text-red-800 text-sm">{syncFileMut.data.error}</div>
      )}
      {log && !isSyncing && (
        <div className={`rounded-xl p-3 text-sm ${log.status === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          <div className="font-semibold mb-1">{log.status === "ok" ? "✓ Last sync successful" : "✗ Last sync failed"}</div>
          <div className="text-xs space-y-0.5 opacity-80">
            <div>{new Date(log.syncedAt).toLocaleString("en-ZA")}</div>
            {log.storeRows != null && <div>{log.storeRows?.toLocaleString()} store rows · {log.skuRows?.toLocaleString()} SKU rows · {((log.durationMs || 0) / 1000).toFixed(1)}s</div>}
            {log.error && <div className="mt-1">{log.error}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function InventoryDashboard() {
  const [nav, setNav] = useState<NavSection>("overview");
  const [filters, setFilters] = useState<Filters>({ client: "", banner: "", region: "", week: "" });
  const [drillStore, setDrillStore] = useState<string | null>(null);

  const { data: filterOptions = { clients: [], banners: [], regions: [], weeks: [] } } = useQuery<FilterOptions>({
    queryKey: ["inv-filters", filters.client],
    queryFn: () => apiFetch(`/api/inventory/filters${filters.client ? `?client=${encodeURIComponent(filters.client)}` : ""}`),
    staleTime: 60000,
  });

  const { data: kpis } = useQuery<KPIs>({
    queryKey: ["inv-kpis", filters],
    queryFn: () => apiFetch(`/api/inventory/kpis${qs(filters)}`),
    staleTime: 60000,
  });

  const weekLabel = kpis?.weekEnding ? fmtWeek(kpis.weekEnding) : "—";

  const NAV: { id: NavSection; label: string; icon: any }[] = [
    { id: "overview", label: "Overview",         icon: BarChart3   },
    { id: "oos",      label: "OOS Monitor",      icon: AlertCircle },
    { id: "nosales",  label: "No Sales",          icon: TrendingDown },
    { id: "negative", label: "Negative SOH",     icon: AlertTriangle },
    { id: "stores",   label: "Store Performance", icon: Store        },
    { id: "skus",     label: "All SKUs",          icon: ShoppingCart },
    { id: "sync",     label: "Sync Data",         icon: RefreshCw   },
  ];

  const alertNav: NavSection[] = ["oos", "nosales", "negative"];
  const alertColors: Record<string, string> = { oos: "#ef4444", nosales: ORANGE, negative: "#eab308" };

  return (
    <div className="min-h-screen flex" style={{ background: "#F0F4F8" }}>

      {/* Sidebar — orange strip + deep navy */}
      <aside className="flex flex-shrink-0 sticky top-0 h-screen z-20" style={{ width: 224 }}>
        {/* Orange strip */}
        <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: ORANGE }} />
        {/* Nav */}
        <div className="flex-1 flex flex-col" style={{ backgroundColor: NAVY }}>
          <div className="px-4 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: ORANGE }}>StockFix</div>
            <div className="text-sm font-bold text-white">Inventory Hub</div>
            <div className="text-[10px] mt-0.5" style={{ color: "#9FB3C8" }}>Stock Health Dashboard</div>
            <div className="text-[10px] mt-2 font-mono" style={{ color: "#9FB3C8" }}>Week: {weekLabel}</div>
          </div>

          <nav className="flex-1 py-2">
            {NAV.map(item => {
              const Icon = item.icon;
              const active = nav === item.id;
              const alertColor = alertColors[item.id];
              return (
                <button key={item.id} onClick={() => { setNav(item.id); setDrillStore(null); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium transition-all text-left relative"
                  style={{
                    backgroundColor: active ? NAVY_L : "transparent",
                    color: active ? "white" : "#9FB3C8",
                    borderLeft: active ? `2px solid ${ORANGE}` : "2px solid transparent",
                  }}
                  data-testid={`nav-${item.id}`}>
                  <Icon size={14} style={{ color: active ? ORANGE : (alertColor ?? "#9FB3C8"), flexShrink: 0 }} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="px-4 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <a href="/" className="text-[10px] hover:text-white transition-colors" style={{ color: "#9FB3C8" }}>← Back to StockFix</a>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Filter bar */}
        <header className="bg-white border-b border-gray-100 px-5 py-2.5 flex-shrink-0 flex items-center gap-4">
          <FilterBar options={filterOptions} filters={filters} onChange={f => { setFilters(f); setDrillStore(null); }} />
        </header>

        {/* Content */}
        <div className={`flex-1 overflow-auto ${nav === "overview" ? "overflow-hidden" : ""}`}>
          <div className={`px-5 ${nav === "overview" ? "h-full py-4 flex flex-col" : "py-5"}`}>

            {/* Overview — executive cockpit */}
            {nav === "overview" && !drillStore && (
              <div className="flex-1 min-h-0">
                <OverviewPage kpis={kpis} filters={filters} />
              </div>
            )}

            {/* Store drill-down from Overview */}
            {nav === "overview" && drillStore && (
              <div>
                <button onClick={() => setDrillStore(null)}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4" data-testid="btn-back-stores">
                  <ArrowLeft size={14} /> Back to Overview
                </button>
                <h2 className="text-base font-bold text-gray-800 mb-4">{drillStore} — SKU Breakdown</h2>
                <SkuTable filters={filters} drillStore={drillStore} />
              </div>
            )}

            {/* OOS Monitor */}
            {nav === "oos" && (
              <div>
                <h2 className="text-base font-bold text-gray-800 mb-1 flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-500" /> Out-of-Stock SKUs
                </h2>
                <p className="text-sm text-gray-400 mb-4">Store SOH = 0, flagged as OOS</p>
                <SkuTable filters={filters} flagFilter="oos" />
              </div>
            )}

            {/* No Sales */}
            {nav === "nosales" && (
              <div>
                <h2 className="text-base font-bold text-gray-800 mb-1 flex items-center gap-2">
                  <TrendingDown size={16} style={{ color: ORANGE }} /> No Sales SKUs
                </h2>
                <p className="text-sm text-gray-400 mb-4">Zero sell-out in last 4 weeks</p>
                <SkuTable filters={filters} flagFilter="nosales" />
              </div>
            )}

            {/* Negative SOH */}
            {nav === "negative" && (
              <div>
                <h2 className="text-base font-bold text-gray-800 mb-1 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-yellow-500" /> Negative SOH SKUs
                </h2>
                <p className="text-sm text-gray-400 mb-4">Store SOH below zero — data or execution issues</p>
                <SkuTable filters={filters} flagFilter="negative" />
              </div>
            )}

            {/* Store Performance */}
            {nav === "stores" && (
              <div className={drillStore ? "" : "h-[calc(100vh-100px)] flex flex-col"}>
                {drillStore ? (
                  <>
                    <button onClick={() => setDrillStore(null)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4" data-testid="btn-back-stores">
                      <ArrowLeft size={14} /> All Stores
                    </button>
                    <h2 className="text-base font-bold text-gray-800 mb-4">{drillStore} — SKU Breakdown</h2>
                    <SkuTable filters={filters} drillStore={drillStore} />
                  </>
                ) : (
                  <>
                    <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2 flex-shrink-0">
                      <Store size={16} className="text-blue-600" /> Store Performance
                    </h2>
                    <StoreTable filters={filters} onDrill={store => { setDrillStore(store); }} />
                  </>
                )}
              </div>
            )}

            {/* All SKUs */}
            {nav === "skus" && (
              <div>
                <h2 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <ShoppingCart size={16} className="text-blue-600" /> All SKUs
                </h2>
                <SkuTable filters={filters} />
              </div>
            )}

            {/* Sync */}
            {nav === "sync" && <SyncPanel />}
          </div>
        </div>
      </main>
    </div>
  );
}
