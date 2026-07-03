import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  Users, ClipboardCheck, CheckCircle2, Gauge, Store as StoreIcon, Trophy,
  ArrowLeft, Search, ChevronRight, TrendingUp, TrendingDown,
  Package, Filter, X, ImageOff, ExternalLink, Download,
} from "lucide-react";
import shopriteCheckersLogo from "@assets/image_1783089822744.png";
import meridianLogo from "@assets/Meridian_Logo_update-02_1783095474731.png";
import { Tooltip as UITooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <UITooltip delayDuration={300}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </UITooltip>
  );
}

// ─── Types ──────────────────────────────────────────────────────────
interface SFStore { name: string; tasks: number; completed: number; captureRate: number; clients: string[] }
interface Merchandiser {
  name: string;
  lineManager: string | null;
  region: string | null;
  overallRate: number;
  stockFix: { tasks: number; completed: number; captureRate: number; stores: SFStore[] } | null;
}
interface WeekSnapshot { weekEndingDate: string; repCount: number; totalTasks: number; totalCompleted: number; captureRate: number }
interface BreakdownStat { total: number; completed: number; captureRate: number }
interface MerchRank { name: string; lineManager: string | null; region: string | null; pctStoresActioned: number; pctItemsActioned: number }
interface TaskDetailRow {
  uniqueId: string;
  storeName: string;
  repName: string;
  articleDescription: string;
  barcode: string;
  storeSoh: string | number | null;
  storeWfc: string | number | null;
  action: string;
  actionStatus: string;
  reasonCode: string;
  feedback: string;
  imageUrl: string | null;
}
interface PilotReport {
  latestWeek: string | null;
  filters: {
    managers: string[]; regions: string[]; stores: string[]; banners: string[]; reps: string[]; weeks: string[];
    active: { manager: string | null; region: string | null; store: string | null; banner: string | null; rep: string | null; week: string | null };
  };
  summary: { stockFix: { total: number; completed: number; captureRate: number }; activeReps: number };
  merchandisers: Merchandiser[];
  managerBreakdown: (BreakdownStat & { manager: string })[];
  regionBreakdown: (BreakdownStat & { region: string })[];
  top5Merchandisers: MerchRank[];
  bottom5Merchandisers: MerchRank[];
  taskDetail: TaskDetailRow[];
  history: WeekSnapshot[];
}

interface StoreAgg {
  name: string;
  tasks: number;
  completed: number;
  captureRate: number;
  reps: { name: string; tasks: number; completed: number; captureRate: number }[];
}

interface Filters { manager: string; region: string; store: string; banner: string; rep: string; week: string }

// ─── Helpers ────────────────────────────────────────────────────────
function tc(s: string) { return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

function rateGradient(r: number) {
  if (r >= 80) return "from-emerald-400 to-teal-500";
  if (r >= 60) return "from-cyan-400 to-blue-500";
  if (r >= 40) return "from-amber-400 to-orange-500";
  if (r > 0) return "from-rose-500 to-red-600";
  return "from-slate-600 to-slate-700";
}
function rateText(r: number) {
  if (r >= 80) return "text-emerald-400";
  if (r >= 60) return "text-cyan-400";
  if (r >= 40) return "text-amber-400";
  if (r > 0) return "text-rose-400";
  return "text-slate-500";
}
function fmtDate(d: string) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "2-digit" });
}
function fmtNum(n: number) { return n.toLocaleString("en-ZA"); }

