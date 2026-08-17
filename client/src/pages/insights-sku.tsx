import { useState } from "react";
import { useLocation, useSearch, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, ScanLine } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { fetchNexusSkuRecord } from "@/lib/nexus-api";

const NAVY = "#071A2D";
const PANEL = "#0D2137";
const ORANGE = "#F58220";

type Scope = "this-store" | "all-mine";

// Plain-English root-cause sentence, derived from the response's
// rootCauseHint field using simple fixed rules (no ML/heuristics beyond a
// switch statement).
function rootCauseSentence(hint: string | undefined, dcStock: number, storeSoh: number): string {
  switch (hint) {
    case "dc-no-stock":
      return "The DC has no stock — this can't be fixed by ordering more right now.";
    case "dc-has-stock-not-ordered":
      return "The DC has stock but it isn't being ordered into this store.";
    case "no-sales":
      return "There's stock in the store but it isn't selling.";
    default:
      if (dcStock > 0 && storeSoh === 0) return "The DC has stock but it isn't being ordered into this store.";
      if (dcStock === 0) return "The DC has no stock — this can't be fixed by ordering more right now.";
      return "Cause not yet confirmed for this SKU.";
  }
}

export default function InsightsSku() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const routeParams = useParams<{ barcode: string }>();
  const barcode = decodeURIComponent(routeParams.barcode || "");
  const params = new URLSearchParams(searchString);

  const rep = params.get("rep") || "";
  const store = params.get("store") || "";
  const client = params.get("client") || "";

  const backParams = new URLSearchParams();
  if (rep) backParams.set("rep", rep);
  if (store) backParams.set("store", store);
  if (client) backParams.set("client", client);

  const [scope, setScope] = useState<Scope>("this-store");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["nexus-sku-record", barcode, store, client, scope],
    queryFn: () => fetchNexusSkuRecord({ barcode, store, client, scope }),
    enabled: !!barcode,
    staleTime: 60_000,
  });

  const record = data?.records?.[0];
  const soh = record?.storeSoh13Week || [];
  const sold = record?.unitsSold13Week || [];
  const maxVal = Math.max(1, ...soh, ...sold);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: NAVY, paddingBottom: "70px", color: "#FFFFFF" }}>
      <div style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <button
            onClick={() => setLocation(`/store-overview/insights/availability?${backParams.toString()}`)}
            data-testid="button-back-sku"
            style={{ display: "flex", alignItems: "center", gap: "4px", color: "rgba(255,255,255,0.8)", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "14px" }}
          >
            <ArrowLeft style={{ width: "18px", height: "18px" }} />
            <span>Back</span>
          </button>
          <h1 style={{ fontSize: "15px", fontWeight: 700, color: "#FFFFFF", margin: 0 }} data-testid="text-page-title">
            SKU {barcode}
          </h1>
          <div style={{ width: "40px" }} />
        </div>

        {isLoading && <div style={{ padding: "12px", color: "rgba(255,255,255,0.7)" }}>Loading SKU record...</div>}
        {isError && (
          <div data-testid="nexus-error" style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px", color: ORANGE, fontSize: "13px", marginBottom: "12px" }}>
            Couldn't load Nexus data: {(error as Error)?.message || "unknown error"}
          </div>
        )}

        {record && (
          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", marginBottom: "12px" }} data-testid="sku-title">
            {record.articleDescription}
          </div>
        )}

        {/* This store vs all N of mine toggle */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <button
            onClick={() => setScope("this-store")}
            data-testid="scope-toggle-this-store"
            style={{
              flex: 1,
              borderRadius: "8px",
              padding: "8px",
              fontSize: "12px",
              fontWeight: 600,
              border: scope === "this-store" ? `1px solid ${ORANGE}` : "1px solid rgba(255,255,255,0.2)",
              backgroundColor: scope === "this-store" ? ORANGE : "transparent",
              color: scope === "this-store" ? NAVY : "#FFFFFF",
              cursor: "pointer",
            }}
          >
            This store
          </button>
          <button
            onClick={() => setScope("all-mine")}
            data-testid="scope-toggle-all-mine"
            style={{
              flex: 1,
              borderRadius: "8px",
              padding: "8px",
              fontSize: "12px",
              fontWeight: 600,
              border: scope === "all-mine" ? `1px solid ${ORANGE}` : "1px solid rgba(255,255,255,0.2)",
              backgroundColor: scope === "all-mine" ? ORANGE : "transparent",
              color: scope === "all-mine" ? NAVY : "#FFFFFF",
              cursor: "pointer",
            }}
          >
            All of mine
          </button>
        </div>

        {/* 13-week stock-on-hand and units-sold bars */}
        <div style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px", marginBottom: "12px" }}>
          <h3 style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
            13-Week Stock on Hand vs Units Sold
          </h3>
          {soh.length > 0 || sold.length > 0 ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "70px" }} data-testid="sku-13week-bars">
              {Array.from({ length: Math.max(soh.length, sold.length) }).map((_, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px", height: "100%", justifyContent: "flex-end" }}>
                  <div style={{ height: `${Math.max(2, ((sold[i] || 0) / maxVal) * 35)}px`, backgroundColor: "#3b82f6", borderRadius: "1px" }} />
                  <div style={{ height: `${Math.max(2, ((soh[i] || 0) / maxVal) * 35)}px`, backgroundColor: ORANGE, borderRadius: "1px" }} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>No 13-week history available.</div>
          )}
          <div style={{ display: "flex", gap: "12px", marginTop: "8px", fontSize: "11px", color: "rgba(255,255,255,0.6)" }}>
            <span><span style={{ display: "inline-block", width: "8px", height: "8px", backgroundColor: ORANGE, marginRight: "4px" }} />Stock on hand</span>
            <span><span style={{ display: "inline-block", width: "8px", height: "8px", backgroundColor: "#3b82f6", marginRight: "4px" }} />Units sold</span>
          </div>
        </div>

        {/* Plain-English root-cause sentence */}
        <div style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px", marginBottom: "12px", fontSize: "14px", fontWeight: 600 }} data-testid="root-cause-sentence">
          {record ? rootCauseSentence(record.rootCauseHint, record.dcStock, record.storeSoh) : "—"}
        </div>

        {/* DC stock / suggested order / peer distribution numbers */}
        <div style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px", marginBottom: "12px" }}>
          <div style={{ display: "flex", gap: "16px", fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 800 }} data-testid="stat-dc-stock">{record?.dcStock ?? 0}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}>DC stock</div>
            </div>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: ORANGE }} data-testid="stat-suggested-order">{record?.suggestedOrder ?? 0}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}>Suggested order</div>
            </div>
            <div>
              <div style={{ fontSize: "20px", fontWeight: 800 }} data-testid="stat-store-soh">{record?.storeSoh ?? 0}</div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)" }}>Store SOH</div>
            </div>
          </div>
          {record?.peerDistribution && record.peerDistribution.length > 0 && (
            <div style={{ marginTop: "10px" }}>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", marginBottom: "4px", textTransform: "uppercase" }}>Peer distribution</div>
              {record.peerDistribution.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "2px 0" }}>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>{p.store}</span>
                  <span style={{ fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}>{p.soh}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Disabled CTAs — no photo capture, no order placement, no escalation return-path */}
        <button
          disabled
          data-testid="button-capture-shelf"
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "1px dashed rgba(255,255,255,0.3)",
            backgroundColor: "transparent",
            color: "rgba(255,255,255,0.4)",
            fontSize: "13px",
            fontWeight: 600,
            marginBottom: "8px",
            cursor: "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <Camera style={{ width: "16px", height: "16px" }} />
          Capture what's on the shelf
          <span style={{ fontSize: "9px", fontWeight: 700, color: NAVY, backgroundColor: "rgba(255,255,255,0.4)", borderRadius: "8px", padding: "1px 6px" }}>
            Soon
          </span>
        </button>

        {/* "Scan a barcode" stub — matches qr.tsx's non-functional display-only convention */}
        <button
          disabled
          data-testid="button-scan-barcode"
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: "1px dashed rgba(255,255,255,0.3)",
            backgroundColor: "transparent",
            color: "rgba(255,255,255,0.4)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "not-allowed",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <ScanLine style={{ width: "16px", height: "16px" }} />
          Scan a barcode
          <span style={{ fontSize: "9px", fontWeight: 700, color: NAVY, backgroundColor: "rgba(255,255,255,0.4)", borderRadius: "8px", padding: "1px 6px" }}>
            Coming soon
          </span>
        </button>
      </div>

      <BottomNav rep={rep} store={store} client={client} />
    </div>
  );
}
