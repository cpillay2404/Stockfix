import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Users, Trophy, Flame, Target, Wrench, Sparkles, Zap, Award } from "lucide-react";
import { useLocation } from "wouter";
import meridianLogo from "@/assets/meridian-logo.png";

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

function getRateColor(rate: number): string {
  if (rate >= 90) return '#16a34a';
  if (rate >= 70) return '#F36C21';
  return '#dc2626';
}

function CircularProgress({ value, size = 60, strokeWidth = 6, color, label }: { value: number; size?: number; strokeWidth?: number; color: string; label?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  const fontSize = Math.max(12, size * 0.2);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: `${fontSize}px`, fontWeight: 700, color, fontFamily: 'monospace' }}>{value}%</span>
        </div>
      </div>
      {label && <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', marginTop: '4px', fontWeight: 600 }}>{label}</div>}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: '16px' }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: '16px' }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: '16px' }}>🥉</span>;
  return (
    <span style={{ 
      display: 'inline-flex',
      width: '18px', 
      height: '18px', 
      borderRadius: '50%', 
      backgroundColor: '#e5e7eb', 
      alignItems: 'center', 
      justifyContent: 'center',
      fontSize: '10px',
      fontWeight: 600,
      color: '#374151',
    }}>
      {rank}
    </span>
  );
}

function LeaderRow({ rank, name, rate, subtitle, badge, streak }: { rank: number; name: string; rate: number; subtitle?: string; badge?: string; streak?: number }) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      padding: '4px 8px', 
      backgroundColor: rank <= 3 ? `rgba(243,108,33,${0.1 - rank * 0.02})` : (rank % 2 === 0 ? '#f9fafb' : 'white'), 
      borderRadius: '4px', 
      gap: '6px',
    }}>
      <RankBadge rank={rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#003B71', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {subtitle && <div style={{ fontSize: '9px', color: '#9ca3af' }}>{subtitle}</div>}
      </div>
      <div style={{ width: '40px', height: '5px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(rate, 100)}%`, height: '100%', backgroundColor: getRateColor(rate) }} />
      </div>
      <div style={{ 
        fontSize: '10px',
        fontWeight: 700, 
        color: 'white', 
        fontFamily: 'monospace', 
        backgroundColor: getRateColor(rate),
        padding: '2px 6px',
        borderRadius: '8px',
      }}>
        {rate}%
      </div>
      {badge && <span style={{ fontSize: '12px' }}>{badge}</span>}
      {streak !== undefined && streak > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', fontSize: '9px', color: '#F36C21', gap: '1px' }}>
          <Flame size={10} />{streak}
        </span>
      )}
    </div>
  );
}