// ─── Reusable bits ──────────────────────────────────────────────────
function GlowBar({ rate }: { rate: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-white/5">
        <div
          className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${rateGradient(rate)} shadow-[0_0_8px_rgba(56,189,248,0.5)]`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <span className={`text-xs font-bold tabular-nums ${rateText(rate)}`}>{rate}%</span>
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, sub, accent, delay = 0 }: {
  icon: any; label: string; value: string | number; sub?: string; accent: string; delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-xl transition-all hover:border-white/[0.12] hover:bg-white/[0.04]"
    >
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${accent} opacity-[0.12] blur-2xl transition-opacity group-hover:opacity-25`} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-extrabold tracking-tight text-white tabular-nums">{value}</div>
          {sub && <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>}
        </div>
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${accent} shadow-lg`}>
          <Icon className="h-3.5 w-3.5 text-white" strokeWidth={2.2} />
        </div>
      </div>
    </motion.div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-1 font-semibold text-slate-300">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5" style={{ color: p.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-bold">{fmtNum(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function FilterBar({ filters, active, onChange, onReset }: {
  filters: PilotReport["filters"]; active: Filters; onChange: (f: Filters) => void; onReset: () => void;
}) {
  const hasActive = !!(active.manager || active.region || active.store || active.banner || active.rep || active.week);
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="mb-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 backdrop-blur-xl"
    >
      <div className="flex items-center gap-1.5 pr-1 text-xs font-semibold text-slate-400">
        <Filter className="h-3.5 w-3.5 text-cyan-400" /> Filters
      </div>
      <Hint label="Filter all data by line manager">
        <select
          value={active.manager}
          onChange={e => onChange({ ...active, manager: e.target.value })}
          data-testid="select-filter-manager"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-300 outline-none focus:border-cyan-500/50"
        >
          <option value="" className="bg-slate-900">All Line Managers</option>
          {filters.managers.map(m => <option key={m} value={m} className="bg-slate-900">{tc(m)}</option>)}
        </select>
      </Hint>
      <Hint label="Filter all data by region">
        <select
          value={active.region}
          onChange={e => onChange({ ...active, region: e.target.value })}
          data-testid="select-filter-region"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-300 outline-none focus:border-cyan-500/50"
        >
          <option value="" className="bg-slate-900">All Regions</option>
          {filters.regions.map(r => <option key={r} value={r} className="bg-slate-900">{tc(r)}</option>)}
        </select>
      </Hint>
      <Hint label="Filter all data by store">
        <select
          value={active.store}
          onChange={e => onChange({ ...active, store: e.target.value })}
          data-testid="select-filter-store"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-300 outline-none focus:border-cyan-500/50"
        >
          <option value="" className="bg-slate-900">All Stores</option>
          {filters.stores.map(s => <option key={s} value={s} className="bg-slate-900">{tc(s)}</option>)}
        </select>
      </Hint>
      <Hint label="Filter all data by banner">
        <select
          value={active.banner}
          onChange={e => onChange({ ...active, banner: e.target.value })}
          data-testid="select-filter-banner"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-300 outline-none focus:border-cyan-500/50"
        >
          <option value="" className="bg-slate-900">All Banners</option>
          {filters.banners.map(b => <option key={b} value={b} className="bg-slate-900">{tc(b)}</option>)}
        </select>
      </Hint>
      <Hint label="Filter all data by merchandiser">
        <select
          value={active.rep}
          onChange={e => onChange({ ...active, rep: e.target.value })}
          data-testid="select-filter-rep"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-300 outline-none focus:border-cyan-500/50"
        >
          <option value="" className="bg-slate-900">All Merchandisers</option>
          {filters.reps.map(r => <option key={r} value={r} className="bg-slate-900">{tc(r)}</option>)}
        </select>
      </Hint>
      <Hint label="Filter all data by week ending">
        <select
          value={active.week}
          onChange={e => onChange({ ...active, week: e.target.value })}
          data-testid="select-filter-week"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-300 outline-none focus:border-cyan-500/50"
        >
          <option value="" className="bg-slate-900">All Weeks</option>
          {filters.weeks.map(w => <option key={w} value={w} className="bg-slate-900">{fmtDate(w)}</option>)}
        </select>
      </Hint>
      {hasActive && (
        <Hint label="Reset all filters">
          <button
            onClick={onReset}
            data-testid="button-clear-filters"
            className="ml-auto flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </Hint>
      )}
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const done = status.toLowerCase() === "completed";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
      done ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
    }`}>
      {status || "Pending"}
    </span>
  );
}

const TASK_CSV_COLUMNS: { key: keyof TaskDetailRow; header: string }[] = [
  { key: "storeName", header: "Store" },
  { key: "repName", header: "Merchandiser" },
  { key: "articleDescription", header: "Article" },
  { key: "barcode", header: "Barcode" },
  { key: "storeSoh", header: "SOH" },
  { key: "storeWfc", header: "WFC" },
  { key: "action", header: "Action" },
  { key: "actionStatus", header: "Status" },
  { key: "reasonCode", header: "Reason Code" },
  { key: "feedback", header: "Feedback" },
  { key: "imageUrl", header: "Image URL" },
];

