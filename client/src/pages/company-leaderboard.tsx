import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAccess } from "@/context/AccessContext";
import { ArrowLeft, Trophy, Flame, Target, Crown, Medal, Award, Building2, User, MapPin } from "lucide-react";

type FilterScope = 'company' | 'manager' | 'rep' | 'region';

interface RepBadge {
  type: 'gold' | 'silver' | 'bronze' | 'none';
  label: string;
  color: string;
  emoji: string;
}

interface RepStats {
  repName: string;
  lineManager: string;
  region: string;
  priorityCompletedTasks: number;
  priorityTotalTasks: number;
  priorityCompletionRate: number;
  badge: RepBadge;
  streak: number;
  rank: number;
  isTopPerformer: boolean;
}

interface TeamStats {
  totalReps: number;
  priorityTotalTasks: number;
  priorityCompletedTasks: number;
  avgPriorityCompletionRate: number;
  badgeCounts: { gold: number; silver: number; bronze: number };
}

const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 10px',
  fontSize: '11px',
  fontWeight: active ? 600 : 400,
  color: active ? '#003B71' : '#6B7280',
  background: active ? '#FFFFFF' : 'transparent',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.15s ease',
});

export default function CompanyLeaderboard() {
  const [, setLocation] = useLocation();
  const { accessMode } = useAccess();
  const [filterScope, setFilterScope] = useState<FilterScope>('company');
  const [selectedManager, setSelectedManager] = useState<string>('');
  const [selectedRep, setSelectedRep] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', '10');
    if (filterScope === 'manager' && selectedManager) params.set('manager', selectedManager);
    if (filterScope === 'rep' && selectedRep) params.set('rep', selectedRep);
    if (filterScope === 'region' && selectedRegion) params.set('region', selectedRegion);
    return params.toString();
  }, [filterScope, selectedManager, selectedRep, selectedRegion]);

  const { data, isLoading } = useQuery({
    queryKey: ["company-leaderboard", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/gamification/leaderboard?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    staleTime: 60000,
  });

  if (accessMode !== "manager") {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6' }}>
        <p style={{ color: '#6B7280' }}>Access restricted to management only.</p>
      </div>
    );
  }

  const leaderboard: RepStats[] = data?.leaderboard?.slice(0, 5) || [];
  const teamStats: TeamStats = data?.teamStats || {
    totalReps: 0,
    priorityTotalTasks: 0,
    priorityCompletedTasks: 0,
    avgPriorityCompletionRate: 0,
    badgeCounts: { gold: 0, silver: 0, bronze: 0 },
  };
  const filterOptions = data?.filterOptions || { managers: [], regions: [], reps: [] };

  const getPriorityColor = (rate: number) => {
    if (rate >= 100) return '#10B981';
    if (rate >= 90) return '#3B82F6';
    if (rate >= 80) return '#F59E0B';
    return '#EF4444';
  };

  const totalBadges = teamStats.badgeCounts.gold + teamStats.badgeCounts.silver + teamStats.badgeCounts.bronze;
  const goldPct = totalBadges > 0 ? (teamStats.badgeCounts.gold / totalBadges) * 100 : 0;
  const silverPct = totalBadges > 0 ? (teamStats.badgeCounts.silver / totalBadges) * 100 : 0;
  const bronzePct = totalBadges > 0 ? (teamStats.badgeCounts.bronze / totalBadges) * 100 : 0;

  const getScopeLabel = () => {
    if (filterScope === 'manager' && selectedManager) return selectedManager;
    if (filterScope === 'rep' && selectedRep) return selectedRep;
    if (filterScope === 'region' && selectedRegion) return selectedRegion;
    return 'Company-Wide';
  };

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6' }}>
        <p style={{ color: '#6B7280' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      height: '100vh', 
      background: 'linear-gradient(180deg, #003B71 0%, #002855 35%, #F3F4F6 35%)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '10px 16px 8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => setLocation('/import')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          data-testid="button-back"
        >
          <ArrowLeft style={{ width: '20px', height: '20px', color: '#FFFFFF' }} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <Trophy style={{ width: '20px', height: '20px', color: '#F36C21' }} />
          <h1 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
            Leaderboard
          </h1>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginLeft: 'auto' }}>{getScopeLabel()}</span>
        </div>
      </div>

      <div style={{ padding: '0 16px 10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '3px' }}>
          <button style={toggleBtnStyle(filterScope === 'company')} onClick={() => setFilterScope('company')} data-testid="filter-company">
            <Building2 style={{ width: '12px', height: '12px' }} /> All
          </button>
          <button style={toggleBtnStyle(filterScope === 'manager')} onClick={() => setFilterScope('manager')} data-testid="filter-manager">
            <User style={{ width: '12px', height: '12px' }} /> Manager
          </button>
          <button style={toggleBtnStyle(filterScope === 'region')} onClick={() => setFilterScope('region')} data-testid="filter-region">
            <MapPin style={{ width: '12px', height: '12px' }} /> Region
          </button>
        </div>
        
        {filterScope === 'manager' && (
          <select 
            value={selectedManager} 
            onChange={(e) => setSelectedManager(e.target.value)}
            style={{ flex: 1, fontSize: '11px', padding: '6px 8px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.9)', color: '#003B71' }}
            data-testid="select-manager"
          >
            <option value="">All Managers</option>
            {filterOptions.managers.map((m: string) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {filterScope === 'region' && (
          <select 
            value={selectedRegion} 
            onChange={(e) => setSelectedRegion(e.target.value)}
            style={{ flex: 1, fontSize: '11px', padding: '6px 8px', borderRadius: '6px', border: 'none', background: 'rgba(255,255,255,0.9)', color: '#003B71' }}
            data-testid="select-region"
          >
            <option value="">All Regions</option>
            {filterOptions.regions.map((r: string) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      <div style={{ padding: '0 16px 8px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'monospace' }}>{teamStats.totalReps}</div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Reps</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#FFD700', fontFamily: 'monospace' }}>{teamStats.badgeCounts.gold}</div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Gold</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#C0C0C0', fontFamily: 'monospace' }}>{teamStats.badgeCounts.silver}</div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Silver</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#CD7F32', fontFamily: 'monospace' }}>{teamStats.badgeCounts.bronze}</div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Bronze</div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
              <Target style={{ width: '14px', height: '14px', color: '#F36C21' }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#003B71' }}>Priority Rate</span>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: getPriorityColor(teamStats.avgPriorityCompletionRate), fontFamily: 'monospace' }}>
              {teamStats.avgPriorityCompletionRate}%
            </div>
            <div style={{ fontSize: '10px', color: '#6B7280' }}>
              {teamStats.priorityCompletedTasks}/{teamStats.priorityTotalTasks} done
            </div>
          </div>

          <div style={{ background: '#FFFFFF', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
              <Award style={{ width: '14px', height: '14px', color: '#F36C21' }} />
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#003B71' }}>Badges</span>
            </div>
            <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden', height: '20px', background: '#E5E7EB' }}>
              {goldPct > 0 && <div style={{ width: `${goldPct}%`, background: '#FFD700' }} />}
              {silverPct > 0 && <div style={{ width: `${silverPct}%`, background: '#C0C0C0' }} />}
              {bronzePct > 0 && <div style={{ width: `${bronzePct}%`, background: '#CD7F32' }} />}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '9px', color: '#6B7280' }}>
              <span>🥇{teamStats.badgeCounts.gold}</span>
              <span>🥈{teamStats.badgeCounts.silver}</span>
              <span>🥉{teamStats.badgeCounts.bronze}</span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, background: '#FFFFFF', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '8px' }}>
            <Crown style={{ width: '14px', height: '14px', color: '#FFD700' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#003B71' }}>Top Performers</span>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {leaderboard.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: '12px' }}>
                No data available
              </div>
            ) : (
              leaderboard.map((rep, index) => (
                <div
                  key={rep.repName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 8px',
                    background: index === 0 ? 'linear-gradient(90deg, rgba(255,215,0,0.1) 0%, rgba(255,215,0,0) 100%)' : '#F9FAFB',
                    borderRadius: '6px',
                    borderLeft: index === 0 ? '3px solid #FFD700' : index === 1 ? '3px solid #C0C0C0' : index === 2 ? '3px solid #CD7F32' : '3px solid transparent',
                  }}
                  data-testid={`leaderboard-row-${index}`}
                >
                  <div style={{ width: '20px', display: 'flex', justifyContent: 'center' }}>
                    {index === 0 ? <Crown style={{ width: '14px', height: '14px', color: '#FFD700' }} /> :
                     index === 1 ? <Medal style={{ width: '14px', height: '14px', color: '#C0C0C0' }} /> :
                     index === 2 ? <Medal style={{ width: '14px', height: '14px', color: '#CD7F32' }} /> :
                     <span style={{ fontWeight: 700, color: '#9CA3AF', fontSize: '11px' }}>#{index + 1}</span>}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <span style={{ fontWeight: 600, color: '#003B71', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rep.repName}
                      </span>
                      {rep.badge.type !== 'none' && <span style={{ fontSize: '12px' }}>{rep.badge.emoji}</span>}
                      {rep.streak > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '1px', marginLeft: '2px' }}>
                          <Flame style={{ width: '10px', height: '10px', color: '#EF4444' }} />
                          <span style={{ fontSize: '9px', fontWeight: 600, color: '#EF4444' }}>{rep.streak}</span>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '9px', color: '#9CA3AF' }}>{rep.lineManager}</div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: getPriorityColor(rep.priorityCompletionRate), fontFamily: 'monospace' }}>
                      {rep.priorityCompletionRate}%
                    </div>
                    <div style={{ fontSize: '8px', color: '#9CA3AF' }}>
                      {rep.priorityCompletedTasks}/{rep.priorityTotalTasks}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
