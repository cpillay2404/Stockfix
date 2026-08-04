import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import BottomNav from "@/components/BottomNav";
import { INSIGHTS_COLORS, insightsPageStyle, panelStyle, buildInsightsQuery } from "@/lib/insights-theme";

interface NexusAvailability {
  found: boolean;
  storeName?: string;
  totalSkus?: number | null;
  availabilityPct?: number | null;
  classification?: {
    outOfStock: number;
    lowStock: number;
    noSalesStockPresent: number;
    overstocked: number;
    optimal: number | null;
  };
}

const CLASS_ROWS: { key: keyof NonNullable<NexusAvailability["classification"]>; label: string; color: string; goto?: string }[] = [
  { key: "outOfStock", label: "Out of stock", color: INSIGHTS_COLORS.red, goto: "oos" },
  { key: "lowStock", label: "Low stock", color: INSIGHTS_COLORS.amber, goto: "low" },
  { key: "noSalesStockPresent", label: "No sales, stock present", color: INSIGHTS_COLORS.textFaint, goto: "nosales" },
  { key: "overstocked", label: "Overstocked", color: INSIGHTS_COLORS.slate, goto: "overstock" },
  { key: "optimal", label: "Optimal", color: INSIGHTS_COLORS.green },
];

export default function StoreInsightsAvailability() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(useSearch());
  const rep = params.get("rep") || "";
  const store = params.get("store") || "";
  const client = params.get("client") || "";
  const banner = params.get("banner") || "";

  const { data, isLoading } = useQuery<NexusAvailability>({
    queryKey: ["nexus-availability", rep, store, client, banner],
    queryFn: async () => {
      const qp = buildInsightsQuery(rep, store, client, banner);
      const res = await fetch(`/api/nexus/availability?${qp.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch Nexus availability");
      return res.json();
    },
    enabled: !!store && !!client,
    staleTime: 30000,
  });

  const goToLineList = (classification: string) => {
    const qp = buildInsightsQuery(rep, store, client, banner);
    setLocation(`/store-overview/insights/line-list/${classification}?${qp.toString()}`);
  };

  return (
    <div style={insightsPageStyle}>
      <div style={{ padding: "20px 20px 0" }}>
        <div
          style={{ fontSize: 13, color: INSIGHTS_COLORS.textDim, cursor: "pointer" }}
          onClick={() => setLocation(`/store-overview/insights?${buildInsightsQuery(rep, store, client, banner).toString()}`)}
        >
          ‹ {data?.storeName || store}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 13 }}>
          <div style={{ fontSize: 21, fontWeight: 700, color: "#fff" }}>Availability</div>
          <div style={{ fontSize: 21, fontWeight: 700, color: INSIGHTS_COLORS.red }}>
            {data?.availabilityPct != null ? `${data.availabilityPct}%` : "—"}
          </div>
        </div>
        <div style={{ fontSize: 12, color: INSIGHTS_COLORS.textDim, marginTop: 5 }}>
          {data?.totalSkus ?? "—"} lines ranged
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: INSIGHTS_COLORS.textFaint, fontSize: 13 }}>
          Loading…
        </div>
      )}

      {!isLoading && data?.classification && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: INSIGHTS_COLORS.textDim, marginBottom: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Where the {data.totalSkus ?? 0} lines sit
          </div>
          <div style={{ ...panelStyle, overflow: "hidden" }}>
            {CLASS_ROWS.map((row, i) => {
              const count = data.classification![row.key];
              return (
                <div
                  key={row.key}
                  style={{
                    padding: "10px 13px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    borderBottom: i === CLASS_ROWS.length - 1 ? "none" : `1px solid ${INSIGHTS_COLORS.panelLine}`,
                    cursor: row.goto ? "pointer" : "default",
                  }}
                  onClick={row.goto ? () => goToLineList(row.goto!) : undefined}
                >
                  <div style={{ width: 3, height: 22, borderRadius: 2, background: row.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: INSIGHTS_COLORS.text }}>{row.label}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: row.color }}>{count ?? "—"}</div>
                  {row.goto && <div style={{ fontSize: 14, color: INSIGHTS_COLORS.textFaint }}>›</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <BottomNav rep={rep} store={store} client={client} />
    </div>
  );
}
