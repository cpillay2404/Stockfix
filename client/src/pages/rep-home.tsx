import { useMemo, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Menu, RefreshCw, ChevronRight, Store as StoreIcon, Search, Filter, Home } from "lucide-react";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import { COLORS, DOT_MATRIX_BG, HEX_OUTLINE_PATTERN_BG } from "@/lib/design-tokens";

const NAVY_DEEP = COLORS.bgPrimary;
const NAVY_ELEVATED = COLORS.navyElevated;
const ORANGE = COLORS.orange;
const TEXT_MUTED = COLORS.textMuted;
const LINE_BLUE = COLORS.lineBlue;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

interface StoreRow {
  storeName: string;
  banner: string | null;
  pending: number;
}

export default function RepHome() {
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const rep = params.get("rep") || "";
  const role = params.get("role") || "Rep";
  const preselectedStore = params.get("store") || "";
  // Real bug found 2026-08-20 (Carin: "why does a Sodastream dedicated rep
  // when i log in as her show all clients... applies to merchandisers
  // too") - select-rep-store.tsx now passes this along for any dedicated
  // (non-SYNDICATED) person, but it must keep flowing through every
  // onward navigation here or it's lost the moment they land on Home.
  const client = params.get("client") || "";
  const clientQS = client ? `&client=${encodeURIComponent(client)}` : "";
  const [search, setSearch] = useState("");

  // Store-first login flow (2026-08-12): the store was already picked on
  // the login screen, so landing here and making the rep pick it again
  // from a list would be redundant - go straight to that store's overview.
  useEffect(() => {
    if (preselectedStore) {
      setLocation(`/store-detail?store=${encodeURIComponent(preselectedStore)}&rep=${encodeURIComponent(rep)}${clientQS}`);
    }
  }, [preselectedStore, rep, clientQS, setLocation]);

  // Real per-person store list (store_assignments), not inferred from task
  // history - a person with zero pending tasks still has their full store
  // list (confirmed fixed 2026-08-08).
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
  // (confirmed correct approach 2026-08-08: Nexus already computes this,
  // no need to wait on a task pipeline just to show a count).
  const { data: liveIssuesData, isLoading: issuesLoading } = useQuery({
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
  const bannerByStore: Record<string, string> = storesData?.bannerByStore || {};
  const liveCounts: Record<string, number> = liveIssuesData?.counts || {};

  const storeRows: StoreRow[] = useMemo(() => {
    let list: StoreRow[] = stores.map((s) => ({
      storeName: s,
      banner: bannerByStore[s] || null,
      pending: liveCounts[s] ?? 0,
    }));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.storeName.toLowerCase().includes(q));
    }
    return list.sort((a, b) => b.pending - a.pending);
  }, [stores, search, liveCounts, bannerByStore]);

  if (preselectedStore) {
    return null;
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: NAVY_DEEP, paddingBottom: "max(90px, env(safe-area-inset-bottom, 0px) + 70px)" }}
    >
      <BackgroundPatterns />

      <div className="relative" style={{ padding: "max(1.25rem, env(safe-area-inset-top, 0px) + 0.75rem) 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setLocation(`/select-rep?role=${encodeURIComponent(role)}`)}
              style={{ background: "none", border: 0, padding: 0, display: "flex" }}
              aria-label="Switch store or rep"
            >
              <Menu style={{ width: 24, height: 24, color: "#F7F9FC" }} />
            </button>
            <img src={meridianGroupLogo} alt="Meridian Group" style={{ height: 24 }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#38BDF8", fontSize: 13 }}>
              <RefreshCw style={{ width: 15, height: 15 }} />
              Synced
            </div>
          </div>
        </div>

        <h1 style={{ color: "#F7F9FC", fontSize: 24, fontWeight: 700 }}>
          {greeting()}, {rep ? rep.split(" ")[0] : role}
        </h1>
        <p style={{ color: TEXT_MUTED, fontSize: 14, marginTop: 4 }}>Select a store to view inventory and take action.</p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, marginBottom: 12 }}>
          <h2 style={{ color: "#F7F9FC", fontSize: 17, fontWeight: 700 }}>Stores to Visit</h2>
          <button
            onClick={() => setLocation(`/stores?rep=${encodeURIComponent(rep)}&role=${role}${clientQS}`)}
            data-testid="link-view-all-stores"
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#38BDF8", fontSize: 14, cursor: "pointer" }}
          >
            View all <ChevronRight style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 46,
              border: `1px solid ${LINE_BLUE}`,
              borderRadius: 14,
              background: NAVY_ELEVATED,
              padding: "0 14px",
            }}
          >
            <Search style={{ width: 17, height: 17, color: TEXT_MUTED, flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search store name..."
              data-testid="input-search-home-stores"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#F7F9FC", fontSize: 14 }}
            />
          </div>
          <button
            onClick={() => setLocation(`/stores?rep=${encodeURIComponent(rep)}&role=${role}${clientQS}`)}
            data-testid="button-filter"
            style={{ width: 46, height: 46, border: `1px solid ${LINE_BLUE}`, borderRadius: 14, background: NAVY_ELEVATED, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <Filter style={{ width: 17, height: 17, color: TEXT_MUTED }} />
          </button>
        </div>

        <div style={{ border: `1px solid ${LINE_BLUE}`, borderRadius: 16, overflow: "hidden" }}>
          {storeRows.slice(0, 8).map((s, i) => (
            <button
              key={s.storeName}
              onClick={() => setLocation(`/store-detail?store=${encodeURIComponent(s.storeName)}&rep=${encodeURIComponent(rep)}${clientQS}`)}
              data-testid={`row-store-${s.storeName}`}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "14px 16px",
                background: "none",
                border: "none",
                borderTop: i > 0 ? `1px solid ${LINE_BLUE}` : "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  border: `1px solid ${s.pending > 0 ? LINE_BLUE : "#1E7A46"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <StoreIcon style={{ width: 19, height: 19, color: s.pending > 0 ? "#5B9BD5" : "#4ADE80" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "#F7F9FC", fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.storeName.toUpperCase()}
                </div>
                <div style={{ color: TEXT_MUTED, fontSize: 12, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.banner || "—"}
                </div>
              </div>
              {s.pending > 0 ? (
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ color: ORANGE, fontSize: 20, fontWeight: 800 }}>{s.pending}</div>
                  <div style={{ color: TEXT_MUTED, fontSize: 11 }}>issues</div>
                </div>
              ) : (
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ color: "#4ADE80", fontSize: 20, fontWeight: 800 }}>0</div>
                  <div style={{ color: TEXT_MUTED, fontSize: 11 }}>issues</div>
                </div>
              )}
              <ChevronRight style={{ width: 16, height: 16, color: TEXT_MUTED, flexShrink: 0 }} />
            </button>
          ))}
          {storeRows.length === 0 && (
            <p style={{ color: TEXT_MUTED, fontSize: 14, padding: 20, textAlign: "center" }}>No stores found for this {role.toLowerCase()}.</p>
          )}
        </div>
      </div>

      <BottomNav active="home" rep={rep} role={role} />
    </div>
  );
}

function KpiTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ border: `1px solid ${LINE_BLUE}`, borderRadius: 14, padding: 14, background: NAVY_ELEVATED }}>
      <div style={{ color: TEXT_MUTED, fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontSize: 26, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function BackgroundPatterns() {
  return (
    <>
      <div
        className="absolute top-0 left-0 w-1/2 h-64 pointer-events-none"
        style={{
          backgroundImage: `url("${DOT_MATRIX_BG}")`,
          backgroundSize: "18px 18px",
          maskImage: "radial-gradient(circle at 0% 0%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle at 0% 0%, black 0%, transparent 75%)",
        }}
      />
      <div
        className="absolute top-0 right-0 w-1/2 h-64 pointer-events-none"
        style={{
          backgroundImage: `url("${HEX_OUTLINE_PATTERN_BG}")`,
          backgroundSize: "40px 46px",
          maskImage: "radial-gradient(circle at 100% 0%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle at 100% 0%, black 0%, transparent 75%)",
        }}
      />
    </>
  );
}

export function BottomNav({ active, rep, role }: { active: string; rep: string; role: string }) {
  const [, setLocation] = useLocation();
  const qs = `?rep=${encodeURIComponent(rep)}&role=${role}`;
  // Real bug found 2026-08-19 (Carin: "please remove tasks, this the old
  // apps tasks page") - the Tasks tab pointed at /tasks (dashboard.tsx),
  // deleted today along with the rest of the old pre-redesign flow.
  const items = [
    { key: "home", label: "Home", icon: Home, path: `/home${qs}` },
    { key: "stores", label: "Stores", icon: StoreIcon, path: `/stores${qs}` },
  ];
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "space-around",
        background: NAVY_ELEVATED,
        borderTop: `1px solid ${LINE_BLUE}`,
        padding: "10px 0 max(10px, env(safe-area-inset-bottom, 0px))",
      }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => setLocation(item.path)}
          data-testid={`nav-${item.key}`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: active === item.key ? ORANGE : TEXT_MUTED,
            fontSize: 12,
          }}
        >
          <item.icon size={20} />
          {item.label}
        </button>
      ))}
    </div>
  );
}