function exportTasksToCsv(rows: TaskDetailRow[]) {
  const escapeCsv = (val: unknown) => {
    const s = val === null || val === undefined ? "" : String(val);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = TASK_CSV_COLUMNS.map(c => c.header).join(",");
  const lines = rows.map(r => TASK_CSV_COLUMNS.map(c => escapeCsv(r[c.key])).join(","));
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `store-performance-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function TaskDetailTable({ rows, onSelectStore, showStoreColumn = true }: {
  rows: TaskDetailRow[]; onSelectStore?: (name: string) => void; showStoreColumn?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 40;

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toUpperCase();
    return rows.filter(r =>
      r.storeName.toUpperCase().includes(q) ||
      (r.repName ?? "").toUpperCase().includes(q) ||
      r.articleDescription.toUpperCase().includes(q) ||
      r.barcode.toUpperCase().includes(q)
    );
  }, [rows, search]);

  const visible = filtered.slice(0, (page + 1) * pageSize);

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-white/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Store Performance</h3>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-slate-400">{fmtNum(filtered.length)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Hint label="Download the currently visible rows as a CSV file">
            <button
              onClick={() => exportTasksToCsv(filtered)}
              data-testid="button-export-csv"
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </Hint>
          <Hint label="Search by store name, article description, or barcode">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search store, merchandiser, article, barcode..."
                data-testid="input-search-tasks"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-600 outline-none focus:border-cyan-500/50 sm:w-64"
              />
            </div>
          </Hint>
        </div>
      </div>

      <div className="max-h-[620px] overflow-auto">
        {visible.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-600">
            {rows.length === 0 ? "No task activity yet — waiting on StockFix data for pilot merchandisers." : "No tasks match your search."}
          </div>
        ) : (
          <table className="w-full min-w-[1250px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#0b0f1a]">
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {showStoreColumn && <th className="px-3 py-1.5">Store</th>}
                <th className="px-3 py-1.5">Merchandiser</th>
                <th className="px-3 py-1.5">Article</th>
                <th className="px-3 py-1.5">Barcode</th>
                <th className="px-3 py-1.5 text-center">SOH</th>
                <th className="px-3 py-1.5 text-center">WFC</th>
                <th className="px-3 py-1.5">Action</th>
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5">Reason Code</th>
                <th className="px-3 py-1.5">Feedback</th>
                <th className="px-3 py-1.5 text-center">Image</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={`${r.uniqueId}-${i}`} className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]" data-testid={`row-task-${r.uniqueId}`}>
                  {showStoreColumn && (
                    onSelectStore ? (
                      <Hint label="View store-level detail">
                        <td
                          className="px-3 py-1.5 font-semibold text-white cursor-pointer hover:text-cyan-400"
                          onClick={() => onSelectStore(r.storeName)}
                        >
                          {tc(r.storeName)}
                        </td>
                      </Hint>
                    ) : (
                      <td className="px-3 py-1.5 font-semibold text-white">{tc(r.storeName)}</td>
                    )
                  )}
                  <td className="px-3 py-1.5 text-slate-300">{r.repName ? tc(r.repName) : "—"}</td>
                  <td className="max-w-[220px] truncate px-3 py-1.5 text-slate-300" title={r.articleDescription}>{r.articleDescription || "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-slate-400">{r.barcode || "—"}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums text-slate-300">{r.storeSoh ?? "—"}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums text-slate-300">{r.storeWfc ?? "—"}</td>
                  <td className="max-w-[160px] truncate px-3 py-1.5 text-slate-300" title={r.action}>{r.action || "—"}</td>
                  <td className="px-3 py-1.5"><StatusBadge status={r.actionStatus} /></td>
                  <td className="px-3 py-1.5 text-slate-400">{r.reasonCode || "—"}</td>
                  <td className="max-w-[200px] truncate px-3 py-1.5 text-slate-400" title={r.feedback}>{r.feedback || "—"}</td>
                  <td className="px-3 py-1.5 text-center">
                    {r.imageUrl ? (
                      <Hint label="Open feedback photo in a new tab">
                        <a href={r.imageUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-image-${r.uniqueId}`} className="inline-flex text-cyan-400 hover:text-cyan-300">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Hint>
                    ) : (
                      <Hint label="No photo attached">
                        <span className="inline-flex"><ImageOff className="mx-auto h-3.5 w-3.5 text-slate-700" /></span>
                      </Hint>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {visible.length < filtered.length && (
        <div className="flex justify-center border-t border-white/[0.06] p-2">
          <Hint label="Show more rows">
            <button
              onClick={() => setPage(p => p + 1)}
              data-testid="button-load-more-tasks"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/[0.08]"
            >
              Load more ({filtered.length - visible.length} remaining)
            </button>
          </Hint>
        </div>
      )}
    </>
  );
}

