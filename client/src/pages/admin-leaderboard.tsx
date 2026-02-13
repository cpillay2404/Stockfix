import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users, MapPin, Trophy, Flame, Wrench, ClipboardList, Briefcase, Calendar, Building2, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";

interface RegionStats {
  region: string;
  priorityRate: number;
  repCount: number;
}

interface ManagerStats {
  manager: string;
  region: string;
  priorityRate: number;
  repCount: number;
  goldBadges: number;
  silverBadges: number;
  bronzeBadges: number;
}

interface RepStats {
  repName: string;
  lineManager: string;
  priorityCompletionRate: number;
  badge: { type: string };
  streak: number;
}

interface ClientStats {
  client: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
}

interface ActionBreakdown {
  action: string;
  totalTasks: number;
  completedTasks: number;
}

interface AdminLeaderboardData {
  weekEndingDate: string | null;
  overall: {
    totalTasks: number;
    totalCompleted: number;
    completionRate: number;
    priorityTotal: number;
    priorityCompleted: number;
    priorityRate: number;
    totalReps: number;
    totalManagers: number;
    totalRegions: number;
  };
  regionLeaderboard: RegionStats[];
  managerLeaderboard: ManagerStats[];
  repLeaderboard: RepStats[];
  clientLeaderboard: ClientStats[];
  actionBreakdown: ActionBreakdown[];
  actionByClient: { client: string; actions: { action: string; totalTasks: number; completedTasks: number }[] }[];
}

function CircularProgress({ value, size = 60, strokeWidth = 5, color = "#F36C21" }: { value: number; size?: number; strokeWidth?: number; color?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.25, fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>
        {value}%
      </div>
    </div>
  );
}

function SmallCircle({ value, color = "#F36C21" }: { value: number; color?: string }) {
  const size = 40;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>
        {value}%
      </div>
    </div>
  );
}

