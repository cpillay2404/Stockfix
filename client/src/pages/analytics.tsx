import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft, TrendingUp, TrendingDown, CheckCircle2, Clock,
  BarChart3, PieChart as PieIcon, RefreshCw, ClipboardList,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// Design tokens (matches IZON-inspired app style)
const NAVY = "#003B71";
const ORANGE = "#F97316";
const GREEN = "#16A34A";
const RED = "#DC2626";
const GREY = "#6B7280";

const PIE_COLORS = ["#F97316", "#003B71", "#16A34A", "#DC2626", "#8B5CF6", "#0EA5E9", "#EAB308", "#EC4899"];

interface WeeklyTrend { weekEnding: string; total: number; completed: number; pending: number; completionRate: number }
interface ReasonCode { reasonCode: string; count: number }
interface ActionType { action: string; total: number; completed: number }
interface RegionBreakdown { region: string; total: number; completed: number; completionRate: number }
interface ClassificationTrend { weekEnding: string; classification: string; count: number }
interface Kpis { totalTasks: number; totalCompleted: number; avgCompletionRate: number; totalVariance: number; weeksTracked: number }

interface TrendsResponse {
  weeklyTrend: WeeklyTrend[];
  reasonCodeBreakdown: ReasonCode[];
  actionTypeBreakdown: ActionType[];
  regionBreakdown: RegionBreakdown[];
  stockClassificationTrend: ClassificationTrend[];
  kpis: Kpis;
}

function fmtWeek(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-ZA");
}

