import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { COLORS } from "@/lib/design-tokens";
import { safeParseFloat } from "@/lib/utils";

const NAVY_ELEVATED = COLORS.navyElevated;
const NAVY_DEEP = COLORS.bgPrimary;
const NAVY_CARD = COLORS.navyElevated;
const ORANGE = COLORS.orange;
const TEXT_MUTED = COLORS.textMuted;
const LINE_BLUE = COLORS.lineBlue;
const GREEN = "#34D399";

interface RepProgressTask {
  uniqueId: string;
  articleDescription: string;
  storeName: string;
  client: string;
  storeWfc: string | null;
  captureDate: string | null;
  actionStatus: string;
}
interface RepProgressResponse {
  repName: string;
  kpis: { openCount: number; completedCount: number; completionRate: number };
  openByStore: Array<{ store: string; count: number }>;
  tasks: { open: RepProgressTask[]; completed: RepProgressTask[] };
}

// New nexus_tasks-based rep detail page (Carin, 2026-08-19: "need to route
// to new" - manager-progress.tsx's rep-row tap used to go to the legacy
// /rep-progress screen, still on the old tasks table with badges/streaks/
// priority splits already removed everywhere else per Carin's "forget the
// priority crap"). Real open/completed counts only, no gamification.
export default function NexusRepProgress() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const repName = params.get("rep") || "";
  const [activeTab, setActiveTab] = useState<"open" | "completed">("open");

  const { data, isLoading } = useQuery<RepProgressResponse>({
    queryKey: ["nexus-rep-progress", repName],
    queryFn: async () => {
      const res = await fetch(`/api/nexus-tasks/rep-progress?rep=${encodeURIComponent(repName)}`);
      if (!res.ok) throw new Error("Failed to fetch rep progress");
      return res.json();
    },
    enabled: !!repName,
  });

  const handleBack = () => window.history.back();
  const tasks = activeTab === "open" ? (data?.tasks.open || []) : (data?.tasks.completed || []);
  const maxStoreCount = Math.max(1, ...(data?.openByStore.map((s) => s.count) || [1]));

  return (
    <div style={{ minHeight: "100vh", backgroundColor: NAVY_DEEP, paddingBottom: 40 }}>
      <div
        style={{
          background: `linear-gradient(135deg, ${NAVY_ELEVATED} 0%, ${NAVY_DEEP} 100%)`,
          borderBottom: `1px solid ${LINE_BLUE}`,
          padding: 16,
          paddingTop: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={handleBack}
            data-testid="back-button"
            style={{ background: "rgba(23,68,111,0.35)", border: "none", borderRadius: 8, padding: 8, cursor: "pointer", display: "flex" }}
          >
            <ArrowLeft style={{ width: 20, height: 20, color: "#F7F9FC" }} />
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#F7F9FC", margin: 0 }}>Rep Task Progress</h1>
            <p style={{ fontSize: 13, color: TEXT_MUTED, margin: 0 }}>{repName}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <div style={{ backgroundColor: NAVY_CARD, borderRadius: 10, padding: 12, borderTop: `3px solid ${ORANGE}`, flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#F7F9FC", fontFamily: "monospace" }}>{data?.kpis.openCount ?? 0}</div>
            <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 4 }}>Open</div>
          </div>
          <div style={{ backgroundColor: NAVY_CARD, borderRadius: 10, padding: 12, borderTop: `3px solid ${GREEN}`, flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#F7F9FC", fontFamily: "monospace" }}>{data?.kpis.completedCount ?? 0}</div>
            <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 4 }}>Completed</div>
          </div>
          <div style={{ backgroundColor: NAVY_CARD, borderRadius: 10, padding: 12, borderTop: "3px solid #60A5FA", flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#F7F9FC", fontFamily: "monospace" }}>{data?.kpis.completionRate ?? 0}%</div>
            <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 4 }}>Completion</div>
          </div>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ backgroundColor: NAVY_CARD, borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#F7F9FC", marginBottom: 12 }}>Task Status</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 100, height: 100 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: "Open", value: data?.kpis.openCount || 0, fill: ORANGE },
                      { name: "Completed", value: data?.kpis.completedCount || 0, fill: GREEN },
                    ]}
                    cx="50%" cy="50%" innerRadius={26} outerRadius={44} paddingAngle={2} dataKey="value"
                  >
                    <Cell fill={ORANGE} />
                    <Cell fill={GREEN} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 10, height: 10, backgroundColor: ORANGE, borderRadius: 2 }} />
                <span style={{ fontSize: 13, color: TEXT_MUTED }}>Open</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: ORANGE, marginLeft: "auto", fontFamily: "monospace" }}>{data?.kpis.openCount ?? 0}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, backgroundColor: GREEN, borderRadius: 2 }} />
                <span style={{ fontSize: 13, color: TEXT_MUTED }}>Completed</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: GREEN, marginLeft: "auto", fontFamily: "monospace" }}>{data?.kpis.completedCount ?? 0}</span>
              </div>
            </div>
          </div>
        </div>

        {(data?.openByStore.length ?? 0) > 0 && (
          <div style={{ backgroundColor: NAVY_CARD, borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#F7F9FC", marginBottom: 12 }}>Open Tasks by Store (Top 5)</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data!.openByStore.map((s, i) => (
                <div key={s.store} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#F7F9FC", fontWeight: 500 }}>{i + 1}. {s.store}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#F7F9FC", fontFamily: "monospace" }}>{s.count}</span>
                  </div>
                  <div style={{ height: 6, backgroundColor: "rgba(23,68,111,0.4)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(s.count / maxStoreCount) * 100}%`, backgroundColor: ORANGE, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ backgroundColor: NAVY_CARD, borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => setActiveTab("open")}
              data-testid="tab-open"
              style={{
                flex: 1, padding: 10, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                backgroundColor: activeTab === "open" ? ORANGE : "rgba(23,68,111,0.35)",
                color: activeTab === "open" ? "#FFFFFF" : TEXT_MUTED,
              }}
            >
              Open ({data?.kpis.openCount ?? 0})
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              data-testid="tab-completed"
              style={{
                flex: 1, padding: 10, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                backgroundColor: activeTab === "completed" ? ORANGE : "rgba(23,68,111,0.35)",
                color: activeTab === "completed" ? "#FFFFFF" : TEXT_MUTED,
              }}
            >
              Completed ({data?.kpis.completedCount ?? 0})
            </button>
          </div>

          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {isLoading ? (
              <div style={{ textAlign: "center", padding: 20, color: TEXT_MUTED }}>Loading...</div>
            ) : tasks.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: TEXT_MUTED }}>No {activeTab} tasks found</div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.uniqueId}
                  data-testid={`task-row-${task.uniqueId}`}
                  style={{
                    backgroundColor: NAVY_DEEP,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                    borderLeft: `4px solid ${task.actionStatus === "Completed" ? GREEN : ORANGE}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#F7F9FC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {task.articleDescription}
                    </div>
                    <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>{task.storeName}</div>
                    <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2, opacity: 0.8 }}>
                      {task.client}{task.storeWfc != null && ` · WFC: ${safeParseFloat(task.storeWfc || "0").toFixed(1)}`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8, color: task.actionStatus === "Completed" ? GREEN : TEXT_MUTED }}>
                    {task.actionStatus === "Completed" ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                    {task.captureDate && (
                      <div style={{ fontSize: 10, marginTop: 4 }}>{new Date(task.captureDate).toLocaleDateString()}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
