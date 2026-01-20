import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Users, MapPin, UserCheck, Trophy, Medal, Award, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";

interface RegionStats {
  region: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  priorityTasks: number;
  priorityCompleted: number;
  priorityRate: number;
  repCount: number;
}

interface ManagerStats {
  manager: string;
  region: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  priorityTasks: number;
  priorityCompleted: number;
  priorityRate: number;
  repCount: number;
  goldBadges: number;
  silverBadges: number;
  bronzeBadges: number;
}

interface RepStats {
  repName: string;
  lineManager: string;
  region: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  priorityTotalTasks: number;
  priorityCompletedTasks: number;
  priorityCompletionRate: number;
  badge: { type: string; label: string; emoji: string };
  streak: number;
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
}

const headerStyle = {
  backgroundColor: '#003B71',
  color: 'white',
  padding: '16px 20px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const containerStyle = {
  backgroundColor: '#f3f4f6',
  minHeight: '100vh',
};

const cardStyle = {
  backgroundColor: 'white',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

const sectionTitleStyle = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#003B71',
  marginBottom: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const tableHeaderStyle = {
  backgroundColor: '#f9fafb',
  padding: '8px 12px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
};

const tableRowStyle = {
  borderBottom: '1px solid #e5e7eb',
  padding: '10px 12px',
  fontSize: '13px',
};

function getRateColor(rate: number): string {
  if (rate >= 90) return '#16a34a';
  if (rate >= 70) return '#F36C21';
  return '#dc2626';
}

function getBadgeEmoji(type: string): string {
  if (type === 'gold') return '🥇';
  if (type === 'silver') return '🥈';
  if (type === 'bronze') return '🥉';
  return '';
}

export default function AdminLeaderboard() {
  const [, navigate] = useLocation();

  const { data, isLoading, error } = useQuery<AdminLeaderboardData>({
    queryKey: ["admin-leaderboard"],
    queryFn: async () => {
      const res = await fetch("/api/admin/leaderboard");
      if (!res.ok) throw new Error("Failed to fetch admin leaderboard");
      return res.json();
    },
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <button onClick={() => navigate("/")} data-testid="back-button">
            <ArrowLeft size={20} />
          </button>
          <span style={{ fontSize: '18px', fontWeight: 600 }}>Admin Leaderboard</span>
        </div>
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
          Loading leaderboard data...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <button onClick={() => navigate("/")} data-testid="back-button">
            <ArrowLeft size={20} />
          </button>
          <span style={{ fontSize: '18px', fontWeight: 600 }}>Admin Leaderboard</span>
        </div>
        <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>
          Failed to load leaderboard data
        </div>
      </div>
    );
  }

  const { overall, regionLeaderboard, managerLeaderboard, repLeaderboard } = data;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <button onClick={() => navigate("/")} data-testid="back-button">
          <ArrowLeft size={20} />
        </button>
        <span style={{ fontSize: '18px', fontWeight: 600 }}>Admin Leaderboard</span>
        {data.weekEndingDate && (
          <span style={{ fontSize: '12px', opacity: 0.8, marginLeft: 'auto' }}>
            Week: {data.weekEndingDate}
          </span>
        )}
      </div>

      <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>
            <TrendingUp size={16} />
            Overall Performance
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
            <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{overall.totalReps}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Reps</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{overall.totalManagers}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Managers</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{overall.totalRegions}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Regions</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#fef3c7', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: getRateColor(overall.priorityRate), fontFamily: 'monospace' }}>{overall.priorityRate}%</div>
              <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Priority Rate</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: getRateColor(overall.completionRate), fontFamily: 'monospace' }}>{overall.completionRate}%</div>
              <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Overall Rate</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', backgroundColor: '#f0f9ff', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{overall.priorityCompleted}/{overall.priorityTotal}</div>
              <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>Priority Tasks</div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitleStyle}>
            <MapPin size={16} />
            Region Leaderboard ({regionLeaderboard.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderStyle, textAlign: 'left' }}>#</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'left' }}>Region</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Reps</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Priority</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Overall</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Tasks</th>
                </tr>
              </thead>
              <tbody>
                {regionLeaderboard.map((r, idx) => (
                  <tr key={r.region} data-testid={`region-row-${idx}`}>
                    <td style={{ ...tableRowStyle, fontWeight: 600, color: idx < 3 ? '#F36C21' : '#374151' }}>{idx + 1}</td>
                    <td style={{ ...tableRowStyle, fontWeight: 500 }}>{r.region}</td>
                    <td style={{ ...tableRowStyle, textAlign: 'right', fontFamily: 'monospace' }}>{r.repCount}</td>
                    <td style={{ ...tableRowStyle, textAlign: 'right', fontWeight: 600, color: getRateColor(r.priorityRate), fontFamily: 'monospace' }}>{r.priorityRate}%</td>
                    <td style={{ ...tableRowStyle, textAlign: 'right', fontFamily: 'monospace' }}>{r.completionRate}%</td>
                    <td style={{ ...tableRowStyle, textAlign: 'right', fontSize: '12px', color: '#6b7280' }}>{r.completedTasks}/{r.totalTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitleStyle}>
            <UserCheck size={16} />
            Manager Leaderboard ({managerLeaderboard.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderStyle, textAlign: 'left' }}>#</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'left' }}>Manager</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'left' }}>Region</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Reps</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Priority</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Overall</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'center' }}>Badges</th>
                </tr>
              </thead>
              <tbody>
                {managerLeaderboard.map((m, idx) => (
                  <tr key={m.manager} data-testid={`manager-row-${idx}`}>
                    <td style={{ ...tableRowStyle, fontWeight: 600, color: idx < 3 ? '#F36C21' : '#374151' }}>{idx + 1}</td>
                    <td style={{ ...tableRowStyle, fontWeight: 500 }}>{m.manager}</td>
                    <td style={{ ...tableRowStyle, fontSize: '12px', color: '#6b7280' }}>{m.region}</td>
                    <td style={{ ...tableRowStyle, textAlign: 'right', fontFamily: 'monospace' }}>{m.repCount}</td>
                    <td style={{ ...tableRowStyle, textAlign: 'right', fontWeight: 600, color: getRateColor(m.priorityRate), fontFamily: 'monospace' }}>{m.priorityRate}%</td>
                    <td style={{ ...tableRowStyle, textAlign: 'right', fontFamily: 'monospace' }}>{m.completionRate}%</td>
                    <td style={{ ...tableRowStyle, textAlign: 'center', fontSize: '14px' }}>
                      {m.goldBadges > 0 && <span title="Gold badges">🥇{m.goldBadges} </span>}
                      {m.silverBadges > 0 && <span title="Silver badges">🥈{m.silverBadges} </span>}
                      {m.bronzeBadges > 0 && <span title="Bronze badges">🥉{m.bronzeBadges}</span>}
                      {m.goldBadges === 0 && m.silverBadges === 0 && m.bronzeBadges === 0 && <span style={{ color: '#9ca3af' }}>-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitleStyle}>
            <Trophy size={16} />
            Rep Leaderboard ({repLeaderboard.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...tableHeaderStyle, textAlign: 'left' }}>#</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'left' }}>Rep</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'left' }}>Manager</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'left' }}>Region</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Priority</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Overall</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'center' }}>Badge</th>
                  <th style={{ ...tableHeaderStyle, textAlign: 'right' }}>Streak</th>
                </tr>
              </thead>
              <tbody>
                {repLeaderboard.map((rep, idx) => (
                  <tr key={rep.repName} data-testid={`rep-row-${idx}`}>
                    <td style={{ ...tableRowStyle, fontWeight: 600, color: idx < 3 ? '#F36C21' : '#374151' }}>{idx + 1}</td>
                    <td style={{ ...tableRowStyle, fontWeight: 500 }}>{rep.repName}</td>
                    <td style={{ ...tableRowStyle, fontSize: '12px', color: '#6b7280' }}>{rep.lineManager}</td>
                    <td style={{ ...tableRowStyle, fontSize: '12px', color: '#6b7280' }}>{rep.region}</td>
                    <td style={{ ...tableRowStyle, textAlign: 'right', fontWeight: 600, color: getRateColor(rep.priorityCompletionRate), fontFamily: 'monospace' }}>{rep.priorityCompletionRate}%</td>
                    <td style={{ ...tableRowStyle, textAlign: 'right', fontFamily: 'monospace' }}>{rep.completionRate}%</td>
                    <td style={{ ...tableRowStyle, textAlign: 'center', fontSize: '16px' }}>{getBadgeEmoji(rep.badge.type) || '-'}</td>
                    <td style={{ ...tableRowStyle, textAlign: 'right', fontFamily: 'monospace' }}>{rep.streak > 0 ? `${rep.streak}d` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
