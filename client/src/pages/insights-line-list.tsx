import { useState } from "react";
import { useLocation, useSearch, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { fetchNexusLineList, type NexusLineListRecord } from "@/lib/nexus-api";

const NAVY = "#071A2D";
const PANEL = "#0D2137";
const ORANGE = "#F58220";

type FilterChip = "dc-has-stock" | "chronic";

export default function InsightsLineList() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const routeParams = useParams<{ classification: string }>();
  const classification = decodeURIComponent(routeParams.classification || "");
  const params = new URLSearchParams(searchString);

  const rep = params.get("rep") || "";
  const store = params.get("store") || "";
  const client = params.get("client") || "";

  const backParams = new URLSearchParams();
  if (rep) backParams.set("rep", rep);
  if (store) backParams.set("store", store);
  if (client) backParams.set("client", client);

  const [activeChips, setActiveChips] = useState<Set<FilterChip>>(new Set());

  const toggleChip = (chip: FilterChip) => {
    setActiveChips((prev) => {
      const next = new Set(prev);
      if (next.has(chip)) next.delete(chip);
      else next.add(chip);
      return next;
    });
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["nexus-line-list", rep, store, client, classification],
    queryFn: () => fetchNexusLineList({ rep, store, client, classification }),
    enabled: !!store,
    staleTime: 60_000,
  });

  const allRecords = data?.records || [];

  // Client-side filter chips over the already-fetched list — the API
  // doesn't have dedicated dc-has-stock/chronic query params, so this stays
  // a pure client-side toggle rather than a separate query.
  let filtered = allRecords;
  if (activeChips.has("dc-has-stock")) {
    filtered = filtered.filter((r) => r.dcHasStock);
  }
  if (activeChips.has("chronic")) {
    filtered = filtered.filter((r) => r.chronic);
  }

  const sorted = [...filtered].sort((a, b) => (b.unitsMissedPerWeek || 0) - (a.unitsMissedPerWeek || 0));

  const dcHasStockCount = allRecords.filter((r) => r.dcHasStock).length;
  const chronicCount = allRecords.filter((r) => r.chronic).length;

  const goToSku = (barcode: string) => {
    const p = new URLSearchParams(backParams);
    setLocation(`/store-overview/insights/sku/${encodeURIComponent(barcode)}?${p.toString()}`);
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: NAVY, paddingBottom: "70px", color: "#FFFFFF" }}>
      <div style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <button
            onClick={() => setLocation(`/store-overview/insights/availability?${backParams.toString()}`)}
            data-testid="button-back-line-list"
            style={{ display: "flex", alignItems: "center", gap: "4px", color: "rgba(255,255,255,0.8)", background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "14px" }}
          >
            <ArrowLeft style={{ width: "18px", height: "18px" }} />
            <span>Back</span>
          </button>
          <h1 style={{ fontSize: "15px", fontWeight: 700, color: "#FFFFFF", margin: 0 }} data-testid="text-page-title">
            {classification}
          </h1>
          <div style={{ width: "40px" }} />
        </div>

        {isLoading && <div style={{ padding: "12px", color: "rgba(255,255,255,0.7)" }}>Loading line list...</div>}
        {isError && (
          <div data-testid="nexus-error" style={{ backgroundColor: PANEL, borderRadius: "10px", padding: "12px", color: ORANGE, fontSize: "13px", marginBottom: "12px" }}>
            Couldn't load Nexus data: {(error as Error)?.message || "unknown error"}
          </div>
        )}

        {/* Filter chips */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <button
            onClick={() => toggleChip("dc-has-stock")}
            data-testid="filter-chip-dc-has-stock"
            style={{
              borderRadius: "999px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 600,
              border: activeChips.has("dc-has-stock") ? `1px solid ${ORANGE}` : "1px solid rgba(255,255,255,0.2)",
              backgroundColor: activeChips.has("dc-has-stock") ? ORANGE : "transparent",
              color: activeChips.has("dc-has-stock") ? NAVY : "#FFFFFF",
              cursor: "pointer",
            }}
          >
            DC has stock {dcHasStockCount}
          </button>
          <button
            onClick={() => toggleChip("chronic")}
            data-testid="filter-chip-chronic"
            style={{
              borderRadius: "999px",
              padding: "6px 12px",
              fontSize: "12px",
              fontWeight: 600,
              border: activeChips.has("chronic") ? `1px solid ${ORANGE}` : "1px solid rgba(255,255,255,0.2)",
              backgroundColor: activeChips.has("chronic") ? ORANGE : "transparent",
              color: activeChips.has("chronic") ? NAVY : "#FFFFFF",
              cursor: "pointer",
            }}
          >
            Chronic {chronicCount}
          </button>
        </div>

        {/* SKU list sorted by units missed/week */}
        <div style={{ backgroundColor: PANEL, borderRadius: "10px", overflow: "hidden" }}>
          {sorted.length === 0 && !isLoading && (
            <div style={{ padding: "16px", fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>No SKUs match this filter.</div>
          )}
          {sorted.map((r: NexusLineListRecord, i) => (
            <button
              key={`${r.barcode}-${i}`}
              onClick={() => goToSku(r.barcode)}
              data-testid={`line-list-row-${r.barcode}`}
              style={{
                width: "100%",
                textAlign: "left",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                background: "none",
                border: "none",
                borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.08)",
                color: "#FFFFFF",
                cursor: "pointer",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.articleDescription}
                </div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>{r.barcode}</div>
              </div>
              <div style={{ fontFamily: "monospace", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: ORANGE, flexShrink: 0, marginLeft: "8px" }}>
                {r.unitsMissedPerWeek}/wk
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