function BreakdownTable({ title, icon: Icon, accent, rows }: {
  title: string; icon: any; accent: string; rows: { label: string; total: number; completed: number; captureRate: number }[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] p-3">
        <Icon className={`h-4 w-4 ${accent}`} />
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-slate-400">{rows.length}</span>
      </div>
      <div className="max-h-[220px] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-slate-600">No data yet</div>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody>
              {rows.map(r => (
                <tr key={r.label} className="border-t border-white/[0.04] first:border-t-0">
                  <td className="px-4 py-1.5 font-medium text-slate-300">{tc(r.label)}</td>
                  <td className="px-4 py-1.5 text-right text-[11px] text-slate-500 tabular-nums">{fmtNum(r.completed)}/{fmtNum(r.total)}</td>
                  <td className="w-32 px-4 py-1.5"><GlowBar rate={r.captureRate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );
}

function MerchRankTable({ title, icon: Icon, accent, rows }: { title: string; icon: any; accent: string; rows: MerchRank[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 border-b border-white/[0.06] p-3">
        <Icon className={`h-4 w-4 ${accent}`} />
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-slate-600">No data yet</div>
        ) : (
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-1.5">Merchandiser</th>
                <th className="px-4 py-1.5">Line Manager</th>
                <th className="px-4 py-1.5">Region</th>
                <th className="px-4 py-1.5 text-center">% Stores</th>
                <th className="px-4 py-1.5">% Items</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name} className="border-t border-white/[0.04]" data-testid={`row-merch-${r.name}`}>
                  <td className="px-4 py-1.5 font-semibold text-white">{tc(r.name)}</td>
                  <td className="px-4 py-1.5 text-slate-400">{r.lineManager ? tc(r.lineManager) : "—"}</td>
                  <td className="px-4 py-1.5 text-slate-400">{r.region ? tc(r.region) : "—"}</td>
                  <td className="px-4 py-1.5 text-center tabular-nums text-slate-300">{r.pctStoresActioned}%</td>
                  <td className="px-4 py-1.5"><GlowBar rate={r.pctItemsActioned} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  );
}

// ─── Overview Page ──────────────────────────────────────────────────
function OverviewPage({ data, onSelectStore, filters, onFilterChange, onFilterReset }: {
  data: PilotReport; onSelectStore: (name: string) => void;
  filters: Filters; onFilterChange: (f: Filters) => void; onFilterReset: () => void;
}) {
  const totalMerchandisers = data.merchandisers.length;
  const activeReps = data.summary.activeReps;
  const coverage = totalMerchandisers > 0 ? Math.round((activeReps / totalMerchandisers) * 100) : 0;
  const storesCovered = new Set(data.taskDetail.map(t => t.storeName)).size;

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-4 md:px-8">
      {/* Hero header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-3"
      >
        <div className="mb-1.5 flex items-center gap-2">
          <img src={shopriteCheckersLogo} alt="Shoprite & Checkers" className="h-6 w-auto rounded-md shadow-lg shadow-black/40" data-testid="img-retailer-logo" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">Merchandiser Pilot</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="bg-gradient-to-r from-white via-white to-slate-400 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent">
            Field Coverage Overview
          </h1>
          <img src={meridianLogo} alt="Meridian Sales & Merchandising Experts" className="h-20 w-auto shrink-0" data-testid="img-meridian-logo" />
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Live StockFix task performance across {fmtNum(totalMerchandisers)} merchandisers in Shoprite &amp; Checkers stores
          {data.latestWeek && <> · Week ending {fmtDate(data.latestWeek)}</>}
        </p>
      </motion.div>

      <FilterBar filters={data.filters} active={filters} onChange={onFilterChange} onReset={onFilterReset} />

      {/* KPI grid */}
      <div className="mb-3 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile icon={Users} label="Active Merchandisers" value={fmtNum(activeReps)} sub={`of ${fmtNum(totalMerchandisers)} merchandisers`} accent="from-cyan-500 to-blue-600" delay={0} />
        <KpiTile icon={ClipboardCheck} label="Tasks Logged" value={fmtNum(data.summary.stockFix.total)} sub="total StockFix tasks" accent="from-violet-500 to-purple-600" delay={0.05} />
        <KpiTile icon={CheckCircle2} label="Completed" value={fmtNum(data.summary.stockFix.completed)} sub={`${data.summary.stockFix.captureRate}% rate`} accent="from-emerald-500 to-teal-600" delay={0.1} />
        <KpiTile icon={Gauge} label="Capture Rate" value={`${data.summary.stockFix.captureRate}%`} sub="overall completion" accent="from-amber-500 to-orange-600" delay={0.15} />
        <KpiTile icon={StoreIcon} label="Stores Covered" value={fmtNum(storesCovered)} sub="with logged tasks" accent="from-pink-500 to-rose-600" delay={0.2} />
        <KpiTile icon={Trophy} label="Pilot Coverage" value={`${coverage}%`} sub={`of ${fmtNum(totalMerchandisers)} merchandisers`} accent="from-indigo-500 to-violet-600" delay={0.25} />
      </div>

      {/* Manager / Region breakdown */}
      <div className="mb-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <BreakdownTable
          title="% Captured by Manager" icon={Users} accent="text-cyan-400"
          rows={data.managerBreakdown.map(m => ({ label: m.manager, total: m.total, completed: m.completed, captureRate: m.captureRate }))}
        />
        <BreakdownTable
          title="% Captured by Region" icon={StoreIcon} accent="text-violet-400"
          rows={data.regionBreakdown.map(r => ({ label: r.region, total: r.total, completed: r.completed, captureRate: r.captureRate }))}
        />
      </div>

      {/* Top 5 / Bottom 5 merchandisers */}
      <div className="mb-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <MerchRankTable title="Top 5 Merchandisers — Capture %" icon={TrendingUp} accent="text-emerald-400" rows={data.top5Merchandisers} />
        <MerchRankTable title="Bottom 5 Merchandisers — Capture %" icon={TrendingDown} accent="text-rose-400" rows={data.bottom5Merchandisers} />
      </div>

      {/* Store-level task detail */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl"
      >
        <TaskDetailTable rows={data.taskDetail} onSelectStore={onSelectStore} />
      </motion.div>
    </div>
  );
}

// ─── Store Detail Page ──────────────────────────────────────────────
function StoreDetailPage({ store, tasks, onBack }: { store: StoreAgg; tasks: TaskDetailRow[]; onBack: () => void }) {
  const repChartData = [...store.reps].sort((a, b) => b.tasks - a.tasks).slice(0, 10).map(r => ({
    name: tc(r.name).split(" ")[0], tasks: r.tasks, completed: r.completed, captureRate: r.captureRate,
  }));

  return (
    <div className="mx-auto max-w-[1600px] px-5 py-4 md:px-8">
      <Hint label="Return to the pilot overview">
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          onClick={onBack}
          data-testid="button-back-overview"
          className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-400 transition-colors hover:text-cyan-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
        </motion.button>
      </Hint>

      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="mb-3 flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-transparent p-4 backdrop-blur-xl md:flex-row md:items-center md:justify-between"
      >
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <img src={shopriteCheckersLogo} alt="Shoprite & Checkers" className="h-5 w-auto rounded shadow shadow-black/40" />
            <StoreIcon className="h-4 w-4 text-cyan-400" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">Store Detail</span>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-white" data-testid="text-store-name">{tc(store.name)}</h1>
          <p className="mt-1 text-xs text-slate-500">{store.reps.length} merchandiser{store.reps.length !== 1 ? "s" : ""} assigned</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-xl font-extrabold text-white tabular-nums">{fmtNum(store.tasks)}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tasks</div>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="text-center">
            <div className="text-xl font-extrabold text-emerald-400 tabular-nums">{fmtNum(store.completed)}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Completed</div>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="text-center">
            <div className={`text-xl font-extrabold tabular-nums ${rateText(store.captureRate)}`}>{store.captureRate}%</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Capture Rate</div>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <img src={meridianLogo} alt="Meridian Sales & Merchandising Experts" className="h-8 w-auto" data-testid="img-meridian-logo-store" />
        </div>
      </motion.div>

      <div className="mb-3 grid grid-cols-1 gap-2.5">
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl"
        >
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-bold text-white">Tasks by Merchandiser</h3>
          </div>
          {repChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={repChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Bar dataKey="tasks" name="Tasks" radius={[6, 6, 0, 0]}>
                  {repChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.captureRate >= 60 ? "#22d3ee" : entry.captureRate >= 30 ? "#f59e0b" : "#f43f5e"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-slate-600">No merchandiser data yet</div>
          )}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}
        className="mb-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl"
      >
        <div className="flex items-center gap-2 border-b border-white/[0.06] p-3">
          <Users className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Merchandiser Breakdown</h3>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-slate-400">{store.reps.length}</span>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-1.5">Merchandiser</th>
                <th className="px-4 py-1.5 text-center">Tasks</th>
                <th className="px-4 py-1.5 text-center">Done</th>
                <th className="px-4 py-1.5">Capture Rate</th>
              </tr>
            </thead>
            <tbody>
              {[...store.reps].sort((a, b) => b.tasks - a.tasks).map(r => (
                <tr key={r.name} className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]" data-testid={`row-rep-${r.name}`}>
                  <td className="px-4 py-2 font-semibold text-white">{tc(r.name)}</td>
                  <td className="px-4 py-2 text-center text-slate-400 tabular-nums">{fmtNum(r.tasks)}</td>
                  <td className="px-4 py-2 text-center font-semibold text-emerald-400 tabular-nums">{fmtNum(r.completed)}</td>
                  <td className="px-4 py-2"><GlowBar rate={r.captureRate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
        className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl"
      >
        <TaskDetailTable rows={tasks} showStoreColumn={false} />
      </motion.div>
    </div>
  );
}

// ─── Root Component ─────────────────────────────────────────────────
export default function MerchandiserPilot() {
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ manager: "", region: "", store: "", banner: "", rep: "", week: "" });

  const { data } = useQuery<PilotReport>({
    queryKey: ["/api/pilot-report", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.manager) params.set("manager", filters.manager);
      if (filters.region) params.set("region", filters.region);
      if (filters.store) params.set("store", filters.store);
      if (filters.banner) params.set("banner", filters.banner);
      if (filters.rep) params.set("rep", filters.rep);
      if (filters.week) params.set("week", filters.week);
      const qs = params.toString();
      const res = await fetch(`/api/pilot-report${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to load pilot report");
      return res.json();
    },
    staleTime: 60000,
  });

  const storeList = useMemo<StoreAgg[]>(() => {
    if (!data) return [];
    const map = new Map<string, StoreAgg>();
    for (const m of data.merchandisers) {
      if (!m.stockFix) continue;
      for (const s of m.stockFix.stores) {
        if (!map.has(s.name)) map.set(s.name, { name: s.name, tasks: 0, completed: 0, captureRate: 0, reps: [] });
        const agg = map.get(s.name)!;
        agg.tasks += s.tasks;
        agg.completed += s.completed;
        agg.reps.push({ name: m.name, tasks: s.tasks, completed: s.completed, captureRate: s.captureRate });
      }
    }
    return Array.from(map.values())
      .map(s => ({ ...s, captureRate: s.tasks > 0 ? Math.round((s.completed / s.tasks) * 100) : 0 }))
      .sort((a, b) => b.tasks - a.tasks);
  }, [data]);

  const selected = selectedStore ? storeList.find(s => s.name === selectedStore) : undefined;
  const selectedTasks = useMemo(() => {
    if (!data || !selectedStore) return [];
    return data.taskDetail.filter(t => t.storeName === selectedStore);
  }, [data, selectedStore]);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#05070d]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-500/30 border-t-cyan-400" />
          <span className="text-xs font-medium uppercase tracking-widest text-slate-500">Loading pilot data</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#05070d] text-slate-200">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_60%_50%_at_20%_-10%,rgba(34,211,238,0.10),transparent),radial-gradient(ellipse_50%_40%_at_100%_0%,rgba(139,92,246,0.10),transparent)]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="relative">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key="store" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <StoreDetailPage store={selected} tasks={selectedTasks} onBack={() => setSelectedStore(null)} />
            </motion.div>
          ) : (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <OverviewPage
                data={data}
                onSelectStore={setSelectedStore}
                filters={filters}
                onFilterChange={setFilters}
                onFilterReset={() => setFilters({ manager: "", region: "", store: "", banner: "", rep: "", week: "" })}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
