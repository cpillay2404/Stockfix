import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import {
  Users, ClipboardCheck, CheckCircle2, Gauge, Store as StoreIcon, Trophy,
  ArrowLeft, Search, Download, FileJson, ChevronRight, TrendingUp,
  Package, Tag,
} from "lucide-react";
import shopriteCheckersLogo from "@assets/image_1783089822744.png";

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
interface PilotReport {
  latestWeek: string | null;
  filters: { managers: string[]; regions: string[]; stores: string[]; active: { manager: string | null; region: string | null; store: string | null } };
  summary: { stockFix: { total: number; completed: number; captureRate: number }; activeReps: number };
  merchandisers: Merchandiser[];
  sfClientSummary: { client: string; tasks: number; completed: number; captureRate: number }[];
  bannerBreakdown: { banner: string; total: number; completed: number; captureRate: number }[];
  history: WeekSnapshot[];
}

interface StoreAgg {
  name: string;
  tasks: number;
  completed: number;
  captureRate: number;
  reps: { name: string; tasks: number; completed: number; captureRate: number }[];
  clients: string[];
}

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
      className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-xl transition-all hover:border-white/[0.12] hover:bg-white/[0.04]"
    >
      <div className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${accent} opacity-[0.12] blur-2xl transition-opacity group-hover:opacity-25`} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-extrabold tracking-tight text-white tabular-nums">{value}</div>
          {sub && <div className="mt-1 text-[11px] text-slate-500">{sub}</div>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} shadow-lg`}>
          <Icon className="h-4.5 w-4.5 text-white" strokeWidth={2.2} />
        </div>
      </div>
    </motion.div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-xl">
      <div className="mb-1 font-semibold text-slate-300">{fmtDate(label)}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5" style={{ color: p.color }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-bold">{fmtNum(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Overview Page ──────────────────────────────────────────────────
function OverviewPage({ data, storeList, onSelectStore }: {
  data: PilotReport; storeList: StoreAgg[]; onSelectStore: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"tasks" | "captureRate" | "reps">("tasks");

  const totalPilotReps = data.merchandisers.length;
  const activeReps = data.summary.activeReps;
  const coverage = totalPilotReps > 0 ? Math.round((activeReps / totalPilotReps) * 100) : 0;
  const topStore = storeList[0];

  const filteredStores = useMemo(() => {
    let list = storeList;
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter(s => s.name.includes(q));
    }
    return [...list].sort((a, b) => {
      if (sortKey === "captureRate") return b.captureRate - a.captureRate;
      if (sortKey === "reps") return b.reps.length - a.reps.length;
      return b.tasks - a.tasks;
    });
  }, [storeList, search, sortKey]);

  const chartData = [...data.history].reverse().map(h => ({
    week: h.weekEndingDate, tasks: h.totalTasks, completed: h.totalCompleted, captureRate: h.captureRate,
  }));

  const topClients = [...data.sfClientSummary].slice(0, 6);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
      {/* Hero header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
      >
        <div>
          <div className="mb-3 flex items-center gap-3">
            <img src={shopriteCheckersLogo} alt="Shoprite & Checkers" className="h-9 w-auto rounded-md shadow-lg shadow-black/40" data-testid="img-retailer-logo" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400">Merchandiser Pilot</span>
          </div>
          <h1 className="bg-gradient-to-r from-white via-white to-slate-400 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
            Field Coverage Overview
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Live StockFix task performance across {fmtNum(totalPilotReps)} enrolled reps in Shoprite &amp; Checkers stores
            {data.latestWeek && <> · Week ending {fmtDate(data.latestWeek)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/pilot-export"
            download="pilot-tasks.json"
            data-testid="link-download-json"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-slate-300 backdrop-blur-xl transition-colors hover:bg-white/[0.08]"
          >
            <FileJson className="h-3.5 w-3.5" /> JSON
          </a>
          <a
            href="/api/pilot-export-xlsx"
            download
            data-testid="link-download-excel"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition-transform hover:scale-[1.03]"
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </a>
        </div>
      </motion.div>

      {/* KPI grid */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile icon={Users} label="Active Reps" value={fmtNum(activeReps)} sub={`of ${fmtNum(totalPilotReps)} enrolled`} accent="from-cyan-500 to-blue-600" delay={0} />
        <KpiTile icon={ClipboardCheck} label="Tasks Logged" value={fmtNum(data.summary.stockFix.total)} sub="total StockFix tasks" accent="from-violet-500 to-purple-600" delay={0.05} />
        <KpiTile icon={CheckCircle2} label="Completed" value={fmtNum(data.summary.stockFix.completed)} sub={`${data.summary.stockFix.captureRate}% rate`} accent="from-emerald-500 to-teal-600" delay={0.1} />
        <KpiTile icon={Gauge} label="Capture Rate" value={`${data.summary.stockFix.captureRate}%`} sub="overall completion" accent="from-amber-500 to-orange-600" delay={0.15} />
        <KpiTile icon={StoreIcon} label="Stores Covered" value={fmtNum(storeList.length)} sub="with logged tasks" accent="from-pink-500 to-rose-600" delay={0.2} />
        <KpiTile icon={Trophy} label="Pilot Coverage" value={`${coverage}%`} sub={topStore ? `top: ${tc(topStore.name)}` : "no data yet"} accent="from-indigo-500 to-violet-600" delay={0.25} />
      </div>

      {/* Chart + client breakdown */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          className="lg:col-span-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Capture Rate Trend</h3>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="captureFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="week" tickFormatter={fmtDate} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="captureRate" name="Capture Rate" stroke="#22d3ee" strokeWidth={2.5} fill="url(#captureFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[240px] items-center justify-center text-sm text-slate-600">No trend data yet</div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <Tag className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-bold text-white">Top Clients</h3>
          </div>
          {topClients.length > 0 ? (
            <div className="space-y-3">
              {topClients.map((c, i) => (
                <div key={c.client} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-[10px] font-bold text-slate-600">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-300">{c.client}</span>
                  <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-500">{fmtNum(c.tasks)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-[180px] items-center justify-center text-sm text-slate-600">No client data yet</div>
          )}
        </motion.div>
      </div>

      {/* Store leaderboard */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
        className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl"
      >
        <div className="flex flex-col gap-3 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Store Performance</h3>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-slate-400">{filteredStores.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search store..."
                data-testid="input-search-store"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-600 outline-none focus:border-cyan-500/50 sm:w-52"
              />
            </div>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as any)}
              data-testid="select-sort-stores"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-300 outline-none"
            >
              <option value="tasks" className="bg-slate-900">Sort: Tasks</option>
              <option value="captureRate" className="bg-slate-900">Sort: Capture Rate</option>
              <option value="reps" className="bg-slate-900">Sort: Reps</option>
            </select>
          </div>
        </div>

        <div className="max-h-[520px] overflow-y-auto">
          {filteredStores.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-600">
              {storeList.length === 0 ? "No store activity yet — waiting on StockFix task data for pilot reps." : "No stores match your search."}
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2.5">Store</th>
                  <th className="px-5 py-2.5 text-center">Reps</th>
                  <th className="px-5 py-2.5 text-center">Tasks</th>
                  <th className="px-5 py-2.5 text-center">Done</th>
                  <th className="px-5 py-2.5">Capture Rate</th>
                  <th className="w-8 px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filteredStores.map((s, i) => (
                  <motion.tr
                    key={s.name}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.4) }}
                    onClick={() => onSelectStore(s.name)}
                    data-testid={`row-store-${s.name}`}
                    className="cursor-pointer border-t border-white/[0.04] transition-colors hover:bg-white/[0.04]"
                  >
                    <td className="px-5 py-3 font-semibold text-white">{tc(s.name)}</td>
                    <td className="px-5 py-3 text-center text-slate-400 tabular-nums">{s.reps.length}</td>
                    <td className="px-5 py-3 text-center text-slate-400 tabular-nums">{fmtNum(s.tasks)}</td>
                    <td className="px-5 py-3 text-center font-semibold text-emerald-400 tabular-nums">{fmtNum(s.completed)}</td>
                    <td className="px-5 py-3"><GlowBar rate={s.captureRate} /></td>
                    <td className="px-5 py-3 text-slate-600"><ChevronRight className="h-4 w-4" /></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Store Detail Page ──────────────────────────────────────────────
function StoreDetailPage({ store, onBack }: { store: StoreAgg; onBack: () => void }) {
  const repChartData = [...store.reps].sort((a, b) => b.tasks - a.tasks).slice(0, 10).map(r => ({
    name: tc(r.name).split(" ")[0], tasks: r.tasks, completed: r.completed, captureRate: r.captureRate,
  }));

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
      <motion.button
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        onClick={onBack}
        data-testid="button-back-overview"
        className="mb-6 flex items-center gap-2 text-xs font-semibold text-slate-400 transition-colors hover:text-cyan-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="mb-8 flex flex-col gap-6 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] to-transparent p-7 backdrop-blur-xl md:flex-row md:items-center md:justify-between"
      >
        <div>
          <div className="mb-2 flex items-center gap-2">
            <img src={shopriteCheckersLogo} alt="Shoprite & Checkers" className="h-6 w-auto rounded shadow shadow-black/40" />
            <StoreIcon className="h-4 w-4 text-cyan-400" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-400">Store Detail</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white" data-testid="text-store-name">{tc(store.name)}</h1>
          <p className="mt-2 text-sm text-slate-500">{store.reps.length} rep{store.reps.length !== 1 ? "s" : ""} assigned · {store.clients.length} client{store.clients.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-2xl font-extrabold text-white tabular-nums">{fmtNum(store.tasks)}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tasks</div>
          </div>
          <div className="h-10 w-px bg-white/10" />
          <div className="text-center">
            <div className="text-2xl font-extrabold text-emerald-400 tabular-nums">{fmtNum(store.completed)}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Completed</div>
          </div>
          <div className="h-10 w-px bg-white/10" />
          <div className="text-center">
            <div className={`text-2xl font-extrabold tabular-nums ${rateText(store.captureRate)}`}>{store.captureRate}%</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Capture Rate</div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          className="lg:col-span-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-bold text-white">Tasks by Rep</h3>
          </div>
          {repChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
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
            <div className="flex h-[280px] items-center justify-center text-sm text-slate-600">No rep data yet</div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }}
          className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <Tag className="h-4 w-4 text-pink-400" />
            <h3 className="text-sm font-bold text-white">Clients</h3>
          </div>
          {store.clients.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {store.clients.map(c => (
                <span key={c} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-slate-300">{c}</span>
              ))}
            </div>
          ) : (
            <div className="flex h-[180px] items-center justify-center text-sm text-slate-600">No client data yet</div>
          )}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
        className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl"
      >
        <div className="flex items-center gap-2 border-b border-white/[0.06] p-5">
          <Users className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">Rep Breakdown</h3>
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-slate-400">{store.reps.length}</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2.5">Rep</th>
                <th className="px-5 py-2.5 text-center">Tasks</th>
                <th className="px-5 py-2.5 text-center">Done</th>
                <th className="px-5 py-2.5">Capture Rate</th>
              </tr>
            </thead>
            <tbody>
              {[...store.reps].sort((a, b) => b.tasks - a.tasks).map(r => (
                <tr key={r.name} className="border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]" data-testid={`row-rep-${r.name}`}>
                  <td className="px-5 py-3 font-semibold text-white">{tc(r.name)}</td>
                  <td className="px-5 py-3 text-center text-slate-400 tabular-nums">{fmtNum(r.tasks)}</td>
                  <td className="px-5 py-3 text-center font-semibold text-emerald-400 tabular-nums">{fmtNum(r.completed)}</td>
                  <td className="px-5 py-3"><GlowBar rate={r.captureRate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Root Component ─────────────────────────────────────────────────
export default function MerchandiserPilot() {
  const [selectedStore, setSelectedStore] = useState<string | null>(null);

  const { data } = useQuery<PilotReport>({
    queryKey: ["/api/pilot-report"],
    queryFn: async () => {
      const res = await fetch("/api/pilot-report");
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
        if (!map.has(s.name)) map.set(s.name, { name: s.name, tasks: 0, completed: 0, captureRate: 0, reps: [], clients: [] });
        const agg = map.get(s.name)!;
        agg.tasks += s.tasks;
        agg.completed += s.completed;
        agg.reps.push({ name: m.name, tasks: s.tasks, completed: s.completed, captureRate: s.captureRate });
        for (const c of s.clients) if (!agg.clients.includes(c)) agg.clients.push(c);
      }
    }
    return Array.from(map.values())
      .map(s => ({ ...s, captureRate: s.tasks > 0 ? Math.round((s.completed / s.tasks) * 100) : 0 }))
      .sort((a, b) => b.tasks - a.tasks);
  }, [data]);

  const selected = selectedStore ? storeList.find(s => s.name === selectedStore) : undefined;

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
              <StoreDetailPage store={selected} onBack={() => setSelectedStore(null)} />
            </motion.div>
          ) : (
            <motion.div key="overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <OverviewPage data={data} storeList={storeList} onSelectStore={setSelectedStore} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
