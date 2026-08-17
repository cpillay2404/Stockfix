import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useToast } from "@/hooks/use-toast";
import { fetchNexusStoreOverview } from "@/lib/nexus-api";

const NAVY = "#071A2D";
const PANEL = "#0D2137";
const ORANGE = "#F58220";

// The 7 "All measures" rows. Only Availability is specced/wired in detail —
// the other 6 route into a "coming soon" toast so scope is honestly
// represented in the UI rather than silently pretending they work.
const MEASURES: Array<{ key: string; label: string; implemented: boolean }> = [
  { key: "availability", label: "Availability", implemented: true },
  { key: "sales", label: "Sales", implemented: false },
  { key: "weeks-of-cover", label: "Weeks of cover", implemented: false },
  { key: "line-mix", label: "Line mix", implemented: false },
  { key: "by-client", label: "By client", implemented: false },
  { key: "not-carried-here", label: "Not carried here", implemented: false },
  { key: "ranking", label: "Ranking", implemented: false },
];

export default function InsightsOverview() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const { toast } = useToast();

  const rep = params.get("rep") || "";
  const store = params.get("store") || "";
  const client = params.get("client") || "";

  const backParams = new URLSearchParams();
  if (rep) backParams.set("rep", rep);
  if (store) backParams.set("store", store);
  if (client) backParams.set("client", client);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["nexus-store-overview", rep, store, client],
    queryFn: () => fetchNexusStoreOverview({ rep, store, client }),
    enabled: !!store,
    staleTime: 60_000,
  });

  const record = data?.records?.[0];

  const slope = record?.trend9Week || [];
  const maxHealth = Math.max(1, ...slope.map((s) => s.healthScore));

  const verdict = record
    ? record.inStockPct >= 90
      ? `${store} is tracking well — ${record.inStockPct.toFixed(0)}% in stock.`
      : `${store} needs attention — ${record.inStockPct.toFixed(0)}% in stock.`
    : null;

  const goToAvailability = () => setLocation(`/store-overview/insights/availability?${backParams.toString()}`);

  const handleMeasureClick = (m: (typeof MEASURES)[number]) => {
    if (m.key === "availability") {
      goToAvailability();
      return;
    }
    toast({ title: `${m.label} — coming soon`, description: "This measure isn't built yet." });
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: NAVY, paddingBottom: "70px", color: "#FFFFFF" }}>
      <div style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <button
            onClick={() => setLocation(`/store-overview?${backParams.toString()}`)}
            data-testid="button-back-insights"
            style={{ display: "flex", alignItems: "center", gap: "4px", color: "rgba(255,255,255,0.8)", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "14px" }}
          >
            <ArrowLeft style={{ width: "18px", height: "18px" }} />
            <span>Back</span>
          </button>
          <h1 style={{ fontSize: "17px", fontWeight: 700, color: "#FFFFFF", margin: 0 }} data-testid="text-page-title">
            Nexus Inventory Insights
          </h1>
          <div style={{ width: "40px" }} />
        </div>

        {isLoading && <div style={{ padding: "12px", color: "rgba(255,255,255,0.7)" }}>Loading insights...</div>}
        {isError && (
          <div
            data-testid="nexus-error"
            style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px", color: "#F58220", fontSize: "13px", marginBottom: "12px" }}
          >
            Couldn't load Nexus data: {(error as Error)?.message || "unknown error"}
          </div>
        )}

        {/* One-line verdict banner */}
        {verdict && (
          <div
            data-testid="insights-verdict-banner"
            style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px", marginBottom: "12px", fontSize: "14px", fontWeight: 600 }}
          >
            {verdict}
          </div>
        )}

        {/* 9-week health slope */}
        <div style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px", marginBottom: "12px" }}>
          <h3 style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            9-Week Health Slope
          </h3>
          {slope.length > 0 ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "60px" }} data-testid="health-slope-bars">
              {slope.map((s, i) => (
                <div
                  key={i}
                  title={`${s.weekEnding}: ${s.healthScore}`}
                  style={{
                    flex: 1,
                    height: `${Math.max(4, (s.healthScore / maxHealth) * 60)}px`,
                    backgroundColor: ORANGE,
                    borderRadius: "2px",
                  }}
                />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>No trend data available.</div>
          )}
        </div>

        {/* Fix action-queue card */}
        <div
          data-testid="fix-action-queue-card"
          style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px", marginBottom: "12px" }}
        >
          <h3 style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            Fix Action Queue
          </h3>
          <div style={{ display: "flex", gap: "16px", fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}>
            <div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#FFFFFF" }}>{record?.actionQueue?.total ?? 0}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}>Items</div>
            </div>
            <div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#22c55e" }}>{record?.actionQueue?.orderableNow ?? 0}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}>Orderable now</div>
            </div>
            <div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: ORANGE }}>{record?.actionQueue?.toEscalate ?? 0}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}>To escalate</div>
            </div>
          </div>
        </div>

        {/* All measures index */}
        <div style={{ backgroundColor: PANEL, borderRadius: "10px", overflow: "hidden" }}>
          <h3 style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.7)", padding: "12px 12px 4px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            All Measures
          </h3>
          {MEASURES.map((m) => (
            <button
              key={m.key}
              onClick={() => handleMeasureClick(m)}
              data-testid={`measure-row-${m.key}`}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px",
                background: "none",
                border: "none",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                color: "#FFFFFF",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {m.label}
                {!m.implemented && (
                  <span
                    style={{
                      fontSize: "9px",
                      fontWeight: 700,
                      color: NAVY,
                      backgroundColor: ORANGE,
                      borderRadius: "8px",
                      padding: "1px 6px",
                      textTransform: "uppercase",
                    }}
                  >
                    Soon
                  </span>
                )}
              </span>
              <ChevronRight style={{ width: "16px", height: "16px", color: "rgba(255,255,255,0.5)" }} />
            </button>
          ))}
        </div>
      </div>

      <BottomNav rep={rep} store={store} client={client} />
    </div>
  );
}
