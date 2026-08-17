import { useQuery } from "@tanstack/react-query";
import { Trophy, Flame, Award, TrendingUp, Star } from "lucide-react";
import { COLORS } from "@/lib/design-tokens";

// Matches the dark navy/orange theme (Carin, 2026-08-17) - only ever used
// inside manager-progress.tsx, so safe to convert without affecting any
// other still-light screen.
const NAVY_CARD = COLORS.navyElevated;
const ORANGE = COLORS.orange;
const TEXT_MUTED = COLORS.textMuted;
const RED = "#F87171";
const GREEN = "#34D399";
const AMBER = "#FBBF24";

interface RepStats {
  repName: string;
  lineManager: string;
  region: string;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  completionRate: number;
  // Priority task metrics (what reps are measured on)
  priorityTotalTasks: number;
  priorityCompletedTasks: number;
  priorityOpenTasks: number;
  priorityCompletionRate: number;
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
    // Priority task metrics (what the team is measured on)
    priorityTotalTasks: number;
    priorityCompletedTasks: number;
    avgPriorityCompletionRate: number;
    badgeCounts: { gold: number; silver: number; bronze: number };
    topPerformers: RepStats[];
  };
  totalReps: number;
}

interface LeaderboardProps {
  manager?: string;
  client?: string;
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

  const style = styles[rank] || { bg: 'rgba(23,68,111,0.35)', text: TEXT_MUTED, border: 'rgba(23,68,111,0.6)' };

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
        boxShadow: rank <= 3 ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
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
        color: streak >= 7 ? RED : streak >= 3 ? AMBER : TEXT_MUTED,
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
    if (rate >= 90) return GREEN;
    if (rate >= 70) return AMBER;
    return ORANGE;
  };

  return (
    <div style={{ flex: 1, maxWidth: '100px' }}>
      <div
        style={{
          height: '6px',
          backgroundColor: 'rgba(23,68,111,0.4)',
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

export default function Leaderboard({ manager, client, limit = 10, showTeamStats = true, onRepClick }: LeaderboardProps) {
  const { data, isLoading } = useQuery<LeaderboardData>({
    queryKey: ["gamification-leaderboard", manager, client, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (manager) params.set('manager', manager);
      if (client) params.set('client', client);
      params.set('limit', String(limit));
      const res = await fetch(`/api/gamification/leaderboard?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: TEXT_MUTED }}>
        Loading leaderboard...
      </div>
    );
  }

  if (!data || data.leaderboard.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: TEXT_MUTED }}>
        No data available
      </div>
    );
  }

  return (
    <div>
      {showTeamStats && data.teamStats && (
        <div
          style={{
            backgroundColor: NAVY_CARD,
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <Trophy size={20} style={{ color: ORANGE }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: "#F7F9FC", margin: 0 }}>
              Team Achievements
            </h3>
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>🥇</span>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: "#F7F9FC" }}>
                  {data.teamStats.badgeCounts.gold}
                </div>
                <div style={{ fontSize: '11px', color: TEXT_MUTED }}>Gold</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>🥈</span>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: "#F7F9FC" }}>
                  {data.teamStats.badgeCounts.silver}
                </div>
                <div style={{ fontSize: '11px', color: TEXT_MUTED }}>Silver</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px' }}>🥉</span>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: "#F7F9FC" }}>
                  {data.teamStats.badgeCounts.bronze}
                </div>
                <div style={{ fontSize: '11px', color: TEXT_MUTED }}>Bronze</div>
              </div>
            </div>

            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: TEXT_MUTED }}>Priority Avg</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: "#F7F9FC" }}>
                {data.teamStats.avgPriorityCompletionRate ?? data.teamStats.avgCompletionRate}%
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          backgroundColor: NAVY_CARD,
          borderRadius: '12px',
          padding: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <TrendingUp size={20} style={{ color: "#F7F9FC" }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: "#F7F9FC", margin: 0 }}>
            Leaderboard
          </h3>
          <span style={{ fontSize: '12px', color: TEXT_MUTED, marginLeft: 'auto' }}>
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
                backgroundColor: rep.isTopPerformer ? 'rgba(251,191,36,0.12)' : 'rgba(23,68,111,0.25)',
                borderRadius: '8px',
                cursor: onRepClick ? 'pointer' : 'default',
                border: rep.rank === 1 ? '2px solid #FFD700' : '1px solid rgba(23,68,111,0.5)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={(e) => {
                if (onRepClick) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
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
                      color: "#F7F9FC",
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
                <div style={{ fontSize: '11px', color: TEXT_MUTED, marginTop: '2px' }}>
                  {rep.region} | {rep.completedTasks}/{rep.totalTasks} tasks
                  {rep.storesMastered > 0 && (
                    <span style={{ marginLeft: '8px', color: GREEN }}>
                      <Star size={10} style={{ display: 'inline', marginRight: '2px' }} />
                      {rep.storesMastered} stores mastered
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CompletionBar rate={rep.priorityCompletionRate ?? rep.completionRate} />
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: (rep.priorityCompletionRate ?? rep.completionRate) >= 90 ? GREEN : (rep.priorityCompletionRate ?? rep.completionRate) >= 70 ? AMBER : ORANGE,
                    minWidth: '40px',
                    textAlign: 'right',
                  }}
                >
                  {rep.priorityCompletionRate ?? rep.completionRate}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