function LeaderRow({ rank, name, subtitle, rate }: { rank: number; name: string; subtitle: string; rate: number }) {
  const getMedal = (r: number) => {
    if (r === 1) return '🥇';
    if (r === 2) return '🥈';
    if (r === 3) return '🥉';
    return null;
  };
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f3f4f6', gap: '8px' }}>
      <div style={{ width: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {getMedal(rank) ? (
          <span style={{ fontSize: '14px' }}>{getMedal(rank)}</span>
        ) : (
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#9ca3af' }}>{rank}</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#003B71', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: '10px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
      </div>
      <SmallCircle value={rate} />
    </div>
  );
}

function StatCard({ icon, value, label, color = "#003B71" }: { icon: React.ReactNode; value: number | string; label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px' }}>
      <div style={{ color, marginBottom: '4px' }}>{icon}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{value}</div>
      <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

function BadgeRow({ icon, gold, silver, bronze }: { icon: string; gold: number; silver: number; bronze: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
      <span style={{ fontSize: '24px' }}>{icon}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{gold}</div>
          <div style={{ fontSize: '9px', color: '#6b7280' }}>Gold</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{silver}</div>
          <div style={{ fontSize: '9px', color: '#6b7280' }}>Silver</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{bronze}</div>
          <div style={{ fontSize: '9px', color: '#6b7280' }}>Bronze</div>
        </div>
      </div>
    </div>
  );
}

const periodOptions = [
  { value: 'week', label: 'Past Week' },
  { value: 'month', label: 'Past Month' },
  { value: '3months', label: 'Past 3 Months' },
  { value: '6months', label: 'Past 6 Months' },
];

export default function AdminLeaderboard() {
  const [, navigate] = useLocation();
  const [period, setPeriod] = useState('week');
  const [clientFilter, setClientFilter] = useState('');
  const [clearing, setClearing] = useState(false);
  const queryClient = useQueryClient();

  const handleClearCache = async () => {
    setClearing(true);
    try {
      await fetch('/api/admin/clear-cache', { method: 'POST' });
      queryClient.invalidateQueries();
    } catch (e) {
      console.error('Failed to clear cache', e);
    }
    setClearing(false);
  };

  // Fetch available clients for dropdown
  const { data: clientsData } = useQuery<string[]>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 300000,
  });

  const { data, isLoading, error } = useQuery<AdminLeaderboardData>({
    queryKey: ["admin-leaderboard", period, clientFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (clientFilter) params.append('client', clientFilter);
      const res = await fetch(`/api/admin/leaderboard?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 10000,
    refetchInterval: 10000, // Auto-refresh every 10 seconds for office display
  });

  if (isLoading) {
    return (
      <div style={{ height: '100vh', backgroundColor: '#003B71', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        Loading...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ height: '100vh', backgroundColor: '#003B71', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        Failed to load
      </div>
    );
  }

  const { overall, regionLeaderboard, managerLeaderboard, repLeaderboard, clientLeaderboard, actionBreakdown, actionByClient } = data;
  const topRegions = regionLeaderboard.slice(0, 8);
  const topManagers = managerLeaderboard.slice(0, 8);
  const topReps = repLeaderboard.slice(0, 8);
  const topClients = clientLeaderboard || [];
  
  const mgrGold = managerLeaderboard.reduce((s, m) => s + m.goldBadges, 0);
  const mgrSilver = managerLeaderboard.reduce((s, m) => s + m.silverBadges, 0);
  const mgrBronze = managerLeaderboard.reduce((s, m) => s + m.bronzeBadges, 0);
  
  const goldReps = repLeaderboard.filter(r => r.badge.type === 'gold');
  const silverReps = repLeaderboard.filter(r => r.badge.type === 'silver');
  const bronzeReps = repLeaderboard.filter(r => r.badge.type === 'bronze');
  
  const topStreaks = repLeaderboard.filter(r => r.streak > 0).sort((a, b) => b.streak - a.streak).slice(0, 10);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#f0f2f5' }}>
      <div style={{ backgroundColor: '#003B71', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate("/")} data-testid="back-button" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}>
            <ArrowLeft size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ backgroundColor: '#F36C21', borderRadius: '6px', padding: '5px', display: 'flex' }}>
              <Wrench size={16} color="white" />
            </div>
            <span style={{ color: 'white', fontWeight: 700, fontSize: '16px' }}>StockFix</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building2 size={14} color="rgba(255,255,255,0.8)" />
            <select 
              value={clientFilter} 
              onChange={(e) => setClientFilter(e.target.value)}
              data-testid="client-selector"
              style={{ 
                backgroundColor: 'rgba(255,255,255,0.15)', 
                color: 'white', 
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                outline: 'none',
                maxWidth: '140px',
              }}
            >
              <option value="" style={{ color: '#003B71' }}>All Clients</option>
              {(clientsData || []).map(client => (
                <option key={client} value={client} style={{ color: '#003B71' }}>
                  {client}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={14} color="rgba(255,255,255,0.8)" />
            <select 
              value={period} 
              onChange={(e) => setPeriod(e.target.value)}
              data-testid="period-selector"
              style={{ 
                backgroundColor: 'rgba(255,255,255,0.15)', 
                color: 'white', 
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {periodOptions.map(opt => (
                <option key={opt.value} value={opt.value} style={{ color: '#003B71' }}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ backgroundColor: '#dc2626', borderRadius: '12px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '6px', height: '6px', backgroundColor: 'white', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
            <span style={{ color: 'white', fontSize: '11px', fontWeight: 600 }}>LIVE</span>
          </div>
          <button 
            onClick={handleClearCache}
            disabled={clearing}
            data-testid="clear-cache-button"
            style={{ 
              backgroundColor: 'rgba(255,255,255,0.15)', 
              color: 'white', 
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 500,
              cursor: clearing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              opacity: clearing ? 0.7 : 1,
            }}
          >
            <RefreshCw size={12} style={{ animation: clearing ? 'spin 1s linear infinite' : 'none' }} />
            {clearing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '12px', display: 'grid', gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 200px) minmax(200px, 1fr) minmax(200px, 1fr) minmax(200px, 1fr)', gap: '12px', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', color: '#F36C21' }}>
              <Trophy size={14} />
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Performance</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              <div style={{ textAlign: 'center' }}>
                <CircularProgress value={overall.priorityRate} size={55} strokeWidth={4} />
                <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '2px' }}>PRIORITY</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <CircularProgress value={overall.completionRate} size={55} strokeWidth={4} color="#16a34a" />
                <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '2px' }}>OVERALL</div>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: '#003B71', fontWeight: 600, marginBottom: '10px' }}>
              {overall.priorityCompleted}/{overall.priorityTotal} priority tasks
            </div>
            <div style={{ width: '100%', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px', color: '#F36C21' }}>
                <ClipboardList size={12} />
                <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>Stats</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                <StatCard icon={<Users size={14} />} value={overall.totalReps} label="Reps" />
                <StatCard icon={<Users size={14} />} value={overall.totalManagers} label="Managers" />
                <StatCard icon={<MapPin size={14} />} value={overall.totalRegions} label="Regions" />
                <StatCard icon={<ClipboardList size={14} />} value={overall.totalTasks} label="Tasks" />
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', color: '#F36C21', flexShrink: 0 }}>
              <MapPin size={14} />
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Top Regions</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 0 }}>
              {topRegions.slice(0, 5).map((r, idx) => (
                <LeaderRow key={r.region} rank={idx + 1} name={r.region} subtitle={`${r.repCount} reps`} rate={r.priorityRate} />
              ))}
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', color: '#F36C21', flexShrink: 0 }}>
              <Users size={14} />
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Top Managers</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 0 }}>
              {topManagers.slice(0, 5).map((m, idx) => (
                <LeaderRow key={m.manager} rank={idx + 1} name={m.manager} subtitle={m.region} rate={m.priorityRate} />
              ))}
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', color: '#F36C21', flexShrink: 0 }}>
              <Trophy size={14} />
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Top Reps</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 0 }}>
              {topReps.slice(0, 5).map((rep, idx) => (
                <LeaderRow key={rep.repName} rank={idx + 1} name={rep.repName} subtitle={rep.lineManager} rate={rep.priorityCompletionRate} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1fr) minmax(200px, 1fr) minmax(200px, 1fr)', gap: '12px', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', color: '#F36C21', flexShrink: 0 }}>
              <Briefcase size={14} />
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Client Capture %</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 0 }}>
              {topClients.slice(0, 6).map((c) => (
                <div key={c.client} style={{ display: 'flex', alignItems: 'center', padding: '2px 0', borderBottom: '1px solid #f3f4f6', gap: '6px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: '#003B71', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.client}</div>
                    <div style={{ fontSize: '8px', color: '#9ca3af' }}>{c.completedTasks}/{c.totalTasks}</div>
                  </div>
                  <SmallCircle value={c.completionRate} color={c.completionRate >= 80 ? '#16a34a' : c.completionRate >= 50 ? '#F36C21' : '#ef4444'} />
                </div>
              ))}
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', color: '#F36C21', flexShrink: 0 }}>
              <ClipboardList size={14} />
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Action Breakdown by Client</span>
            </div>
            {(() => {
              const clients = (actionByClient || []);
              const shorten = (s: string) => {
                const map: Record<string, string> = {
                  'Review: Risk of OOS': 'OOS Risk',
                  'Urgent: Place Order - DC has stock': 'Place Order',
                  'Check Count: No Sales in 30 Days': 'NS 30d',
                  'Check Count: No Sales in 15 Days': 'NS 15d',
                  'Check Count: No Sales in 60 Days': 'NS 60d',
                  'Fix Counts: Negative SOH': 'Neg SOH',
                  'Monitor: Possible Overstock': 'Overstock',
                  'OOS – Stock on Order': 'OOS Order',
                  'OOS \u2013 Stock on Order': 'OOS Order',
                };
                return map[s] || s.replace(/^(Check Count|Fix Counts|Urgent|Review|Monitor):\s*/i, '').substring(0, 12);
              };
              const actionColors: Record<string, string> = {
                'OOS Risk': '#ef4444',
                'Place Order': '#F36C21',
                'NS 30d': '#8B5CF6',
                'NS 15d': '#6366f1',
                'NS 60d': '#7c3aed',
                'Neg SOH': '#dc2626',
                'Overstock': '#0EA5E9',
                'OOS Order': '#f59e0b',
              };
              const getColor = (label: string) => actionColors[label] || '#6b7280';
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'auto', flex: 1, minHeight: 0 }}>
                  {clients.map((c) => {
                    const totalAll = c.actions.reduce((s, a) => s + a.totalTasks, 0);
                    const completedAll = c.actions.reduce((s, a) => s + a.completedTasks, 0);
                    const topActions = c.actions.slice(0, 4);
                    return (
                      <div key={c.client} style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, color: '#003B71' }}>{c.client}</span>
                          <span style={{ fontSize: '8px', color: '#6b7280', fontFamily: 'monospace' }}>{completedAll}/{totalAll}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                          {topActions.map((a) => {
                            const label = shorten(a.action);
                            const color = getColor(label);
                            return (
                              <div key={a.action} style={{ display: 'flex', alignItems: 'center', gap: '2px', backgroundColor: `${color}15`, borderRadius: '4px', padding: '1px 4px', border: `1px solid ${color}30` }}>
                                <span style={{ fontSize: '8px', fontWeight: 600, color }}>{label}</span>
                                <span style={{ fontSize: '7px', color: '#6b7280', fontFamily: 'monospace' }}>{a.completedTasks}/{a.totalTasks}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', color: '#F36C21', flexShrink: 0 }}>
              <Trophy size={14} />
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Rep Badges</span>
              <span style={{ fontSize: '9px', color: '#6b7280', marginLeft: 'auto' }}>Based on completion rate</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden', flex: 1 }}>
              <div style={{ backgroundColor: '#FEF9C3', borderRadius: '8px', padding: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>🥇</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#854D0E' }}>Gold ({goldReps.length})</span>
                  <span style={{ fontSize: '10px', color: '#A16207' }}>100%+</span>
                </div>
                <div style={{ fontSize: '10px', color: '#713F12', lineHeight: 1.4 }}>
                  {goldReps.length > 0 ? goldReps.slice(0, 6).map(r => r.repName).join(', ') + (goldReps.length > 6 ? ` +${goldReps.length - 6} more` : '') : 'No reps yet'}
                </div>
              </div>
              <div style={{ backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>🥈</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>Silver ({silverReps.length})</span>
                  <span style={{ fontSize: '10px', color: '#64748B' }}>90%+</span>
                </div>
                <div style={{ fontSize: '10px', color: '#334155', lineHeight: 1.4 }}>
                  {silverReps.length > 0 ? silverReps.slice(0, 6).map(r => r.repName).join(', ') + (silverReps.length > 6 ? ` +${silverReps.length - 6} more` : '') : 'No reps yet'}
                </div>
              </div>
              <div style={{ backgroundColor: '#FEF3C7', borderRadius: '8px', padding: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '20px' }}>🥉</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#92400E' }}>Bronze ({bronzeReps.length})</span>
                  <span style={{ fontSize: '10px', color: '#B45309' }}>80%+</span>
                </div>
                <div style={{ fontSize: '10px', color: '#78350F', lineHeight: 1.4 }}>
                  {bronzeReps.length > 0 ? bronzeReps.slice(0, 6).map(r => r.repName).join(', ') + (bronzeReps.length > 6 ? ` +${bronzeReps.length - 6} more` : '') : 'No reps yet'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', color: '#F36C21', flexShrink: 0 }}>
              <Flame size={14} />
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Top Streaks</span>
            </div>
            {topStreaks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', flex: 1, minHeight: 0 }}>
                {topStreaks.slice(0, 6).map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                    <span style={{ fontSize: '16px' }}>🔥</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#003B71', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.repName}</div>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#F36C21' }}>{s.streak}d</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px 0' }}>
                <div style={{ fontSize: '32px', marginBottom: '4px' }}>🔥</div>
                <div style={{ fontSize: '12px' }}>No active streaks</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
