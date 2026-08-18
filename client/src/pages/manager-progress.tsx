import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle, Users, Store, RefreshCw } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import Leaderboard from "@/components/Leaderboard";
import { COLORS } from "@/lib/design-tokens";

// Matches the dark navy/orange theme used across the rest of the app
// (Carin, 2026-08-17: "work on all screens that don't have this new navy
// blue design" - this dashboard was still on the old light/white-card
// layout while the login funnel around it had already moved to dark).
const NAVY_ELEVATED = COLORS.navyElevated;
const NAVY_DEEP = COLORS.bgPrimary;
const NAVY_CARD = COLORS.navyElevated;
const ORANGE = COLORS.orange;
const TEXT_MUTED = COLORS.textMuted;
const LINE_BLUE = COLORS.lineBlue;
const RED = "#F87171";
const GREEN = "#34D399";
const BLUE = "#60A5FA";
const AMBER = "#FBBF24";

interface KpiTileProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accentColor: string;
  testId: string;
}

function KpiTile({ label, value, icon, accentColor, testId }: KpiTileProps) {
  return (
    <div
      data-testid={testId}
      style={{
        backgroundColor: NAVY_CARD,
        borderRadius: 10,
        padding: 12,
        borderTop: `3px solid ${accentColor}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ color: accentColor, marginBottom: 4 }}>{icon}</div>
      <span style={{ fontSize: 24, fontWeight: 800, color: "#F7F9FC", fontFamily: 'monospace', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{
        fontSize: 10,
        color: TEXT_MUTED,
        textAlign: 'center',
        marginTop: 4,
        lineHeight: 1.2,
      }}>
        {label}
      </span>
    </div>
  );
}

interface RiskCardProps {
  title: string;
  icon: React.ReactNode;
  items: Array<{ name: string; value: string | number }>;
  testId: string;
}

function RiskCard({ title, icon, items, testId }: RiskCardProps) {
  if (items.length === 0) return null;

  return (
    <div
      data-testid={testId}
      style={{
        backgroundColor: "rgba(248,113,113,0.08)",
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        border: `1px solid rgba(248,113,113,0.35)`,
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
      }}>
        <div style={{ color: RED }}>{icon}</div>
        <span style={{ fontSize: 14, fontWeight: 600, color: RED }}>
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.slice(0, 5).map((item, index) => (
          <div
            key={index}
            style={{
              backgroundColor: NAVY_CARD,
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 12,
            }}
          >
            <span style={{ color: "#DCE7F7" }}>{item.name}</span>
            <span style={{ color: RED, fontWeight: 600, marginLeft: 6 }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ManagerProgress() {
  const [, setLocation] = useLocation();
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/admin/clear-cache', { method: 'POST' });
      queryClient.invalidateQueries();
    } catch (e) {
      console.error('Failed to refresh', e);
    }
    setRefreshing(false);
  };

  // Get manager from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const selectedManager = urlParams.get('manager') || '';

  // Real bug found 2026-08-18: /api/clients sources its list from the
  // legacy tasks table - switched to the real synced Nexus client list
  // (same fix already applied to the client-login dropdown).
  const { data: clientsList } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const res = await fetch('/api/roster/all-clients');
      if (!res.ok) return [];
      const data = await res.json();
      return data.clients || [];
    },
  });

  const { data: storesList } = useQuery({
    queryKey: ["stores-for-manager", selectedManager],
    queryFn: async () => {
      const res = await fetch(`/api/stores-for-manager?manager=${encodeURIComponent(selectedManager)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedManager,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["manager-progress", selectedManager, selectedRegion, selectedClient, selectedStore],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (selectedManager) queryParams.set('manager', selectedManager);
      if (selectedRegion) queryParams.set('region', selectedRegion);
      if (selectedClient) queryParams.set('client', selectedClient);
      if (selectedStore) queryParams.set('store', selectedStore);
      const res = await fetch(`/api/task-progress/manager?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch manager progress");
      return res.json();
    },
    enabled: !!selectedManager,
  });

  const handleBack = () => {
    setLocation('/select-manager');
  };

  const handleRepClick = (repName: string) => {
    setLocation(`/rep-progress?rep=${encodeURIComponent(repName)}&from=manager`);
  };

  const repsAtRisk = data?.riskAttention?.repsAtRisk || [];
  const storesAtRisk = data?.riskAttention?.storesAtRisk || [];

  const repLeaderboard = data?.repLeaderboard || [];
  const topPerformer = repLeaderboard.length > 0
    ? [...repLeaderboard].sort((a: any, b: any) => (b.completionRate ?? 0) - (a.completionRate ?? 0))[0]
    : null;
  const mostOpenRep = repLeaderboard.length > 0
    ? [...repLeaderboard].sort((a: any, b: any) => (b.open ?? 0) - (a.open ?? 0))[0]
    : null;
  const teamAvgRate = repLeaderboard.length > 0
    ? Math.round(repLeaderboard.reduce((sum: number, r: any) => sum + (r.completionRate ?? 0), 0) / repLeaderboard.length)
    : 0;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: NAVY_DEEP,
      paddingBottom: 80,
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${NAVY_ELEVATED} 0%, ${NAVY_DEEP} 100%)`,
        borderBottom: `1px solid ${LINE_BLUE}`,
        padding: 16,
        paddingTop: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button
            data-testid="back-button"
            onClick={handleBack}
            style={{
              background: 'rgba(23,68,111,0.35)',
              border: 'none',
              borderRadius: 8,
              padding: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft style={{ width: 20, height: 20, color: "#F7F9FC" }} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#F7F9FC", margin: 0 }}>
              Team Task Progress
            </h1>
            <p style={{ fontSize: 13, color: TEXT_MUTED, margin: 0 }}>
              Manager Overview
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="button-refresh"
            style={{
              background: 'rgba(23,68,111,0.35)',
              border: 'none',
              borderRadius: 8,
              padding: 8,
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            <RefreshCw style={{ width: 18, height: 18, color: "#F7F9FC", animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        {selectedManager && (
          <div style={{
            marginTop: 8,
            padding: '8px 12px',
            backgroundColor: 'rgba(255,121,0,0.12)',
            border: `1px solid rgba(255,121,0,0.3)`,
            borderRadius: 8,
            fontSize: 14,
            color: ORANGE,
            fontWeight: 600,
          }}>
            {selectedManager}'s Team
          </div>
        )}

      </div>

      <div style={{ padding: 16 }}>
        {/* Leaderboard with badges - at the very top */}
        <Leaderboard
          manager={selectedManager}
          client={selectedClient}
          limit={15}
          showTeamStats={true}
          onRepClick={handleRepClick}
        />

        {/* Team Summary - real numbers only (Carin, 2026-08-18: "i dont
            want emojis and crap... all this nonsense") */}
        {(data?.repLeaderboard?.length > 0) && (
          <div style={{
            backgroundColor: NAVY_CARD,
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#F7F9FC", marginBottom: 12 }}>
              Team Summary
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{
                backgroundColor: "rgba(52,211,153,0.1)",
                borderRadius: 6,
                padding: 10,
                borderLeft: `3px solid ${GREEN}`,
              }}>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4 }}>Top Performer</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F7F9FC" }}>
                  {topPerformer?.repName || '-'}
                </div>
                <div style={{ fontSize: 11, color: GREEN }}>
                  {topPerformer?.completionRate ?? 0}% completion
                </div>
              </div>
              <div style={{
                backgroundColor: "rgba(248,113,113,0.08)",
                borderRadius: 6,
                padding: 10,
                borderLeft: `3px solid ${RED}`,
              }}>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4 }}>Most Open Tasks</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F7F9FC" }}>
                  {mostOpenRep?.repName || '-'}
                </div>
                <div style={{ fontSize: 11, color: RED }}>
                  {mostOpenRep?.open ?? 0} open
                </div>
              </div>
              <div style={{
                backgroundColor: "rgba(251,191,36,0.1)",
                borderRadius: 6,
                padding: 10,
                borderLeft: `3px solid ${AMBER}`,
              }}>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4 }}>Team Completion Avg</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: AMBER, fontFamily: 'monospace' }}>
                  {teamAvgRate}%
                </div>
              </div>
              <div style={{
                backgroundColor: "rgba(96,165,250,0.1)",
                borderRadius: 6,
                padding: 10,
                borderLeft: `3px solid ${BLUE}`,
              }}>
                <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 4 }}>Active Reps</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: BLUE, fontFamily: 'monospace' }}>
                  {repLeaderboard.length}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{
          backgroundColor: NAVY_CARD,
          borderRadius: 10,
          padding: 12,
          marginBottom: 12,
          display: 'flex',
          gap: 8,
        }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_MUTED, marginBottom: 6, display: 'block' }}>
              Client
            </label>
            <select
              data-testid="select-client-filter"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${LINE_BLUE}`,
                fontSize: 14,
                color: "#F7F9FC",
                backgroundColor: NAVY_DEEP,
                fontWeight: 500,
                cursor: 'pointer',
                appearance: 'auto' as any,
              }}
            >
              <option value="">All Clients</option>
              {(clientsList || []).map((c: string) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_MUTED, marginBottom: 6, display: 'block' }}>
              Store
            </label>
            <select
              data-testid="select-store-filter"
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${LINE_BLUE}`,
                fontSize: 14,
                color: "#F7F9FC",
                backgroundColor: NAVY_DEEP,
                fontWeight: 500,
                cursor: 'pointer',
                appearance: 'auto' as any,
              }}
            >
              <option value="">All Stores</option>
              {(storesList || []).map((s: string) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Team Task Status - moved below achievements */}
        <div style={{
          backgroundColor: NAVY_CARD,
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#F7F9FC", marginBottom: 12 }}>
            Team Task Status
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 120, height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Open', value: data?.kpis?.totalOpen || 0, fill: ORANGE },
                      { name: 'Completed', value: data?.kpis?.totalCompleted || 0, fill: GREEN },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    <Cell fill={ORANGE} />
                    <Cell fill={GREEN} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 12, height: 12, backgroundColor: ORANGE, borderRadius: 2 }} />
                <span style={{ fontSize: 13, color: TEXT_MUTED }}>Open</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: ORANGE, marginLeft: 'auto', fontFamily: 'monospace' }}>
                  {data?.kpis?.totalOpen?.toLocaleString() || 0}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, backgroundColor: GREEN, borderRadius: 2 }} />
                <span style={{ fontSize: 13, color: TEXT_MUTED }}>Completed</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: GREEN, marginLeft: 'auto', fontFamily: 'monospace' }}>
                  {data?.kpis?.totalCompleted?.toLocaleString() || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {(repsAtRisk.length > 0 || storesAtRisk.length > 0) && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{
              fontSize: 16,
              fontWeight: 700,
              color: RED,
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <AlertTriangle size={20} />
              Attention Required
            </h3>

            <RiskCard
              title="Reps with High Open Count or Old Tasks"
              icon={<Users size={16} />}
              items={repsAtRisk.map((r: any) => ({
                name: r.repName,
                value: `${r.open} open, ${r.oldestOpenDays}d old`
              }))}
              testId="risk-reps"
            />

            <RiskCard
              title="Stores with Most Open Tasks"
              icon={<Store size={16} />}
              items={storesAtRisk.map((s: any) => ({
                name: s.store.length > 20 ? s.store.substring(0, 20) + '...' : s.store,
                value: `${s.openCount} open`
              }))}
              testId="risk-stores"
            />
          </div>
        )}

      </div>
    </div>
  );
}
