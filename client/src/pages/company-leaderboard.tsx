import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAccess } from "@/context/AccessContext";
import { ArrowLeft, Trophy, Flame, Target, Crown, Medal, Award } from "lucide-react";

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

export default function CompanyLeaderboard() {
  const [, setLocation] = useLocation();
  const { accessMode } = useAccess();

  const { data, isLoading } = useQuery({
    queryKey: ["company-leaderboard"],
    queryFn: async () => {
      const res = await fetch(`/api/gamification/leaderboard?limit=10`);
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
      background: 'linear-gradient(180deg, #003B71 0%, #002855 40%, #F3F4F6 40%)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => setLocation('/import')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          data-testid="button-back"
        >
          <ArrowLeft style={{ width: '22px', height: '22px', color: '#FFFFFF' }} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Trophy style={{ width: '22px', height: '22px', color: '#F36C21' }} />
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
            Company Leaderboard
          </h1>
        </div>
      </div>

      <div style={{ padding: '0 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'monospace' }}>{teamStats.totalReps}</div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Reps</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#FFD700', fontFamily: 'monospace' }}>{teamStats.badgeCounts.gold}</div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Gold</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#C0C0C0', fontFamily: 'monospace' }}>{teamStats.badgeCounts.silver}</div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Silver</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#CD7F32', fontFamily: 'monospace' }}>{teamStats.badgeCounts.bronze}</div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Bronze</div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Target style={{ width: '16px', height: '16px', color: '#F36C21' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#003B71' }}>Priority Performance</span>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: getPriorityColor(teamStats.avgPriorityCompletionRate), fontFamily: 'monospace' }}>
              {teamStats.avgPriorityCompletionRate}%
            </div>
            <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
              {teamStats.priorityCompletedTasks}/{teamStats.priorityTotalTasks} tasks done
            </div>
          </div>

          <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Award style={{ width: '16px', height: '16px', color: '#F36C21' }} />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#003B71' }}>Badge Distribution</span>
            </div>
            <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '24px', background: '#E5E7EB' }}>
              {goldPct > 0 && <div style={{ width: `${goldPct}%`, background: '#FFD700' }} />}
              {silverPct > 0 && <div style={{ width: `${silverPct}%`, background: '#C0C0C0' }} />}
              {bronzePct > 0 && <div style={{ width: `${bronzePct}%`, background: '#CD7F32' }} />}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', color: '#6B7280' }}>
              <span>🥇 {teamStats.badgeCounts.gold}</span>
              <span>🥈 {teamStats.badgeCounts.silver}</span>
              <span>🥉 {teamStats.badgeCounts.bronze}</span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, background: '#FFFFFF', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <Crown style={{ width: '16px', height: '16px', color: '#FFD700' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#003B71' }}>Top 5 Performers</span>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {leaderboard.map((rep, index) => (
              <div
                key={rep.repName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  background: index === 0 ? 'linear-gradient(90deg, rgba(255,215,0,0.1) 0%, rgba(255,215,0,0) 100%)' : '#F9FAFB',
                  borderRadius: '8px',
                  borderLeft: index === 0 ? '3px solid #FFD700' : index === 1 ? '3px solid #C0C0C0' : index === 2 ? '3px solid #CD7F32' : '3px solid transparent',
                }}
                data-testid={`leaderboard-row-${index}`}
              >
                <div style={{ width: '24px', display: 'flex', justifyContent: 'center' }}>
                  {index === 0 ? <Crown style={{ width: '18px', height: '18px', color: '#FFD700' }} /> :
                   index === 1 ? <Medal style={{ width: '18px', height: '18px', color: '#C0C0C0' }} /> :
                   index === 2 ? <Medal style={{ width: '18px', height: '18px', color: '#CD7F32' }} /> :
                   <span style={{ fontWeight: 700, color: '#9CA3AF', fontSize: '13px' }}>#{index + 1}</span>}
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontWeight: 600, color: '#003B71', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {rep.repName}
                    </span>
                    {rep.badge.type !== 'none' && <span style={{ fontSize: '14px' }}>{rep.badge.emoji}</span>}
                    {rep.streak > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '4px' }}>
                        <Flame style={{ width: '12px', height: '12px', color: '#EF4444' }} />
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#EF4444' }}>{rep.streak}</span>
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '10px', color: '#9CA3AF' }}>{rep.lineManager}</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: getPriorityColor(rep.priorityCompletionRate), fontFamily: 'monospace' }}>
                    {rep.priorityCompletionRate}%
                  </div>
                  <div style={{ fontSize: '9px', color: '#9CA3AF' }}>
                    {rep.priorityCompletedTasks}/{rep.priorityTotalTasks}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
