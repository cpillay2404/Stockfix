import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, CheckCircle2, Clock, Camera, LogOut } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import Sf2LoadingState from "@/components/sf2-loading-state";
import { useAccess } from "@/context/AccessContext";
import "./StoreOverview.css";

interface VisitSummaryResponse {
  completedCount: number;
  openCount: number;
  photosCount: number;
  reasonCodeCounts: Record<string, number>;
  recent: Array<{
    barcode: string;
    articleDescription: string;
    feedback: string | null;
    reasonCode: string | null;
    actionTakenComment: string | null;
    captureDate: string | null;
  }>;
}

// New "End Visit" summary for the nexus_tasks flow (Carin, 2026-08-18: "no
// end visit or log out or...visit summary screen or fuck all") - real
// completed/open counts and recent captures for this rep at this store, not
// a fabricated summary. Deliberately a NEW page, not a reuse of the legacy
// exit-visit.tsx (that page stays wired to the old /tasks-based flow it
// already serves).
export default function NexusExitVisit() {
  const [, setLocation] = useLocation();
  const { clearAll } = useAccess();
  const params = new URLSearchParams(window.location.search);
  const store = params.get("store") || "";
  const rep = params.get("rep") || "";
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";

  const { data, isLoading } = useQuery<VisitSummaryResponse>({
    queryKey: ["nexus-visit-summary", store, rep, client],
    queryFn: async () => {
      const res = await fetch(`/api/nexus-tasks/visit-summary?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`);
      if (!res.ok) throw new Error("Failed to fetch visit summary");
      return res.json();
    },
    enabled: !!store,
  });

  const handleBack = () => setLocation(`/store-detail/fix?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}${clientQS}`);
  const handleLogout = () => {
    clearAll();
    setLocation("/");
  };

  if (isLoading) return <Sf2LoadingState />;

  return (
    <div className="stockfix2-page">
      <header className="sf2-topbar">
        <button className="icon-btn" onClick={handleBack}><ArrowLeft size={20} /></button>
        <BrandLogo size={20} />
        <div className="sf2-topbar-right">
          <Bell size={18} />
        </div>
      </header>

      <main className="sf2-content">
        <section className="sf2-storecard">
          <div className="sf2-storeicon"><CheckCircle2 size={18} /></div>
          <div className="sf2-storeinfo">
            <div className="sf2-storename">{store.toUpperCase()}</div>
            <div className="sf2-storemeta">Visit summary · {rep || "this rep"}</div>
          </div>
        </section>

        <section className="kpi2-grid">
          <div className="kpi2-card tone-green">
            <div className="kpi2-value">{data?.completedCount ?? 0}</div>
            <div className="kpi2-label">Fixed this visit</div>
          </div>
          <div className="kpi2-card tone-orange">
            <div className="kpi2-value">{data?.openCount ?? 0}</div>
            <div className="kpi2-label">Still open here</div>
          </div>
          <div className="kpi2-card tone-blue">
            <div className="kpi2-value">{data?.photosCount ?? 0}</div>
            <div className="kpi2-label">Photos captured</div>
          </div>
        </section>

        <div className="sf2-sectionhead"><span>RECENT CAPTURES</span></div>
        <section className="sf2-list">
          {(data?.recent || []).map((r) => (
            <div className="sf2-listrow tone-green" key={r.barcode}>
              <div>
                <div className="sf2-listrow-title">{r.articleDescription}</div>
                <div className="sf2-listrow-meta">
                  {r.reasonCode || "No reason code"}
                  {r.actionTakenComment ? ` · ${r.actionTakenComment}` : ""}
                </div>
              </div>
              <CheckCircle2 size={16} style={{ color: "#34D399" }} />
            </div>
          ))}
          {(!data?.recent || data.recent.length === 0) && (
            <p className="empty-state">Nothing captured at this store yet.</p>
          )}
        </section>

        <button
          onClick={handleLogout}
          style={{
            width: "100%",
            marginTop: 20,
            padding: 16,
            borderRadius: 12,
            border: "none",
            background: "#F58220",
            color: "#FFFFFF",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <LogOut size={18} />
          End Visit
        </button>
      </main>
    </div>
  );
}
