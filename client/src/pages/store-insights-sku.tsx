import { useState } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import BottomNav from "@/components/BottomNav";
import { INSIGHTS_COLORS, insightsPageStyle, panelStyle, buildInsightsQuery } from "@/lib/insights-theme";

interface NexusSkuRow {
  storeName: string;
  banner: string;
  storeSOH: number | null;
  dcSOH: number | null;
  sellOutP4Weeks: number | null;
  classification: string;
  consecutiveWeeksOOS: number | null;
}

interface NexusSkuRecord {
  barcode: string;
  scope: string;
  storeCount: number;
  rows: NexusSkuRow[];
}

export default function StoreInsightsSku() {
  const [, setLocation] = useLocation();
  const [, routeParams] = useRoute("/store-overview/insights/sku/:barcode");
  const barcode = routeParams?.barcode ? decodeURIComponent(routeParams.barcode) : "";
  const params = new URLSearchParams(useSearch());
  const rep = params.get("rep") || "";
  const store = params.get("store") || "";
  const client = params.get("client") || "";
  const banner = params.get("banner") || "";

  const [scope, setScope] = useState<"this-store" | "all-mine">("this-store");

  const { data, isLoading } = useQuery<NexusSkuRecord>({
    queryKey: ["nexus-sku-record", barcode, rep, store, client, scope],
    queryFn: async () => {
      const qp = new URLSearchParams();
      qp.set("barcode", barcode);
      qp.set("client", client);
      qp.set("scope", scope);
      if (store) qp.set("store", store);
      if (rep) qp.set("rep", rep);
      const res = await fetch(`/api/nexus/sku-record?${qp.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch Nexus SKU record");
      return res.json();
    },
    enabled: !!barcode && !!client,
    staleTime: 30000,
  });

  const thisStoreRow = data?.rows.find((r) => r.storeName?.toLowerCase() === store.toLowerCase());

  return (
    <div style={insightsPageStyle}>
      <div style={{ padding: "20px 20px 0" }}>
        <div
          style={{ fontSize: 13, color: INSIGHTS_COLORS.textDim, cursor: "pointer" }}
          onClick={() => setLocation(`/store-overview/insights/availability?${buildInsightsQuery(rep, store, client, banner).toString()}`)}
        >
          ‹ Back
        </div>
        <div style={{ fontSize: 17.5, fontWeight: 700, color: "#fff", marginTop: 13, lineHeight: 1.3 }}>
          {barcode}
        </div>
        <div style={{ fontSize: 11, color: INSIGHTS_COLORS.textFaint, marginTop: 4 }}>{client}</div>
      </div>

      <div style={{ padding: "15px 20px 0" }}>
        <div style={{ display: "flex", background: "#0A1F32", border: `1px solid ${INSIGHTS_COLORS.panelBorder}`, borderRadius: 7, padding: 3 }}>
          <div
            style={{
              flex: 1,
              height: 29,
              borderRadius: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: scope === "this-store" ? INSIGHTS_COLORS.accent : "transparent",
              cursor: "pointer",
            }}
            onClick={() => setScope("this-store")}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: scope === "this-store" ? "#0A1F32" : INSIGHTS_COLORS.textMuted }}>
              This store
            </div>
          </div>
          <div
            style={{
              flex: 1,
              height: 29,
              borderRadius: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: scope === "all-mine" ? INSIGHTS_COLORS.accent : "transparent",
              cursor: "pointer",
            }}
            onClick={() => setScope("all-mine")}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: scope === "all-mine" ? "#0A1F32" : INSIGHTS_COLORS.textMuted }}>
              All stores I cover
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: INSIGHTS_COLORS.textFaint, fontSize: 13 }}>
          Loading…
        </div>
      )}

      {!isLoading && data && scope === "this-store" && thisStoreRow && (
        <div style={{ padding: "13px 20px 0" }}>
          <div style={{ ...panelStyle, padding: "10px 12px", display: "flex", gap: 7 }}>
            <Stat label="Store SOH" value={thisStoreRow.storeSOH ?? "—"} color={INSIGHTS_COLORS.text} />
            <Stat label="At the DC" value={thisStoreRow.dcSOH ?? "—"} color={(thisStoreRow.dcSOH ?? 0) > 0 ? INSIGHTS_COLORS.green : INSIGHTS_COLORS.red} />
            <Stat label="Sales/4wk" value={thisStoreRow.sellOutP4Weeks ?? "—"} color={INSIGHTS_COLORS.text} />
          </div>
        </div>
      )}

      {!isLoading && data && scope === "this-store" && !thisStoreRow && (
        <div style={{ padding: "20px 20px 0", fontSize: 12.5, color: INSIGHTS_COLORS.textFaint, textAlign: "center" }}>
          Not found at this specific store in the current data.
        </div>
      )}

      {!isLoading && data && scope === "all-mine" && (
        <div style={{ padding: "13px 20px 0" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: INSIGHTS_COLORS.textDim, marginBottom: 9, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {data.storeCount} store{data.storeCount !== 1 ? "s" : ""} you cover
          </div>
          <div style={{ ...panelStyle, overflow: "hidden" }}>
            {data.rows.map((r, i) => (
              <div
                key={`${r.storeName}-${i}`}
                style={{
                  padding: "10px 13px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderBottom: i === data.rows.length - 1 ? "none" : `1px solid ${INSIGHTS_COLORS.panelLine}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: INSIGHTS_COLORS.text, textTransform: "uppercase" }}>{r.storeName}</div>
                  <div style={{ fontSize: 10.5, color: INSIGHTS_COLORS.textDim, marginTop: 2 }}>{r.banner} · {r.classification}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: (r.storeSOH ?? 0) > 0 ? INSIGHTS_COLORS.text : INSIGHTS_COLORS.red }}>
                  {r.storeSOH ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: "16px 20px 0" }}>
        <div
          style={{
            background: INSIGHTS_COLORS.accentSoft,
            border: `1px solid ${INSIGHTS_COLORS.accent}`,
            borderRadius: 8,
            padding: 14,
            textAlign: "center",
            fontSize: 14.5,
            fontWeight: 600,
            color: INSIGHTS_COLORS.accent,
            opacity: 0.6,
          }}
        >
          Capture what's on the shelf (coming soon)
        </div>
      </div>

      <BottomNav rep={rep} store={store} client={client} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ flex: 1, padding: "10px 12px" }}>
      <div style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 500, color: INSIGHTS_COLORS.textFaint, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
    </div>
  );
}
