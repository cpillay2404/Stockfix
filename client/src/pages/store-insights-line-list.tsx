import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import BottomNav from "@/components/BottomNav";
import { INSIGHTS_COLORS, insightsPageStyle, panelStyle, buildInsightsQuery } from "@/lib/insights-theme";

interface NexusLineListRow {
  barcode: string;
  articleDescription: string;
  brand: string;
  category: string;
  estimatedMissedUnits: number | null;
  dcSOH: number | null;
  consecutiveWeeksOOS: number | null;
}

interface NexusLineList {
  classification: string;
  total: number;
  rows: NexusLineListRow[];
}

const TITLES: Record<string, string> = {
  oos: "Out of stock",
  low: "Low stock",
  nosales: "No sales, stock present",
  overstock: "Overstocked",
};

export default function StoreInsightsLineList() {
  const [, setLocation] = useLocation();
  const [, routeParams] = useRoute("/store-overview/insights/line-list/:classification");
  const classification = routeParams?.classification || "oos";
  const params = new URLSearchParams(useSearch());
  const rep = params.get("rep") || "";
  const store = params.get("store") || "";
  const client = params.get("client") || "";
  const banner = params.get("banner") || "";

  const { data, isLoading } = useQuery<NexusLineList>({
    queryKey: ["nexus-line-list", rep, store, client, banner, classification],
    queryFn: async () => {
      const qp = buildInsightsQuery(rep, store, client, banner);
      qp.set("classification", classification);
      const res = await fetch(`/api/nexus/line-list?${qp.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch Nexus line list");
      return res.json();
    },
    enabled: !!store && !!client,
    staleTime: 30000,
  });

  const goToSku = (barcode: string) => {
    const qp = buildInsightsQuery(rep, store, client, banner);
    setLocation(`/store-overview/insights/sku/${encodeURIComponent(barcode)}?${qp.toString()}`);
  };

  return (
    <div style={insightsPageStyle}>
      <div style={{ padding: "20px 20px 0" }}>
        <div
          style={{ fontSize: 13, color: INSIGHTS_COLORS.textDim, cursor: "pointer" }}
          onClick={() => setLocation(`/store-overview/insights/availability?${buildInsightsQuery(rep, store, client, banner).toString()}`)}
        >
          ‹ Availability
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 13 }}>
          <div style={{ fontSize: 21, fontWeight: 700, color: "#fff" }}>{TITLES[classification] || classification}</div>
          <div style={{ fontSize: 21, fontWeight: 700, color: INSIGHTS_COLORS.red }}>{data?.total ?? "—"}</div>
        </div>
        <div style={{ fontSize: 12, color: INSIGHTS_COLORS.textDim, marginTop: 5 }}>Sorted by units missed per week</div>
      </div>

      {isLoading && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: INSIGHTS_COLORS.textFaint, fontSize: 13 }}>
          Loading…
        </div>
      )}

      {!isLoading && data && data.rows.length === 0 && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: INSIGHTS_COLORS.textFaint, fontSize: 13 }}>
          No lines in this classification for this store.
        </div>
      )}

      {!isLoading && data && data.rows.length > 0 && (
        <div style={{ padding: "13px 20px 0", display: "flex", flexDirection: "column", gap: 7 }}>
          {data.rows.map((row) => (
            <div
              key={row.barcode}
              style={{ ...panelStyle, padding: "11px 13px", cursor: "pointer" }}
              onClick={() => goToSku(row.barcode)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: INSIGHTS_COLORS.text, lineHeight: 1.3 }}>
                    {row.articleDescription || row.barcode}
                  </div>
                  <div style={{ fontSize: 10.5, color: INSIGHTS_COLORS.textFaint, marginTop: 3 }}>
                    {row.brand} · {row.barcode}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: INSIGHTS_COLORS.accent, lineHeight: 1 }}>
                    {row.estimatedMissedUnits ?? "—"}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: INSIGHTS_COLORS.textFaint, marginTop: 3 }}>/wk</div>
                </div>
                <div style={{ fontSize: 14, color: INSIGHTS_COLORS.textFaint }}>›</div>
              </div>
              <div style={{ fontSize: 10.5, color: INSIGHTS_COLORS.textDim, marginTop: 7 }}>
                {row.consecutiveWeeksOOS ? `Out ${row.consecutiveWeeksOOS} wk${row.consecutiveWeeksOOS !== 1 ? "s" : ""} · ` : ""}
                {row.dcSOH != null ? (
                  row.dcSOH > 0 ? (
                    <span style={{ color: INSIGHTS_COLORS.green }}>DC has {row.dcSOH}</span>
                  ) : (
                    <span style={{ color: INSIGHTS_COLORS.red }}>no DC stock</span>
                  )
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <BottomNav rep={rep} store={store} client={client} />
    </div>
  );
}
