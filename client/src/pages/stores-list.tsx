import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, ChevronRight, Store as StoreIcon } from "lucide-react";
import { COLORS, DOT_MATRIX_BG, HEX_OUTLINE_PATTERN_BG } from "@/lib/design-tokens";
import { BottomNav } from "@/pages/rep-home";

const NAVY_DEEP = COLORS.bgPrimary;
const NAVY_ELEVATED = COLORS.navyElevated;
const ORANGE = COLORS.orange;
const TEXT_MUTED = COLORS.textMuted;
const LINE_BLUE = COLORS.lineBlue;

type Filter = "all" | "issues" | "no-issues";

export default function StoresList() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const rep = params.get("rep") || "";
  const role = params.get("role") || "Rep";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const { data: storesData } = useQuery({
    queryKey: ["roster-stores-for-name", rep],
    queryFn: async () => {
      const res = await fetch(`/api/roster/stores-for-name?name=${encodeURIComponent(rep)}`);
      if (!res.ok) throw new Error("Failed to fetch stores");
      return res.json();
    },
    enabled: !!rep,
  });

  // Real, LIVE issue counts straight from Nexus - not generated task data
  // (confirmed correct approach 2026-08-08).
  const { data: liveIssuesData } = useQuery({
    queryKey: ["live-issue-counts", rep],
    queryFn: async () => {
      const res = await fetch(`/api/roster/live-issue-counts?name=${encodeURIComponent(rep)}`);
      if (!res.ok) throw new Error("Failed to fetch live issue counts");
      return res.json();
    },
    enabled: !!rep,
    staleTime: 5 * 60 * 1000,
  });

  const stores: string[] = storesData?.stores || [];
  const liveCounts: Record<string, number> = liveIssuesData?.counts || {};

  const issueCountByStore = useMemo(() => {
    const map = new Map<string, number>();
    for (const [storeName, count] of Object.entries(liveCounts)) {
      map.set(storeName, count);
    }
    return map;
  }, [liveCounts]);

  const withIssuesCount = stores.filter((s) => (issueCountByStore.get(s) || 0) > 0).length;
  const noIssuesCount = stores.length - withIssuesCount;

  const filtered = useMemo(() => {
    let list = stores;
    if (filter === "issues") list = list.filter((s) => (issueCountByStore.get(s) || 0) > 0);
    if (filter === "no-issues") list = list.filter((s) => (issueCountByStore.get(s) || 0) === 0);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((store) => store.toLowerCase().includes(s));
    }
    return [...list].sort((a, b) => (issueCountByStore.get(b) || 0) - (issueCountByStore.get(a) || 0));
  }, [stores, filter, search, issueCountByStore]);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: NAVY_DEEP, paddingBottom: "max(90px, env(safe-area-inset-bottom, 0px) + 70px)" }}>
      <div style={{ padding: "max(1.25rem, env(safe-area-inset-top, 0px) + 0.75rem) 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => setLocation(`/home?rep=${encodeURIComponent(rep)}&role=${role}`)}
            data-testid="button-back-home"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#F7F9FC", padding: 4 }}
          >
            <ArrowLeft style={{ width: 22, height: 22 }} />
          </button>
          <div>
            <h1 style={{ color: "#F7F9FC", fontSize: 20, fontWeight: 700 }}>Stores</h1>
            <p style={{ color: TEXT_MUTED, fontSize: 13 }}>Browse and select a store</p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            height: 48,
            border: `1px solid ${LINE_BLUE}`,
            borderRadius: 14,
            background: NAVY_ELEVATED,
            padding: "0 14px",
            marginBottom: 14,
          }}
        >
          <Search style={{ width: 18, height: 18, color: TEXT_MUTED, flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stores..."
            data-testid="input-search-stores"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#F7F9FC", fontSize: 15 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 18, paddingBottom: 2 }}>
          <FilterChip label={`All (${stores.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterChip label={`With Issues (${withIssuesCount})`} active={filter === "issues"} onClick={() => setFilter("issues")} color="#F87171" />
          <FilterChip label={`No Issues (${noIssuesCount})`} active={filter === "no-issues"} onClick={() => setFilter("no-issues")} color="#4ADE80" />
        </div>

        <div style={{ border: `1px solid ${LINE_BLUE}`, borderRadius: 16, overflow: "hidden" }}>
          {filtered.map((store, i) => {
            const pending = issueCountByStore.get(store) || 0;
            return (
              <button
                key={store}
                onClick={() => setLocation(`/store-detail?store=${encodeURIComponent(store)}&rep=${encodeURIComponent(rep)}`)}
                data-testid={`row-store-${store}`}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px",
                  background: "none",
                  border: "none",
                  borderTop: i > 0 ? `1px solid ${LINE_BLUE}` : "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: "50%", border: `1px solid ${LINE_BLUE}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <StoreIcon style={{ width: 18, height: 18, color: TEXT_MUTED }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, color: "#F7F9FC", fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {store.toUpperCase()}
                </div>
                {pending > 0 ? (
                  <span style={{ background: "rgba(248,113,113,0.15)", color: "#F87171", fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "4px 10px", flexShrink: 0 }}>
                    {pending} ISSUE{pending === 1 ? "" : "S"}
                  </span>
                ) : (
                  <span style={{ background: "rgba(74,222,128,0.15)", color: "#4ADE80", fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "4px 10px", flexShrink: 0 }}>
                    NO ISSUES
                  </span>
                )}
                <ChevronRight style={{ width: 16, height: 16, color: TEXT_MUTED, flexShrink: 0 }} />
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p style={{ color: TEXT_MUTED, fontSize: 14, padding: 24, textAlign: "center" }}>No stores match.</p>
          )}
        </div>
      </div>

      <BottomNav active="stores" rep={rep} role={role} />
    </div>
  );
}

function FilterChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: "8px 14px",
        borderRadius: 20,
        border: `1px solid ${active ? (color || ORANGE) : LINE_BLUE}`,
        background: active ? "rgba(255,121,0,0.08)" : "transparent",
        color: active ? (color || ORANGE) : TEXT_MUTED,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}
