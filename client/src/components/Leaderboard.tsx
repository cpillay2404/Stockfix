import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { COLORS } from "@/lib/design-tokens";

// Matches the dark navy/orange theme (Carin, 2026-08-17) - only ever used
// inside manager-progress.tsx, so safe to convert without affecting any
// other still-light screen.
// Gamification (badges/streaks/"stores mastered"/medal emoji) removed
// 2026-08-18 (Carin: "i dont want emojis and crap... all this nonsense") -
// plain, real completion numbers only.
const NAVY_CARD = COLORS.navyElevated;
const ORANGE = COLORS.orange;
const TEXT_MUTED = COLORS.textMuted;
const GREEN = "#34D399";
const AMBER = "#FBBF24";

interface RepStats {
  repName: string;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  completionRate: number;
  rank: number;
}

interface LeaderboardData {
  leaderboard: RepStats[];
  teamStats: {
    totalReps: number;
    totalTasks: number;
    totalCompleted: number;
    avgCompletionRate: number;
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

function RankBadge({ rank }: { rank: number }) {
  return (
    <div
      style={{
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: 'rgba(23,68,111,0.35)',
        color: TEXT_MUTED,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        fontWeight: 700,
        border: '2px solid rgba(23,68,111,0.6)',
      }}
    >
      {rank}
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
            display: 'flex',
            gap: '24px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: TEXT_MUTED }}>Team Completion</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: "#F7F9FC" }}>
              {data.teamStats.avgCompletionRate}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: TEXT_MUTED }}>Total Reps</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: "#F7F9FC" }}>
              {data.teamStats.totalReps}
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
                backgroundColor: 'rgba(23,68,111,0.25)',
                borderRadius: '8px',
                cursor: onRepClick ? 'pointer' : 'default',
                border: '1px solid rgba(23,68,111,0.5)',
              }}
            >
              <RankBadge rank={rep.rank} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
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
                </div>
                <div style={{ fontSize: '11px', color: TEXT_MUTED, marginTop: '2px' }}>
                  {rep.completedTasks}/{rep.totalTasks} tasks
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CompletionBar rate={rep.completionRate} />
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: rep.completionRate >= 90 ? GREEN : rep.completionRate >= 70 ? AMBER : ORANGE,
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