function KpiCard({ label, value, icon: Icon, accent, testId }: { label: string; value: string; icon: any; accent: string; testId: string }) {
  return (
    <div
      data-testid={testId}
      style={{
        backgroundColor: "#fff",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        flex: "1 1 45%",
        minWidth: "140px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <span style={{ fontSize: "12px", color: GREY, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
        <Icon style={{ width: "16px", height: "16px", color: accent }} />
      </div>
      <div style={{ fontFamily: "monospace", fontSize: "24px", fontWeight: 700, color: NAVY }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "12px",
        padding: "16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        marginBottom: "16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <Icon style={{ width: "18px", height: "18px", color: ORANGE }} />
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: NAVY, margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function Analytics() {
  const [, setLocation] = useLocation();
  const [client, setClient] = useState("");
  const [region, setRegion] = useState("");
  const [weeks, setWeeks] = useState(12);

  const { data, isLoading, refetch, isFetching } = useQuery<TrendsResponse>({
    queryKey: ["/api/analytics/trends", client, region, weeks],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (client) params.set("client", client);
      if (region) params.set("region", region);
      params.set("weeks", String(weeks));
      const res = await fetch(`/api/analytics/trends?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
  });

  const { data: filterOptions } = useQuery<{ clients: string[]; regions: string[] }>({
    queryKey: ["/api/analytics/filters"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/filters");
      if (!res.ok) throw new Error("Failed to load filters");
      return res.json();
    },
  });

  const kpis = data?.kpis;
  const lastWeek = data?.weeklyTrend?.[data.weeklyTrend.length - 1];
  const prevWeek = data?.weeklyTrend?.[data.weeklyTrend.length - 2];
  const rateDelta = lastWeek && prevWeek ? Math.round((lastWeek.completionRate - prevWeek.completionRate) * 10) / 10 : 0;

  const weeklyChartData = (data?.weeklyTrend || []).map(w => ({
    week: fmtWeek(w.weekEnding),
    Completed: w.completed,
    Pending: w.pending,
    "Completion %": w.completionRate,
  }));

  const actionChartData = (data?.actionTypeBreakdown || []).slice(0, 8).map(a => ({
    action: a.action.length > 18 ? a.action.slice(0, 18) + "…" : a.action,
    Total: a.total,
    Completed: a.completed,
  }));

  const reasonChartData = (data?.reasonCodeBreakdown || []).slice(0, 6);

  const regionChartData = (data?.regionBreakdown || []).map(r => ({
    region: r.region,
    "Completion Rate": r.completionRate,
  }));

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F3F4F6", paddingBottom: "40px" }}>
      {/* Header */}
      <div style={{ backgroundColor: NAVY, padding: "16px", paddingBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <button
            onClick={() => setLocation("/dashboard")}
            data-testid="button-back"
            style={{
              display: "flex", alignItems: "center", gap: "4px",
              color: "rgba(255,255,255,0.85)", fontSize: "14px",
              background: "none", border: "none", cursor: "pointer", padding: 0,
            }}
          >
            <ArrowLeft style={{ width: "18px", height: "18px" }} />
            <span>Back</span>
          </button>
          <button
            onClick={() => refetch()}
            data-testid="button-refresh"
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              color: "#fff", fontSize: "13px", fontWeight: 600,
              background: "rgba(255,255,255,0.15)", border: "none",
              borderRadius: "8px", padding: "6px 12px", cursor: "pointer",
            }}
          >
            <RefreshCw style={{ width: "14px", height: "14px", animation: isFetching ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>
        <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: 700, margin: 0 }} data-testid="text-page-title">
          Analytics & Trends
        </h1>
        <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "13px", margin: "4px 0 0" }}>
          Task completion insights over time
        </p>
      </div>

      <div style={{ padding: "16px", maxWidth: "800px", margin: "0 auto" }}>
        {/* Filters */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          <select
            value={client}
            onChange={e => setClient(e.target.value)}
            data-testid="select-client-filter"
            style={{ flex: "1 1 140px", padding: "8px 10px", borderRadius: "8px", border: "1px solid #D1D5DB", fontSize: "13px", backgroundColor: "#fff" }}
          >
            <option value="">All Clients</option>
            {(filterOptions?.clients || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={region}
            onChange={e => setRegion(e.target.value)}
            data-testid="select-region-filter"
            style={{ flex: "1 1 140px", padding: "8px 10px", borderRadius: "8px", border: "1px solid #D1D5DB", fontSize: "13px", backgroundColor: "#fff" }}
          >
            <option value="">All Regions</option>
            {(filterOptions?.regions || []).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={weeks}
            onChange={e => setWeeks(Number(e.target.value))}
            data-testid="select-weeks-filter"
            style={{ flex: "1 1 100px", padding: "8px 10px", borderRadius: "8px", border: "1px solid #D1D5DB", fontSize: "13px", backgroundColor: "#fff" }}
          >
            <option value={4}>Last 4 weeks</option>
            <option value={8}>Last 8 weeks</option>
            <option value={12}>Last 12 weeks</option>
            <option value={26}>Last 26 weeks</option>
          </select>
        </div>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: GREY }}>Loading analytics…</div>
        ) : !kpis || kpis.totalTasks === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: GREY }}>No data available for this filter.</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
              <KpiCard label="Total Tasks" value={fmtNum(kpis.totalTasks)} icon={ClipboardList} accent={NAVY} testId="kpi-total-tasks" />
              <KpiCard label="Completed" value={fmtNum(kpis.totalCompleted)} icon={CheckCircle2} accent={GREEN} testId="kpi-completed" />
              <KpiCard label="Avg Completion Rate" value={`${kpis.avgCompletionRate}%`} icon={rateDelta >= 0 ? TrendingUp : TrendingDown} accent={rateDelta >= 0 ? GREEN : RED} testId="kpi-completion-rate" />
              <KpiCard label="Weeks Tracked" value={fmtNum(kpis.weeksTracked)} icon={Clock} accent={ORANGE} testId="kpi-weeks-tracked" />
            </div>

            {/* Weekly completion trend */}
            <SectionCard title="Weekly Completion Trend" icon={TrendingUp}>
              {weeklyChartData.length === 0 ? (
                <div style={{ color: GREY, fontSize: "13px", padding: "20px 0", textAlign: "center" }}>No weekly data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={weeklyChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Line yAxisId="left" type="monotone" dataKey="Completed" stroke={GREEN} strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="left" type="monotone" dataKey="Pending" stroke={RED} strokeWidth={2} dot={{ r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="Completion %" stroke={ORANGE} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            {/* Action type breakdown */}
            <SectionCard title="Tasks by Action Type" icon={BarChart3}>
              {actionChartData.length === 0 ? (
                <div style={{ color: GREY, fontSize: "13px", padding: "20px 0", textAlign: "center" }}>No action data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={actionChartData} margin={{ top: 8, right: 8, left: -20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="action" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="Total" fill={NAVY} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Completed" fill={GREEN} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            {/* Region completion rate */}
            <SectionCard title="Completion Rate by Region" icon={BarChart3}>
              {regionChartData.length === 0 ? (
                <div style={{ color: GREY, fontSize: "13px", padding: "20px 0", textAlign: "center" }}>No region data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(180, regionChartData.length * 34)}>
                  <BarChart data={regionChartData} layout="vertical" margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="region" tick={{ fontSize: 11 }} width={110} />
                    <Tooltip />
                    <Bar dataKey="Completion Rate" fill={ORANGE} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>

            {/* Reason codes */}
            <SectionCard title="Top Reason Codes" icon={PieIcon}>
              {reasonChartData.length === 0 ? (
                <div style={{ color: GREY, fontSize: "13px", padding: "20px 0", textAlign: "center" }}>No reason code data yet.</div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center" }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={reasonChartData}
                        dataKey="count"
                        nameKey="reasonCode"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={(entry: any) => `${entry.count}`}
                      >
                        {reasonChartData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: "11px" }} layout="vertical" verticalAlign="middle" align="right" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );
}
