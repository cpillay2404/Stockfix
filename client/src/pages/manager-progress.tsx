import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp, CheckCircle, AlertCircle, AlertTriangle, Users, Store, Trophy, RefreshCw } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import BottomNav from "@/components/BottomNav";
import Leaderboard from "@/components/Leaderboard";

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
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px',
        borderTop: `3px solid ${accentColor}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ color: accentColor, marginBottom: '4px' }}>{icon}</div>
      <span style={{ fontSize: '24px', fontWeight: 800, color: '#003B71', fontFamily: 'monospace', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ 
        fontSize: '10px', 
        color: '#6B7280', 
        textAlign: 'center', 
        marginTop: '4px',
        lineHeight: 1.2,
      }}>
        {label}
      </span>
    </div>
  );
}

interface RepRowProps {
  rep: {
    repName: string;
    open: number;
    completed: number;
    completionRate: number;
    priorityOpen?: number;
    priorityCompleted?: number;
    priorityCompletionRate?: number;
    oldestOpenDays: number;
  };
  onClick: () => void;
}

function RepRow({ rep, onClick }: RepRowProps) {
  const isAtRisk = rep.open >= 10 || rep.oldestOpenDays >= 14;
  
  return (
    <div
      data-testid={`rep-row-${rep.repName}`}
      onClick={onClick}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        cursor: 'pointer',
        borderLeft: isAtRisk ? '4px solid #DC2626' : '4px solid #10B981',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: '#003B71',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {rep.repName}
          </div>
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            marginTop: '4px',
            fontSize: '12px',
            color: '#6B7280',
          }}>
            <span style={{ color: '#F36C21', fontWeight: 600 }}>
              {rep.priorityOpen ?? 0} priority
            </span>
            <span style={{ color: '#10B981' }}>
              {rep.priorityCompletionRate ?? 0}% priority rate
            </span>
            <span>
              {rep.open} total open
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
          <div style={{ 
            fontSize: '12px', 
            fontWeight: 600, 
            color: rep.oldestOpenDays > 14 ? '#DC2626' : rep.oldestOpenDays > 7 ? '#F59E0B' : '#6B7280' 
          }}>
            {rep.oldestOpenDays} days oldest
          </div>
        </div>
      </div>
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
        backgroundColor: '#FEF2F2',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '12px',
        border: '1px solid #FECACA',
      }}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        marginBottom: '8px',
      }}>
        <div style={{ color: '#DC2626' }}>{icon}</div>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#DC2626' }}>
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {items.slice(0, 5).map((item, index) => (
          <div
            key={index}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '12px',
            }}
          >
            <span style={{ color: '#374151' }}>{item.name}</span>
            <span style={{ color: '#DC2626', fontWeight: 600, marginLeft: '6px' }}>
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

  const { data: clientsList } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const res = await fetch('/api/clients');
      if (!res.ok) return [];
      return res.json();
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
    ? [...repLeaderboard].sort((a: any, b: any) => (b.priorityCompletionRate ?? 0) - (a.priorityCompletionRate ?? 0))[0] 
    : null;
  const mostPriorityOpenRep = repLeaderboard.length > 0 
    ? [...repLeaderboard].sort((a: any, b: any) => (b.priorityOpen ?? 0) - (a.priorityOpen ?? 0))[0] 
    : null;
  const teamAvgPriorityRate = repLeaderboard.length > 0 
    ? Math.round(repLeaderboard.reduce((sum: number, r: any) => sum + (r.priorityCompletionRate ?? 0), 0) / repLeaderboard.length) 
    : 0;

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#F3F4F6',
      paddingBottom: '80px',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #003B71 0%, #005a9e 100%)',
        padding: '16px',
        paddingTop: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <button
            data-testid="back-button"
            onClick={handleBack}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft style={{ width: '20px', height: '20px', color: '#FFFFFF' }} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
              Team Task Progress
            </h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', margin: 0 }}>
              Manager Overview
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="button-refresh"
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: refreshing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            <RefreshCw style={{ width: '18px', height: '18px', color: '#FFFFFF', animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        {selectedManager && (
          <div style={{ 
            marginTop: '8px', 
            padding: '8px 12px', 
            backgroundColor: 'rgba(255,255,255,0.15)', 
            borderRadius: '8px',
            fontSize: '14px',
            color: '#FFFFFF',
            fontWeight: 500,
          }}>
            {selectedManager}'s Team
          </div>
        )}

      </div>

      <div style={{ padding: '16px' }}>
        {/* Leaderboard with badges - at the very top */}
        <Leaderboard 
          manager={selectedManager}
          limit={15}
          showTeamStats={true}
          onRepClick={handleRepClick}
        />

        {/* Team Achievements Insights */}
        {(data?.repLeaderboard?.length > 0) && (
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
          }}>
            <h3 style={{ 
              fontSize: '14px', 
              fontWeight: 600, 
              color: '#003B71', 
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Trophy size={16} style={{ color: '#F59E0B' }} />
              Team Achievements
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ 
                backgroundColor: '#F0FDF4', 
                borderRadius: '6px', 
                padding: '10px',
                borderLeft: '3px solid #10B981',
              }}>
                <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Top Priority Performer</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#003B71' }}>
                  {topPerformer?.repName || '-'}
                </div>
                <div style={{ fontSize: '11px', color: '#10B981' }}>
                  {topPerformer?.priorityCompletionRate ?? topPerformer?.completionRate ?? 0}% priority
                </div>
              </div>
              <div style={{ 
                backgroundColor: '#FEF2F2', 
                borderRadius: '6px', 
                padding: '10px',
                borderLeft: '3px solid #DC2626',
              }}>
                <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Most Priority Open</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#003B71' }}>
                  {mostPriorityOpenRep?.repName || '-'}
                </div>
                <div style={{ fontSize: '11px', color: '#DC2626' }}>
                  {mostPriorityOpenRep?.priorityOpen ?? 0} priority open
                </div>
              </div>
              <div style={{ 
                backgroundColor: '#FFF7ED', 
                borderRadius: '6px', 
                padding: '10px',
                borderLeft: '3px solid #F59E0B',
              }}>
                <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Team Priority Avg</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#F59E0B', fontFamily: 'monospace' }}>
                  {teamAvgPriorityRate}%
                </div>
              </div>
              <div style={{ 
                backgroundColor: '#EFF6FF', 
                borderRadius: '6px', 
                padding: '10px',
                borderLeft: '3px solid #3B82F6',
              }}>
                <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>Active Reps</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#3B82F6', fontFamily: 'monospace' }}>
                  {repLeaderboard.length}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '12px',
          display: 'flex',
          gap: '8px',
        }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#003B71', marginBottom: '6px', display: 'block' }}>
              Client
            </label>
            <select
              data-testid="select-client-filter"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '14px',
                color: '#003B71',
                backgroundColor: '#F9FAFB',
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
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#003B71', marginBottom: '6px', display: 'block' }}>
              Store
            </label>
            <select
              data-testid="select-store-filter"
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #D1D5DB',
                fontSize: '14px',
                color: '#003B71',
                backgroundColor: '#F9FAFB',
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
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#003B71', marginBottom: '12px' }}>
            Team Task Status
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '120px', height: '120px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Priority Open', value: data?.kpis?.priorityOpenCount || 0, fill: '#DC2626' },
                      { name: 'Non-Priority Open', value: (data?.kpis?.totalOpen || 0) - (data?.kpis?.priorityOpenCount || 0), fill: '#F36C21' },
                      { name: 'Completed', value: data?.kpis?.totalCompleted || 0, fill: '#10B981' },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    <Cell fill="#DC2626" />
                    <Cell fill="#F36C21" />
                    <Cell fill="#10B981" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '12px', height: '12px', backgroundColor: '#DC2626', borderRadius: '2px' }} />
                <span style={{ fontSize: '13px', color: '#374151' }}>Priority Open</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#DC2626', marginLeft: 'auto', fontFamily: 'monospace' }}>
                  {data?.kpis?.priorityOpenCount?.toLocaleString() || 0}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '12px', height: '12px', backgroundColor: '#F36C21', borderRadius: '2px' }} />
                <span style={{ fontSize: '13px', color: '#374151' }}>Non-Priority Open</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#F36C21', marginLeft: 'auto', fontFamily: 'monospace' }}>
                  {((data?.kpis?.totalOpen || 0) - (data?.kpis?.priorityOpenCount || 0)).toLocaleString()}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', backgroundColor: '#10B981', borderRadius: '2px' }} />
                <span style={{ fontSize: '13px', color: '#374151' }}>Completed</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#10B981', marginLeft: 'auto', fontFamily: 'monospace' }}>
                  {data?.kpis?.totalCompleted?.toLocaleString() || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {(repsAtRisk.length > 0 || storesAtRisk.length > 0) && (
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ 
              fontSize: '16px', 
              fontWeight: 700, 
              color: '#DC2626', 
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
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

      <BottomNav />
    </div>
  );
}
