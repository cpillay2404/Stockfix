import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import BottomNav from "@/components/BottomNav";
import { INSIGHTS_COLORS, insightsPageStyle, panelStyle, buildInsightsQuery } from "@/lib/insights-theme";

interface NexusStoreOverview {
  found: boolean;
  storeName?: string;
  banner?: string;
  region?: string;
  healthScore?: number | null;
  healthSlope9wk?: null;
  availabilityPct?: number | null;
  totalSkus?: number | null;
  storeSOH?: number | null;
  salesP4?: number | null;
  oosCount?: number | null;
  lowStockCount?: number | null;
  noSalesCount?: number | null;
  overstockCount?: number | null;
  fixReplenishNow?: number | null;
  fixEscalate?: number | null;
  fixTotal?: number | null;
  rankingAvailable: boolean;
}

function healthColor(score: number | null | undefined): string {
  if (score == null) return INSIGHTS_COLORS.textFaint;
  if (score >= 75) return INSIGHTS_COLORS.green;
  if (score >= 60) return INSIGHTS_COLORS.amber;
  return INSIGHTS_COLORS.red;
}

export default function StoreInsightsOverview() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const rep = params.get("rep") || "";
  const store = params.get("store") || "";
  const client = params.get("client") || "";
  const banner = params.get("banner") || "";

  const { data, isLoading } = useQuery<NexusStoreOverview>({
    queryKey: ["nexus-store-overview", rep, store, client, banner],
    queryFn: async () => {
      const qp = buildInsightsQuery(rep, store, client, banner);
      const res = await fetch(`/api/nexus/store-overview?${qp.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch Nexus store overview");
      return res.json();
    },
    enabled: !!store && !!client,
    staleTime: 30000,
  });

  const goTo = (path: string) => {
    const qp = buildInsightsQuery(rep, store, client, banner);
    setLocation(`${path}?${qp.toString()}`);
  };

  return (
    <div style={insightsPageStyle}>
      <div style={{ padding: "20px 20px 0" }}>
        <div
          style={{ fontSize: 13, color: INSIGHTS_COLORS.textDim, cursor: "pointer" }}
          onClick={() => setLocation(`/store-overview?${buildInsightsQuery(rep, store, client, banner).toString()}`)}
        >
          ‹ Store Overview
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", marginTop: 10 }}>
          {data?.storeName || store || "Insights"}
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: INSIGHTS_COLORS.textFaint, fontSize: 13 }}>
          Loading Nexus data…
        </div>
      )}

      {!isLoading && data && !data.found && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: INSIGHTS_COLORS.textFaint, fontSize: 13 }}>
          No Nexus data found for this store/client/banner combination.
        </div>
      )}

      {!isLoading && data?.found && (
        <>
          <div style={{ padding: "15px 20px 0" }}>
            <div
              style={{
                background: "linear-gradient(160deg,#12293F 0%,#0D2137 100%)",
                border: "1px solid #24455f",
                borderRadius: 8,
                padding: "15px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ fontSize: 38, fontWeight: 700, color: healthColor(data.healthScore), lineHeight: 0.9, letterSpacing: "-0.03em" }}>
                    {data.healthScore ?? "—"}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: INSIGHTS_COLORS.textDim, marginTop: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Health
                  </div>
                </div>
                <div style={{ width: 1, alignSelf: "stretch", background: "#24455f" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "#fff", lineHeight: 1.35 }}>
                    {data.oosCount ? `${data.oosCount} lines out of stock, ${data.fixReplenishNow ?? 0} replenishable from DC now.` : "No availability issues flagged."}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: "9px 20px 0" }}>
            <div
              style={{ ...panelStyle, padding: "14px 15px", borderLeft: `2px solid ${INSIGHTS_COLORS.accent}`, display: "flex", alignItems: "center", gap: 11, background: "#11283e", cursor: data.fixTotal ? "pointer" : "default" }}
              onClick={() => data.fixTotal && goTo("/store-overview/insights/line-list/oos")}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16.5, fontWeight: 700, color: "#fff" }}>Fix</div>
                <div style={{ fontSize: 11, color: INSIGHTS_COLORS.textMuted, marginTop: 4 }}>
                  {data.fixReplenishNow ?? 0} you can order today · {data.fixEscalate ?? 0} to escalate
                </div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: INSIGHTS_COLORS.accent }}>{data.fixTotal ?? 0}</div>
              <div style={{ fontSize: 15, color: INSIGHTS_COLORS.textFaint }}>›</div>
            </div>
          </div>

          <div style={{ padding: "17px 20px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: INSIGHTS_COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>All measures</div>
              <div style={{ flex: 1, height: 1, background: INSIGHTS_COLORS.panelBorder }} />
            </div>
            <div style={{ ...panelStyle, overflow: "hidden" }}>
              <MeasureRow
                label="Availability"
                sub={`${data.oosCount ?? 0} out · ${data.lowStockCount ?? 0} low`}
                value={data.availabilityPct != null ? `${data.availabilityPct}%` : "—"}
                valueColor={healthColor(data.availabilityPct)}
                onClick={() => goTo("/store-overview/insights/availability")}
              />
              <MeasureRow label="Sales" sub={`${data.salesP4 ?? 0} units · last 4 wks`} value="—" onClick={() => {}} disabled />
              <MeasureRow label="Weeks of cover" sub={`${data.storeSOH ?? 0} units on hand`} value="—" onClick={() => {}} disabled />
              <MeasureRow label="Line mix" sub="Availability + overstock split" value={`${data.totalSkus ?? "—"}`} onClick={() => goTo("/store-overview/insights/availability")} />
              <MeasureRow label="Distribution gaps" sub="Not built yet" value="—" onClick={() => {}} disabled last />
            </div>
          </div>
        </>
      )}

      <BottomNav rep={rep} store={store} client={client} />
    </div>
  );
}

function MeasureRow({
  label,
  sub,
  value,
  valueColor,
  onClick,
  disabled,
  last,
}: {
  label: string;
  sub: string;
  value: string;
  valueColor?: string;
  onClick: () => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 13px",
        display: "flex",
        alignItems: "center",
        gap: 11,
        borderBottom: last ? "none" : `1px solid ${INSIGHTS_COLORS.panelLine}`,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
      onClick={disabled ? undefined : onClick}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: INSIGHTS_COLORS.text }}>{label}</div>
        <div style={{ fontSize: 10.5, color: INSIGHTS_COLORS.textDim, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: valueColor || INSIGHTS_COLORS.text }}>{value}</div>
      {!disabled && <div style={{ fontSize: 14, color: INSIGHTS_COLORS.textFaint }}>›</div>}
    </div>
  );
}
