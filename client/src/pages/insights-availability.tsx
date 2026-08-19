import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { fetchNexusAvailability, type NexusClassification } from "@/lib/nexus-api";

const NAVY = "#071A2D";
const PANEL = "#0D2137";
const ORANGE = "#F58220";

const CLASSIFICATIONS: Array<{ key: NexusClassification; color: string }> = [
  { key: "Out of stock", color: "#DC2626" },
  { key: "Low stock", color: ORANGE },
  { key: "No sales stock present", color: "#eab308" },
  { key: "Overstocked", color: "#3b82f6" },
  { key: "Optimal", color: "#22c55e" },
];

export default function InsightsAvailability() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);

  const rep = params.get("rep") || "";
  const store = params.get("store") || "";
  const client = params.get("client") || "";

  const backParams = new URLSearchParams();
  if (rep) backParams.set("rep", rep);
  if (store) backParams.set("store", store);
  if (client) backParams.set("client", client);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["nexus-availability", rep, store, client],
    queryFn: () => fetchNexusAvailability({ rep, store, client }),
    enabled: !!store,
    staleTime: 60_000,
  });

  const records = data?.records || [];

  const counts: Record<string, number> = {};
  for (const r of records) {
    const c = r.classification || "Optimal";
    counts[c] = (counts[c] || 0) + 1;
  }

  // 13-week in-stock trend vs peer — derived client-side from peerDistribution
  // if present on any record, since the availability stem doesn't carry a
  // dedicated trend array. UNVERIFIED — confirm Nexus exposes a real 13-week
  // series for this view once NEXUS_API_KEY is provisioned.
  const trendSample = records.find((r) => r.peerDistribution && r.peerDistribution.length > 0);
  const peerBars = trendSample?.peerDistribution || [];
  const maxPeer = Math.max(1, ...peerBars.map((p) => p.soh));

  const goToLineList = (classification: string) => {
    const p = new URLSearchParams(backParams);
    setLocation(`/store-overview/insights/line-list/${encodeURIComponent(classification)}?${p.toString()}`);
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: NAVY, paddingBottom: "70px", color: "#FFFFFF" }}>
      <div style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <button
            onClick={() => setLocation(`/store-overview/insights?${backParams.toString()}`)}
            data-testid="button-back-availability"
            style={{ display: "flex", alignItems: "center", gap: "4px", color: "rgba(255,255,255,0.8)", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "14px" }}
          >
            <ArrowLeft style={{ width: "18px", height: "18px" }} />
            <span>Back</span>
          </button>
          <h1 style={{ fontSize: "17px", fontWeight: 700, color: "#FFFFFF", margin: 0 }} data-testid="text-page-title">
            Availability
          </h1>
          <div style={{ width: "40px" }} />
        </div>

        {isLoading && <div style={{ padding: "12px", color: "rgba(255,255,255,0.7)" }}>Loading availability...</div>}
        {isError && (
          <div data-testid="nexus-error" style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px", color: ORANGE, fontSize: "13px", marginBottom: "12px" }}>
            Couldn't load Nexus data: {(error as Error)?.message || "unknown error"}
          </div>
        )}

        {/* 13-week in-stock trend vs peer */}
        <div style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px", marginBottom: "12px" }}>
          <h3 style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            13-Week In-Stock Trend vs Peer
          </h3>
          {peerBars.length > 0 ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "60px" }} data-testid="peer-trend-bars">
              {peerBars.map((p, i) => (
                <div
                  key={i}
                  title={`${p.store}: ${p.soh}`}
                  style={{
                    flex: 1,
                    height: `${Math.max(4, (p.soh / maxPeer) * 60)}px`,
                    backgroundColor: "#3b82f6",
                    borderRadius: "2px",
                  }}
                />
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>No peer trend data available.</div>
          )}
        </div>

        {/* 5-way classification breakdown */}
        <div style={{ backgroundColor: PANEL, borderRadius: "10px", overflow: "hidden", marginBottom: "12px" }}>
          <h3 style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.7)", padding: "12px 12px 4px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            Classification Breakdown
          </h3>
          {CLASSIFICATIONS.map((c) => (
            <button
              key={c.key}
              onClick={() => goToLineList(c.key)}
              data-testid={`classification-row-${c.key.replace(/\s+/g, "-").toLowerCase()}`}
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
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: c.color, display: "inline-block" }} />
                {c.key}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontFamily: "monospace", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                  {counts[c.key] || 0}
                </span>
                <ChevronRight style={{ width: "16px", height: "16px", color: "rgba(255,255,255,0.5)" }} />
              </span>
            </button>
          ))}
        </div>

        {/* Per-client availability bar list */}
        <div style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px" }}>
          <h3 style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            Per-Client Availability
          </h3>
          {client ? (
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)" }} data-testid="per-client-availability-row">
              {client}: {records.length} SKU rows in this view
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>Select a client to see its availability breakdown.</div>
          )}
        </div>
      </div>

    </div>
  );
}
