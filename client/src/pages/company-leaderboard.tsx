import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAccess } from "@/context/AccessContext";
import { ArrowLeft, Trophy, Medal, Flame, Target, TrendingUp, Crown } from "lucide-react";
import BottomNav from "@/components/BottomNav";

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
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  completionRate: number;
  priorityTotalTasks: number;
  priorityCompletedTasks: number;
  priorityOpenTasks: number;
  priorityCompletionRate: number;
  badge: RepBadge;
  streak: number;
  rank: number;
  rankChange: 'up' | 'down' | 'same' | 'new';
  isTopPerformer: boolean;
  storesMastered: number;
}

interface TeamStats {
  totalReps: number;
  totalTasks: number;
  totalCompleted: number;
  avgCompletionRate: number;
  priorityTotalTasks: number;
  priorityCompletedTasks: number;
  avgPriorityCompletionRate: number;
  badgeCounts: { gold: number; silver: number; bronze: number };
}

const headerStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #003B71 0%, #002855 100%)',
  padding: '16px 16px 20px 16px',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '12px',
  padding: '16px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
};

export default function CompanyLeaderboard() {
  const [, setLocation] = useLocation();
  const { accessMode } = useAccess();

  const { data, isLoading } = useQuery({
    queryKey: ["company-leaderboard"],
    queryFn: async () => {
      const res = await fetch(`/api/gamification/leaderboard?limit=100`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    staleTime: 60000,
  });

  if (accessMode !== "manager") {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ color: '#6B7280' }}>Access restricted to management only.</p>
      </div>
    );
  }

  const leaderboard: RepStats[] = data?.leaderboard || [];
  const teamStats: TeamStats = data?.teamStats || {
    totalReps: 0,
    totalTasks: 0,
    totalCompleted: 0,
    avgCompletionRate: 0,
    priorityTotalTasks: 0,
    priorityCompletedTasks: 0,
    avgPriorityCompletionRate: 0,
    badgeCounts: { gold: 0, silver: 0, bronze: 0 },
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown style={{ width: '20px', height: '20px', color: '#FFD700' }} />;
    if (rank === 2) return <Medal style={{ width: '20px', height: '20px', color: '#C0C0C0' }} />;
    if (rank === 3) return <Medal style={{ width: '20px', height: '20px', color: '#CD7F32' }} />;
    return <span style={{ fontWeight: 700, color: '#6B7280', fontSize: '14px' }}>#{rank}</span>;
  };

  const getPriorityColor = (rate: number) => {
    if (rate >= 100) return '#10B981';
    if (rate >= 90) return '#3B82F6';
    if (rate >= 80) return '#F59E0B';
    return '#EF4444';
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', paddingBottom: '80px' }}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <button
            onClick={() => setLocation('/dashboard')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
            data-testid="button-back"
          >
            <ArrowLeft style={{ width: '24px', height: '24px', color: '#FFFFFF' }} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trophy style={{ width: '24px', height: '24px', color: '#F36C21' }} />
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
                Company Leaderboard
              </h1>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '4px' }}>
              Priority Task Performance Rankings
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          <div style={{ 
            backgroundColor: 'rgba(255,255,255,0.15)', 
            borderRadius: '8px', 
            padding: '12px 8px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'monospace' }}>
              {teamStats.totalReps}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>REPS</div>
          </div>
          <div style={{ 
            backgroundColor: 'rgba(255,255,255,0.15)', 
            borderRadius: '8px', 
            padding: '12px 8px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#FFD700', fontFamily: 'monospace' }}>
              {teamStats.badgeCounts.gold}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>GOLD</div>
          </div>
          <div style={{ 
            backgroundColor: 'rgba(255,255,255,0.15)', 
            borderRadius: '8px', 
            padding: '12px 8px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#C0C0C0', fontFamily: 'monospace' }}>
              {teamStats.badgeCounts.silver}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>SILVER</div>
          </div>
          <div style={{ 
            backgroundColor: 'rgba(255,255,255,0.15)', 
            borderRadius: '8px', 
            padding: '12px 8px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#CD7F32', fontFamily: 'monospace' }}>
              {teamStats.badgeCounts.bronze}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.7)', marginTop: '2px' }}>BRONZE</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{ ...cardStyle, marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Target style={{ width: '18px', height: '18px', color: '#F36C21' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#003B71' }}>Company Priority Performance</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: getPriorityColor(teamStats.avgPriorityCompletionRate), fontFamily: 'monospace' }}>
                {teamStats.avgPriorityCompletionRate}%
              </div>
              <div style={{ fontSize: '11px', color: '#6B7280' }}>Avg Priority Rate</div>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#003B71', fontFamily: 'monospace' }}>
                {teamStats.priorityCompletedTasks}/{teamStats.priorityTotalTasks}
              </div>
              <div style={{ fontSize: '11px', color: '#6B7280' }}>Priority Tasks Done</div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>Loading...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {leaderboard.map((rep, index) => (
              <div
                key={rep.repName}
                style={{
                  ...cardStyle,
                  padding: '12px 16px',
                  borderLeft: rep.isTopPerformer ? '4px solid #F36C21' : '4px solid transparent',
                }}
                data-testid={`leaderboard-row-${index}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '36px', display: 'flex', justifyContent: 'center' }}>
                    {getRankIcon(rep.rank)}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 600, color: '#003B71', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rep.repName}
                      </span>
                      {rep.badge.type !== 'none' && (
                        <span style={{ fontSize: '16px' }}>{rep.badge.emoji}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                      {rep.lineManager} • {rep.region}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {rep.streak > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Flame style={{ width: '14px', height: '14px', color: '#EF4444' }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#EF4444' }}>{rep.streak}</span>
                      </div>
                    )}
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: '18px', 
                        fontWeight: 800, 
                        color: getPriorityColor(rep.priorityCompletionRate),
                        fontFamily: 'monospace',
                      }}>
                        {rep.priorityCompletionRate}%
                      </div>
                      <div style={{ fontSize: '10px', color: '#6B7280' }}>
                        {rep.priorityCompletedTasks}/{rep.priorityTotalTasks}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
