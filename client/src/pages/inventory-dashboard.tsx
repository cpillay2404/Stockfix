import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, BarChart3, Package, RefreshCw, ShoppingCart, Store, TrendingDown, X, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";

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

type NavSection = "overview" | "oos" | "nosales" | "negative" | "skus" | "sync";

// ─── API calls ────────────────────────────────────────────────────────────────

const apiFetch = (url: string) => fetch(url).then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); });

const qs = (f: Filters, extra?: Record<string, string>) => {
  const p = new URLSearchParams();
  if (f.client) p.set("client", f.client);
  if (f.banner) p.set("banner", f.banner);
  if (f.region) p.set("region", f.region);
  if (f.week) p.set("week", f.week);
  if (extra) Object.entries(extra).forEach(([k, v]) => v && p.set(k, v));
  const s = p.toString();
  return s ? "?" + s : "";
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-mono font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function FilterBar({ options, filters, onChange }: { options: FilterOptions; filters: Filters; onChange: (f: Filters) => void }) {
  const sel = "h-8 text-sm border border-gray-200 rounded-lg px-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500";
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
          className="flex items-center gap-1 h-8 px-2 text-xs text-gray-500 hover:text-red-500 border border-gray-200 rounded-lg bg-white" data-testid="btn-clear-filters">
          <X size={12} /> Clear
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
        {active ? (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : <ChevronDown size={12} className="opacity-20" />}
      </span>
    </th>
  );
}

function FlagBadge({ flag, label }: { flag: number | boolean | null; label: string }) {
  const on = flag === 1 || flag === true;
  if (!on) return null;
  return <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">{label}</span>;
}

function ClassificationBadge({ val }: { val: string | null }) {
  if (!val) return null;
  const lower = val.toLowerCase();
  const color = lower.includes("oos") ? "bg-red-100 text-red-700"
    : lower.includes("no sales") || lower.includes("no_sales") ? "bg-orange-100 text-orange-700"
    : lower.includes("low") ? "bg-yellow-100 text-yellow-700"
    : lower.includes("healthy") || lower.includes("ok") ? "bg-green-100 text-green-700"
    : "bg-gray-100 text-gray-600";
  return <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${color}`}>{val}</span>;
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
    <div>
      <div className="mb-3 flex items-center gap-2">
        <input className="h-8 px-3 text-sm border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search store or banner…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-store-search" />
        <span className="text-xs text-gray-400">{sorted.length} stores</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm bg-white">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <SortableHeader label="Store" col="storeName" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Banner" col="banner" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Rep" col="repName" sort={sort} onSort={toggleSort} />
              <SortableHeader label="SKUs" col="skuCount" sort={sort} onSort={toggleSort} />
              <SortableHeader label="OOS" col="oosSkuCount" sort={sort} onSort={toggleSort} />
              <SortableHeader label="No Sales" col="noSalesSkuCount" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Neg SOH" col="negativeSohSkuCount" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Store SOH" col="totalStoreSoh" sort={sort} onSort={toggleSort} />
              <SortableHeader label="DC SOH" col="totalDcSoh" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Sales P4" col="totalSalesP4" sort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors"
                onClick={() => onDrill(row.storeName)} data-testid={`row-store-${i}`}>
                <td className="px-3 py-2 font-medium text-blue-700 hover:underline">{row.storeName}</td>
                <td className="px-3 py-2 text-gray-600">{row.banner}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{row.repName}</td>
                <td className="px-3 py-2 text-center font-mono">{fmt(row.skuCount)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`font-mono font-semibold ${row.oosSkuCount > 0 ? "text-red-600" : "text-gray-400"}`}>{fmt(row.oosSkuCount)}</span>
                  {row.skuCount > 0 && <span className="ml-1 text-xs text-gray-400">{pct(row.oosSkuCount, row.skuCount)}</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`font-mono font-semibold ${row.noSalesSkuCount > 0 ? "text-orange-600" : "text-gray-400"}`}>{fmt(row.noSalesSkuCount)}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`font-mono font-semibold ${row.negativeSohSkuCount > 0 ? "text-yellow-600" : "text-gray-400"}`}>{fmt(row.negativeSohSkuCount)}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmt(row.totalStoreSoh, 0)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmt(row.totalDcSoh, 0)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmt(row.totalSalesP4, 0)}</td>
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

  const filtered = useMemo(() => {
    return data.filter(r =>
      !search || r.articleDescription?.toLowerCase().includes(search.toLowerCase()) ||
      r.barcode?.includes(search) || r.brand?.toLowerCase().includes(search.toLowerCase()) ||
      r.storeName?.toLowerCase().includes(search.toLowerCase())
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = (a as any)[sort.col] ?? 0, bv = (b as any)[sort.col] ?? 0;
      return sort.dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [filtered, sort]);

  const paged = sorted.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.ceil(sorted.length / PAGE);
  const toggleSort = (col: string) => { setPage(0); setSort(s => ({ col, dir: s.col === col && s.dir === "desc" ? "asc" : "desc" })); };

  if (isLoading) return <div className="flex items-center justify-center h-40 text-gray-400">Loading SKUs…</div>;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <input className="h-8 px-3 text-sm border border-gray-200 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Search article, barcode, brand…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} data-testid="input-sku-search" />
        <span className="text-xs text-gray-400">{sorted.length.toLocaleString()} SKUs • page {page + 1}/{Math.max(1, totalPages)}</span>
        <div className="flex gap-1 ml-auto">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="h-7 px-2 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50" data-testid="btn-prev-page">Prev</button>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            className="h-7 px-2 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50" data-testid="btn-next-page">Next</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm bg-white min-w-[900px]">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <SortableHeader label="Article" col="articleDescription" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Brand" col="brand" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Store" col="storeName" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Banner" col="banner" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Region" col="region" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Store SOH" col="storeSoh" sort={sort} onSort={toggleSort} />
              <SortableHeader label="DC SOH" col="dcSoh" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Sell P4" col="sellOutP4" sort={sort} onSort={toggleSort} />
              <SortableHeader label="Open PO" col="openPoQty" sort={sort} onSort={toggleSort} />
              <SortableHeader label="WFC" col="wfc" sort={sort} onSort={toggleSort} />
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Classification</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Flags</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={row.id ?? i} className="border-b border-gray-50 hover:bg-blue-50 transition-colors" data-testid={`row-sku-${i}`}>
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-800 text-xs">{row.articleDescription}</div>
                  <div className="text-gray-400 text-xs font-mono">{row.barcode}</div>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">{row.brand}</td>
                <td className="px-3 py-2 text-xs">{row.storeName}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{row.banner}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{row.region}</td>
                <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                  <span className={row.storeSoh <= 0 ? "text-red-600" : row.storeSoh < 5 ? "text-orange-500" : "text-gray-700"}>{fmt(row.storeSoh, 1)}</span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmt(row.dcSoh, 0)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmt(row.sellOutP4, 0)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{fmt(row.openPoQty, 0)}</td>
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
              <tr><td colSpan={12} className="px-3 py-8 text-center text-gray-400">No SKUs found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sync Panel ───────────────────────────────────────────────────────────────

interface ClientRow { client: string; stores: number; skus: number; latest_week: string; synced_at: string; }

type BrowseItem =
  | { type: "folder"; name: string; id: string }
  | { type: "file";   name: string; id: string; size: number };

type NavEntry = { label: string; itemId?: string; path?: string };

function SyncPanel() {
  const queryClient = useQueryClient();
  // navigation stack: each entry has a display label + either itemId (preferred) or path
  const [navStack, setNavStack] = useState<NavEntry[]>([{ label: "My OneDrive", path: "." }]);
  const currentNav = navStack[navStack.length - 1];

  const [browseItems, setBrowseItems] = useState<BrowseItem[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const [selectedFile, setSelectedFile] = useState<{ id: string; name: string; folderLabel: string } | null>(null);
  const [resyncingClient, setResyncingClient] = useState<string | null>(null);

  const { data: log } = useQuery<SyncLog | null>({
    queryKey: ["inv-sync-log"],
    queryFn: () => apiFetch("/api/inventory/sync-status"),
    staleTime: 30000,
  });

  const { data: clients = [] } = useQuery<ClientRow[]>({
    queryKey: ["inv-clients"],
    queryFn: () => apiFetch("/api/inventory/clients"),
    staleTime: 30000,
  });

  const invalidateAll = () => {
    ["inv-stores","inv-skus","inv-kpis","inv-filters","inv-sync-log","inv-clients"].forEach(k =>
      queryClient.invalidateQueries({ queryKey: [k] })
    );
  };

  const syncFileMut = useMutation({
    mutationFn: (body: { fileId?: string; drivePath?: string; label?: string }) =>
      fetch("/api/inventory/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => { invalidateAll(); setSelectedFile(null); setResyncingClient(null); },
  });

  const isSyncing = syncFileMut.isPending;

  const browse = async (nav: NavEntry) => {
    setBrowsing(true);
    setBrowseError("");
    setBrowseItems([]);
    setSelectedFile(null);
    try {
      const qs = nav.itemId
        ? `itemId=${encodeURIComponent(nav.itemId)}`
        : `path=${encodeURIComponent(nav.path || ".")}`;
      const r = await fetch(`/api/inventory/browse?${qs}`);
      const data = await r.json();
      if (data.error) { setBrowseError(data.error); setBrowsing(false); return; }
      const items: BrowseItem[] = [
        ...(data.folders || []).map((f: any) => ({ type: "folder" as const, name: f.name, id: f.id })),
        ...(data.files  || []).map((f: any) => ({ type: "file"   as const, name: f.name, id: f.id, size: f.size })),
      ];
      setBrowseItems(items);
    } catch (e: any) { setBrowseError(e.message); }
    setBrowsing(false);
  };

  const openFolder = (item: { name: string; id: string }) => {
    const entry: NavEntry = { label: item.name, itemId: item.id };
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
    syncFileMut.mutate({ fileId: undefined, drivePath: `Client Service Team - SOH Weekly Updates/${c.client}/Inventory_Combined.parquet`, label: c.client });
  };

  const breadcrumb = navStack.map(n => n.label).join(" › ");

  return (
    <div className="max-w-2xl space-y-5">
      <h2 className="text-lg font-bold text-gray-800">Data Sync</h2>

      {/* Loaded clients */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Currently Loaded Clients</h3>
        {clients.length === 0 ? (
          <p className="text-sm text-gray-400">No data loaded yet. Use the browser below to add a client.</p>
        ) : (
          <div className="space-y-2">
            {clients.map(c => (
              <div key={c.client} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg" data-testid={`client-row-${c.client}`}>
                <div>
                  <span className="font-semibold text-gray-800">{c.client}</span>
                  <span className="ml-3 text-xs text-gray-500">
                    {Number(c.stores).toLocaleString()} stores · {Number(c.skus).toLocaleString()} SKUs · week {fmtWeek(c.latest_week)}
                  </span>
                </div>
                <button
                  onClick={() => handleResync(c)}
                  disabled={isSyncing}
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

      {/* File browser */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Add / Update a Client</h3>
          <button
            onClick={() => browse(currentNav)}
            disabled={browsing}
            className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40 flex items-center gap-1"
            data-testid="btn-open-browser">
            <RefreshCw size={11} className={browsing ? "animate-spin" : ""} />
            {browseItems.length === 0 && !browsing ? "Open file browser" : "Refresh"}
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Browse your OneDrive to find the parquet file for the next client. Click folders to navigate, then select the file to sync.
        </p>

        {/* Breadcrumb + up button */}
        {browseItems.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {navStack.length > 1 && (
              <button onClick={goUp} className="hover:text-blue-600" data-testid="btn-go-up">← Back</button>
            )}
            <span className="font-mono truncate">{breadcrumb}</span>
          </div>
        )}

        {browseError && <div className="text-xs text-red-600">{browseError}</div>}

        {browseItems.length > 0 && (
          <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {browseItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.type === "folder") { openFolder(item); }
                  else { setSelectedFile({ id: item.id, name: item.name, folderLabel: currentNav.label }); }
                }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-blue-50 transition-colors
                  ${item.type === "file" && selectedFile?.id === item.id ? "bg-blue-50 text-blue-700" : "text-gray-700"}`}
                data-testid={`browse-item-${item.name}`}>
                <span className="text-base leading-none">{item.type === "folder" ? "📁" : "📄"}</span>
                <span className="flex-1 text-xs font-mono">{item.name}</span>
                {item.type === "file" && (
                  <span className="text-xs text-gray-400">{(item.size / 1024 / 1024).toFixed(1)} MB</span>
                )}
                {item.type === "folder" && <span className="text-xs text-gray-400">›</span>}
              </button>
            ))}
          </div>
        )}

        {selectedFile && (
          <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
            <div className="flex-1 text-sm text-blue-800 truncate">
              Selected: <strong>{selectedFile.name}</strong>
              <span className="text-xs ml-2 opacity-60">from {selectedFile.folderLabel}</span>
            </div>
            <button
              onClick={() => syncFileMut.mutate({ fileId: selectedFile.id, label: selectedFile.folderLabel })}
              disabled={isSyncing}
              className="h-7 px-3 text-xs bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
              data-testid="btn-sync-selected">
              <RefreshCw size={11} className={syncFileMut.isPending ? "animate-spin" : ""} />
              {syncFileMut.isPending ? "Syncing…" : "Sync This File"}
            </button>
          </div>
        )}
      </div>

      {/* Status */}
      {isSyncing && (
        <div className="rounded-lg p-3 bg-blue-50 text-blue-800 text-sm flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin flex-shrink-0" />
          Syncing from SharePoint… this may take 1–2 minutes for large files.
        </div>
      )}

      {syncFileMut.data?.error && !isSyncing && (
        <div className="rounded-lg p-3 bg-red-50 text-red-800 text-sm">{syncFileMut.data.error}</div>
      )}

      {log && !isSyncing && (
        <div className={`rounded-lg p-3 text-sm ${log.status === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          <div className="font-semibold mb-1">{log.status === "ok" ? "✓ Last sync successful" : "✗ Last sync failed"}</div>
          <div className="text-xs space-y-0.5 opacity-80">
            <div>{new Date(log.syncedAt).toLocaleString("en-ZA")}</div>
            {log.storeRows != null && <div>{log.storeRows?.toLocaleString()} store rows · {log.skuRows?.toLocaleString()} SKU rows · {((log.durationMs || 0) / 1000).toFixed(1)}s</div>}
            {log.error && <div className="text-red-600 mt-1">{log.error}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InventoryDashboard() {
  const [nav, setNav] = useState<NavSection>("overview");
  const [filters, setFilters] = useState<Filters>({ client: "", banner: "", region: "", week: "" });
  const [drillStore, setDrillStore] = useState<string | null>(null);

  const { data: filterOptions = { clients: [], banners: [], regions: [], weeks: [] } } = useQuery<FilterOptions>({
    queryKey: ["inv-filters", filters.client],
    queryFn: () => apiFetch(`/api/inventory/filters${filters.client ? `?client=${encodeURIComponent(filters.client)}` : ""}`),
    staleTime: 120000,
  });

  const { data: kpis, isLoading: kpisLoading } = useQuery<KPIs>({
    queryKey: ["inv-kpis", filters],
    queryFn: () => apiFetch(`/api/inventory/kpis${qs(filters)}`),
    staleTime: 60000,
  });

  const NAV: { id: NavSection; label: string; icon: any; color?: string }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "oos", label: "OOS Monitor", icon: AlertCircle, color: "text-red-400" },
    { id: "nosales", label: "No Sales", icon: TrendingDown, color: "text-orange-400" },
    { id: "negative", label: "Negative SOH", icon: Package, color: "text-yellow-400" },
    { id: "skus", label: "All SKUs", icon: ShoppingCart },
    { id: "sync", label: "Sync Data", icon: RefreshCw },
  ];

  const weekLabel = kpis?.weekEnding ? `Week ending ${fmtWeek(kpis.weekEnding)}` : "";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-[#1e3a5f] text-white flex flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">StockFix</div>
          <div className="text-base font-bold">Inventory Hub</div>
          {weekLabel && <div className="text-xs text-white/50 mt-1">{weekLabel}</div>}
        </div>
        <nav className="flex-1 py-3">
          {NAV.map(item => {
            const Icon = item.icon;
            const active = nav === item.id;
            return (
              <button key={item.id} onClick={() => { setNav(item.id); setDrillStore(null); }}
                className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors text-left
                  ${active ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5"}`}
                data-testid={`nav-${item.id}`}>
                <Icon size={15} className={active ? "text-[#f97316]" : item.color ?? "text-white/40"} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <a href="/" className="text-xs text-white/40 hover:text-white/70 transition-colors">← Back to StockFix</a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex-1">
            <FilterBar options={filterOptions} filters={filters} onChange={f => { setFilters(f); setDrillStore(null); }} />
          </div>
        </header>

        <div className="px-6 py-5">

          {/* KPI row — always visible */}
          {(nav === "overview" || nav === "oos" || nav === "nosales" || nav === "negative") && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
              <KpiCard label="Stores" value={kpisLoading ? "…" : fmt(kpis?.storeCount)} color="text-blue-700" />
              <KpiCard label="Total SKUs" value={kpisLoading ? "…" : fmt(kpis?.totalSkus)} color="text-gray-800" />
              <KpiCard label="OOS SKUs" value={kpisLoading ? "…" : fmt(kpis?.oosCount)}
                sub={kpis ? pct(kpis.oosCount, kpis.totalSkus) : undefined} color="text-red-600" />
              <KpiCard label="No Sales" value={kpisLoading ? "…" : fmt(kpis?.noSalesCount)}
                sub={kpis ? pct(kpis.noSalesCount, kpis.totalSkus) : undefined} color="text-orange-500" />
              <KpiCard label="Neg SOH" value={kpisLoading ? "…" : fmt(kpis?.negativeSohCount)}
                sub={kpis ? pct(kpis.negativeSohCount, kpis.totalSkus) : undefined} color="text-yellow-600" />
              <KpiCard label="Store SOH" value={kpisLoading ? "…" : fmt(kpis?.totalStoreSoh)} color="text-gray-700" />
              <KpiCard label="DC SOH" value={kpisLoading ? "…" : fmt(kpis?.totalDcSoh)} color="text-gray-700" />
            </div>
          )}

          {/* Overview */}
          {nav === "overview" && (
            <>
              {drillStore ? (
                <div>
                  <button onClick={() => setDrillStore(null)}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4" data-testid="btn-back-stores">
                    <ArrowLeft size={14} /> All Stores
                  </button>
                  <h2 className="text-lg font-bold text-gray-800 mb-4">{drillStore} — SKU Breakdown</h2>
                  <SkuTable filters={filters} drillStore={drillStore} />
                </div>
              ) : (
                <div>
                  <h2 className="text-lg font-bold text-gray-800 mb-4">Store Performance</h2>
                  <StoreTable filters={filters} onDrill={setDrillStore} />
                </div>
              )}
            </>
          )}

          {/* OOS Monitor */}
          {nav === "oos" && (
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <AlertCircle size={18} className="text-red-500" /> Out-of-Stock SKUs
              </h2>
              <p className="text-sm text-gray-500 mb-4">Store SOH = 0, flagged as OOS</p>
              <SkuTable filters={filters} flagFilter="oos" />
            </div>
          )}

          {/* No Sales */}
          {nav === "nosales" && (
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <TrendingDown size={18} className="text-orange-500" /> No Sales SKUs
              </h2>
              <p className="text-sm text-gray-500 mb-4">Zero sell-out in last 4 weeks</p>
              <SkuTable filters={filters} flagFilter="nosales" />
            </div>
          )}

          {/* Negative SOH */}
          {nav === "negative" && (
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <Package size={18} className="text-yellow-500" /> Negative SOH SKUs
              </h2>
              <p className="text-sm text-gray-500 mb-4">Store SOH below zero — data integrity issues</p>
              <SkuTable filters={filters} flagFilter="negative" />
            </div>
          )}

          {/* All SKUs */}
          {nav === "skus" && (
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Store size={18} className="text-blue-600" /> All SKUs
              </h2>
              <SkuTable filters={filters} />
            </div>
          )}

          {/* Sync */}
          {nav === "sync" && <SyncPanel />}
        </div>
      </main>
    </div>
  );
}