function LeaderboardPanel({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '10px', 
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px', 
        marginBottom: '8px',
        paddingBottom: '6px',
        borderBottom: '2px solid #003B71',
      }}>
        <span style={{ fontSize: '14px' }}>{emoji}</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#003B71', textTransform: 'uppercase' }}>{title}</span>
        <Trophy size={12} color="#FFD700" style={{ marginLeft: 'auto' }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {children}
      </div>
    </div>
  );
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
      <div style={{ height: '100vh', background: 'linear-gradient(135deg, #003B71 0%, #001a3d 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <Trophy size={40} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ height: '100vh', background: '#003B71', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        Failed to load
      </div>
    );
  }

  const { overall, regionLeaderboard, managerLeaderboard, repLeaderboard } = data;
  const topRegions = regionLeaderboard.slice(0, 8);
  const topManagers = managerLeaderboard.slice(0, 8);
  const topReps = repLeaderboard.slice(0, 8);

  const goldCount = repLeaderboard.filter(r => r.badge.type === 'gold').length;
  const silverCount = repLeaderboard.filter(r => r.badge.type === 'silver').length;
  const bronzeCount = repLeaderboard.filter(r => r.badge.type === 'bronze').length;
  const topStreaks = [...repLeaderboard].filter(r => r.streak > 0).sort((a, b) => b.streak - a.streak).slice(0, 5);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#f0f2f5' }}>
      <div style={{ 
        background: 'linear-gradient(135deg, #003B71 0%, #001a3d 100%)',
        color: 'white', 
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => navigate("/")} data-testid="back-button" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
            <ArrowLeft size={16} />
          </button>
          <img src={meridianLogo} alt="Meridian" style={{ height: '22px' }} />
          <div style={{ height: '16px', width: '1px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <div style={{ backgroundColor: '#F36C21', borderRadius: '4px', padding: '3px', display: 'flex' }}>
            <Wrench size={12} color="white" />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700 }}>StockFix</span>
          <Sparkles size={10} color="#FFD700" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '10px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
            <Zap size={10} color="#FFD700" />
            <span style={{ fontWeight: 600 }}>LIVE</span>
          </div>
          {data.weekEndingDate && <span style={{ fontSize: '10px', opacity: 0.8 }}>Week: {data.weekEndingDate}</span>}
        </div>
      </div>

      <div style={{ flex: 1, padding: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '10px', minHeight: 0 }}>
        <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>🎯 Performance</div>
          <div style={{ display: 'flex', gap: '30px', flex: 1, alignItems: 'center' }}>
            <CircularProgress value={overall.priorityRate} color="#F36C21" size={100} strokeWidth={10} label="Priority" />
            <CircularProgress value={overall.completionRate} color="#16a34a" size={100} strokeWidth={10} label="Overall" />
          </div>
          <div style={{ fontSize: '12px', color: '#003B71', fontWeight: 600 }}>
            {overall.priorityCompleted}/{overall.priorityTotal} priority tasks
          </div>
        </div>

        <LeaderboardPanel title="Top Regions" emoji="🌍">
          {topRegions.map((r, idx) => (
            <LeaderRow key={r.region} rank={idx + 1} name={r.region} rate={r.priorityRate} subtitle={`${r.repCount} reps`} />
          ))}
        </LeaderboardPanel>

        <LeaderboardPanel title="Top Managers" emoji="👔">
          {topManagers.map((m, idx) => (
            <LeaderRow key={m.manager} rank={idx + 1} name={m.manager} rate={m.priorityRate} subtitle={m.region} />
          ))}
        </LeaderboardPanel>

        <LeaderboardPanel title="Top Reps" emoji="🏆">
          {topReps.map((rep, idx) => (
            <LeaderRow 
              key={rep.repName} 
              rank={idx + 1} 
              name={rep.repName} 
              rate={rep.priorityCompletionRate} 
              subtitle={rep.lineManager}
              badge={rep.badge.type !== 'none' ? (rep.badge.type === 'gold' ? '🥇' : rep.badge.type === 'silver' ? '🥈' : '🥉') : undefined}
              streak={rep.streak}
            />
          ))}
        </LeaderboardPanel>

        <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            📊 Stats
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', flex: 1 }}>
            <div style={{ backgroundColor: '#f0f9ff', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={18} color="#003B71" />
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{overall.totalReps}</div>
              <div style={{ fontSize: '8px', color: '#6b7280', textTransform: 'uppercase' }}>Reps</div>
            </div>
            <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Award size={18} color="#16a34a" />
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{overall.totalManagers}</div>
              <div style={{ fontSize: '8px', color: '#6b7280', textTransform: 'uppercase' }}>Managers</div>
            </div>
            <div style={{ backgroundColor: '#fef3c7', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={18} color="#F36C21" />
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{overall.totalRegions}</div>
              <div style={{ fontSize: '8px', color: '#6b7280', textTransform: 'uppercase' }}>Regions</div>
            </div>
            <div style={{ backgroundColor: '#fce7f3', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={18} color="#db2777" />
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{overall.totalTasks}</div>
              <div style={{ fontSize: '8px', color: '#6b7280', textTransform: 'uppercase' }}>Tasks</div>
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, marginBottom: '10px' }}>🏆 Badge Count</div>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', flex: 1 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px' }}>🥇</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{goldCount}</div>
              <div style={{ fontSize: '9px', color: '#6b7280' }}>Gold</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px' }}>🥈</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{silverCount}</div>
              <div style={{ fontSize: '9px', color: '#6b7280' }}>Silver</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px' }}>🥉</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{bronzeCount}</div>
              <div style={{ fontSize: '9px', color: '#6b7280' }}>Bronze</div>
            </div>
          </div>
        </div>

        <div style={{ gridColumn: 'span 2', backgroundColor: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            🔥 Top Streaks
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', flex: 1 }}>
            {topStreaks.length > 0 ? topStreaks.map((rep, idx) => (
              <div key={idx} style={{ 
                backgroundColor: '#fef3c7', 
                borderRadius: '8px', 
                padding: '10px', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #fcd34d',
              }}>
                <Flame size={20} color="#F36C21" />
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#b45309', fontFamily: 'monospace' }}>{rep.streak}d</div>
                <div style={{ fontSize: '9px', color: '#92400e', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', fontWeight: 600 }}>{rep.repName}</div>
                <div style={{ fontSize: '8px', color: '#a16207', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{rep.lineManager}</div>
              </div>
            )) : (
              <div style={{ gridColumn: 'span 5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '12px' }}>
                No active streaks
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
