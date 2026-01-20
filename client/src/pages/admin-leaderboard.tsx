import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Users, Trophy, Flame, Target, Wrench, Sparkles, Zap, Award, TrendingUp } from "lucide-react";
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

function CircularProgress({ value, size = 50, strokeWidth = 5, color, label }: { value: number; size?: number; strokeWidth?: number; color: string; label?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color, fontFamily: 'monospace' }}>{value}%</span>
        </div>
      </div>
      {label && <div style={{ fontSize: '8px', color: '#6b7280', textTransform: 'uppercase' }}>{label}</div>}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: '14px' }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: '14px' }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: '14px' }}>🥉</span>;
  return (
    <span style={{ 
      display: 'inline-flex',
      width: '16px', 
      height: '16px', 
      borderRadius: '50%', 
      backgroundColor: '#e5e7eb', 
      alignItems: 'center', 
      justifyContent: 'center',
      fontSize: '9px',
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
      padding: '3px 6px', 
      backgroundColor: rank <= 3 ? `rgba(243,108,33,${0.1 - rank * 0.02})` : (rank % 2 === 0 ? '#f9fafb' : 'white'), 
      borderRadius: '4px', 
      gap: '4px',
      fontSize: '10px',
    }}>
      <RankBadge rank={rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: '#003B71', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {subtitle && <div style={{ fontSize: '8px', color: '#9ca3af', marginTop: '-1px' }}>{subtitle}</div>}
      </div>
      <div style={{ width: '35px', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(rate, 100)}%`, height: '100%', backgroundColor: getRateColor(rate) }} />
      </div>
      <div style={{ 
        fontWeight: 700, 
        color: 'white', 
        fontFamily: 'monospace', 
        backgroundColor: getRateColor(rate),
        padding: '1px 4px',
        borderRadius: '6px',
        fontSize: '9px',
      }}>
        {rate}%
      </div>
      {badge && <span style={{ fontSize: '11px' }}>{badge}</span>}
      {streak !== undefined && streak > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', fontSize: '8px', color: '#F36C21' }}>
          <Flame size={8} />{streak}
        </span>
      )}
    </div>
  );
}

function StatBox({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '6px', 
      padding: '6px',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    }}>
      <div style={{ color: '#F36C21' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '7px', color: '#6b7280', textTransform: 'uppercase' }}>{label}</div>
      </div>
    </div>
  );
}

function LeaderboardPanel({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '8px', 
      padding: '8px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '4px', 
        marginBottom: '6px',
        paddingBottom: '4px',
        borderBottom: '2px solid #003B71',
      }}>
        <span style={{ fontSize: '12px' }}>{emoji}</span>
        <span style={{ fontSize: '10px', fontWeight: 700, color: '#003B71', textTransform: 'uppercase' }}>{title}</span>
        <Trophy size={10} color="#FFD700" style={{ marginLeft: 'auto' }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
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
  const topRegions = regionLeaderboard.slice(0, 10);
  const topManagers = managerLeaderboard.slice(0, 10);
  const topReps = repLeaderboard.slice(0, 10);

  const goldCount = repLeaderboard.filter(r => r.badge.type === 'gold').length;
  const silverCount = repLeaderboard.filter(r => r.badge.type === 'silver').length;
  const bronzeCount = repLeaderboard.filter(r => r.badge.type === 'bronze').length;
  const topStreaks = [...repLeaderboard].filter(r => r.streak > 0).sort((a, b) => b.streak - a.streak).slice(0, 3);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#f0f2f5' }}>
      <div style={{ 
        background: 'linear-gradient(135deg, #003B71 0%, #001a3d 100%)',
        color: 'white', 
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => navigate("/")} data-testid="back-button" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
            <ArrowLeft size={14} />
          </button>
          <img src={meridianLogo} alt="Meridian" style={{ height: '20px' }} />
          <div style={{ height: '14px', width: '1px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <div style={{ backgroundColor: '#F36C21', borderRadius: '4px', padding: '2px', display: 'flex' }}>
            <Wrench size={10} color="white" />
          </div>
          <span style={{ fontSize: '11px', fontWeight: 700 }}>StockFix</span>
          <Sparkles size={10} color="#FFD700" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '10px', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px' }}>
            <Zap size={9} color="#FFD700" />
            <span style={{ fontWeight: 600 }}>LIVE</span>
          </div>
          {data.weekEndingDate && <span style={{ fontSize: '9px', opacity: 0.8 }}>Week: {data.weekEndingDate}</span>}
        </div>
      </div>

      <div style={{ flex: 1, padding: '8px', display: 'grid', gridTemplateColumns: '160px 1fr 1fr 1fr', gap: '8px', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
            <div style={{ fontSize: '8px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Performance</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <CircularProgress value={overall.priorityRate} color="#F36C21" size={50} label="Priority" />
              <CircularProgress value={overall.completionRate} color="#16a34a" size={50} label="Overall" />
            </div>
            <div style={{ fontSize: '8px', color: '#003B71', fontWeight: 600 }}>
              {overall.priorityCompleted}/{overall.priorityTotal} priority
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
            <StatBox icon={<Users size={12} />} value={overall.totalReps} label="Reps" />
            <StatBox icon={<Award size={12} />} value={overall.totalManagers} label="Mgrs" />
            <StatBox icon={<MapPin size={12} />} value={overall.totalRegions} label="Regions" />
            <StatBox icon={<Target size={12} />} value={overall.totalTasks} label="Tasks" />
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '8px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>🏆 Badges</div>
            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: '14px' }}>🥇</div><div style={{ fontSize: '12px', fontWeight: 700, color: '#003B71' }}>{goldCount}</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: '14px' }}>🥈</div><div style={{ fontSize: '12px', fontWeight: 700, color: '#003B71' }}>{silverCount}</div></div>
              <div style={{ textAlign: 'center' }}><div style={{ fontSize: '14px' }}>🥉</div><div style={{ fontSize: '12px', fontWeight: 700, color: '#003B71' }}>{bronzeCount}</div></div>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', flex: 1 }}>
            <div style={{ fontSize: '8px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>🔥 Top Streaks</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {topStreaks.length > 0 ? topStreaks.map((rep, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 6px', backgroundColor: '#fef3c7', borderRadius: '4px', fontSize: '9px' }}>
                  <Flame size={10} color="#F36C21" />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#92400e', fontWeight: 500 }}>{rep.repName}</span>
                  <span style={{ fontWeight: 700, color: '#b45309' }}>{rep.streak}d</span>
                </div>
              )) : <div style={{ fontSize: '9px', color: '#9ca3af', textAlign: 'center' }}>No streaks</div>}
            </div>
          </div>
        </div>

        <LeaderboardPanel title="Regions" emoji="🌍">
          {topRegions.map((r, idx) => (
            <LeaderRow key={r.region} rank={idx + 1} name={r.region} rate={r.priorityRate} subtitle={`${r.repCount} reps`} />
          ))}
        </LeaderboardPanel>

        <LeaderboardPanel title="Managers" emoji="👔">
          {topManagers.map((m, idx) => (
            <LeaderRow key={m.manager} rank={idx + 1} name={m.manager} rate={m.priorityRate} subtitle={m.region} />
          ))}
        </LeaderboardPanel>

        <LeaderboardPanel title="Reps" emoji="🏆">
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
      </div>
    </div>
  );
}
