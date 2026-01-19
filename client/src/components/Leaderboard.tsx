import { useQuery } from "@tanstack/react-query";
import { Trophy, Flame, Award, TrendingUp, Star } from "lucide-react";

interface RepStats {
  repName: string;
  lineManager: string;
  region: string;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  completionRate: number;
  badge: {
    type: 'gold' | 'silver' | 'bronze' | 'none';
    label: string;
    color: string;
    emoji: string;
  };
  streak: number;
  rank: number;
  isTopPerformer: boolean;
  storesMastered: number;
}

interface LeaderboardData {
  leaderboard: RepStats[];
  teamStats: {
    totalReps: number;
    totalTasks: number;
    totalCompleted: number;
    avgCompletionRate: number;
    badgeCounts: { gold: number; silver: number; bronze: number };
    topPerformers: RepStats[];
  };
  totalReps: number;
}

interface LeaderboardProps {
  manager?: string;
  limit?: number;
  showTeamStats?: boolean;
  onRepClick?: (repName: string) => void;
}

function BadgeIcon({ badge }: { badge: RepStats['badge'] }) {
  if (badge.type === 'none') return null;
  
  return (
    <span 
      style={{ 
        fontSize: '18px',
        filter: badge.type === 'gold' ? 'drop-shadow(0 0 4px gold)' : undefined,
      }}
      title={`${badge.label} Badge`}
    >
      {badge.emoji}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const styles: Record<number, { bg: string; text: string; border: string }> = {
    1: { bg: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', text: '#000', border: '#FFD700' },
    2: { bg: 'linear-gradient(135deg, #C0C0C0 0%, #A0A0A0 100%)', text: '#000', border: '#C0C0C0' },
    3: { bg: 'linear-gradient(135deg, #CD7F32 0%, #A0522D 100%)', text: '#FFF', border: '#CD7F32' },
  };
  
  const style = styles[rank] || { bg: '#F3F4F6', text: '#6B7280', border: '#E5E7EB' };
  
  return (
    <div
      style={{
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: style.bg,
        color: style.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 700,
        border: `2px solid ${style.border}`,
        boxShadow: rank <= 3 ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
      }}
    >
      {rank}
    </div>
  );
}

function StreakIndicator({ streak }: { streak: number }) {
  if (streak === 0) return null;
  
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        color: streak >= 7 ? '#DC2626' : streak >= 3 ? '#F59E0B' : '#6B7280',
        fontSize: '12px',
        fontWeight: 600,
      }}
      title={`${streak} day streak`}
    >
      <Flame size={14} />
      {streak}
    </div>
  );
}

function CompletionBar({ rate }: { rate: number }) {
  const getColor = () => {
    if (rate >= 90) return '#10B981';
    if (rate >= 70) return '#F59E0B';
    return '#F36C21';
  };
  
  return (
    <div style={{ flex: 1, maxWidth: '100px' }}>
      <div
        style={{
          height: '6px',
          backgroundColor: '#E5E7EB',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${rate}%`,
            backgroundColor: getColor(),
            borderRadius: '3px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

export default function Leaderboard({ manager, limit = 10, showTeamStats = true, onRepClick }: LeaderboardProps) {
  const { data, isLoading } = useQuery<LeaderboardData>({
    queryKey: ["gamification-leaderboard", manager, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (manager) params.set('manager', manager);
      params.set('limit', String(limit));
      const res = await fetch(`/api/gamification/leaderboard?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>
        Loading leaderboard...
      </div>
    );
  }

  if (!data || data.leaderboard.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6B7280' }}>
        No data available
      </div>
    );
  }

  return (
    <div>
      {showTeamStats && data.teamStats && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Trophy size={20} style={{ color: '#F36C21' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#003B71', margin: 0 }}>
              Team Achievements
            </h3>
          </div>
          
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>🥇</span>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#003B71' }}>
                  {data.teamStats.badgeCounts.gold}
                </div>
                <div style={{ fontSize: '11px', color: '#6B7280' }}>Gold</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>🥈</span>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#003B71' }}>
                  {data.teamStats.badgeCounts.silver}
                </div>
                <div style={{ fontSize: '11px', color: '#6B7280' }}>Silver</div>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>🥉</span>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#003B71' }}>
                  {data.teamStats.badgeCounts.bronze}
                </div>
                <div style={{ fontSize: '11px', color: '#6B7280' }}>Bronze</div>
              </div>
            </div>
            
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#6B7280' }}>Team Avg</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#003B71' }}>
                {data.teamStats.avgCompletionRate}%
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <TrendingUp size={20} style={{ color: '#003B71' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#003B71', margin: 0 }}>
            Leaderboard
          </h3>
          <span style={{ fontSize: '12px', color: '#6B7280', marginLeft: 'auto' }}>
            Top {Math.min(limit, data.leaderboard.length)} of {data.totalReps}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {data.leaderboard.map((rep) => (
            <div
              key={rep.repName}
              onClick={() => onRepClick?.(rep.repName)}
              data-testid={`leaderboard-row-${rep.repName}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                backgroundColor: rep.isTopPerformer ? '#FEF3C7' : '#F9FAFB',
                borderRadius: '8px',
                cursor: onRepClick ? 'pointer' : 'default',
                border: rep.rank === 1 ? '2px solid #FFD700' : '1px solid #E5E7EB',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                if (onRepClick) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <RankBadge rank={rep.rank} />
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#003B71',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {rep.repName}
                  </span>
                  <BadgeIcon badge={rep.badge} />
                  <StreakIndicator streak={rep.streak} />
                </div>
                <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '2px' }}>
                  {rep.region} | {rep.completedTasks}/{rep.totalTasks} tasks
                  {rep.storesMastered > 0 && (
                    <span style={{ marginLeft: '8px', color: '#10B981' }}>
                      <Star size={10} style={{ display: 'inline', marginRight: '2px' }} />
                      {rep.storesMastered} stores mastered
                    </span>
                  )}
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CompletionBar rate={rep.completionRate} />
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: rep.completionRate >= 90 ? '#10B981' : rep.completionRate >= 70 ? '#F59E0B' : '#F36C21',
                    minWidth: '40px',
                    textAlign: 'right',
                  }}
                >
                  {rep.completionRate}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
