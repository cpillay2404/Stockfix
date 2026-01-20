import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Users, Trophy, Flame, Target, Wrench, Sparkles, Zap, Award, Star, TrendingUp } from "lucide-react";
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

function CircularProgress({ value, size = 70, strokeWidth = 6, color }: { value: number; size?: number; strokeWidth?: number; color: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color, fontFamily: 'monospace' }}>{value}%</span>
      </div>
    </div>
  );
}

function MiniBarChart({ data, maxValue }: { data: { label: string; value: number; color: string }[]; maxValue: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '40px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <div style={{ 
            width: '100%', 
            height: `${Math.max((d.value / maxValue) * 40, 4)}px`, 
            backgroundColor: d.color, 
            borderRadius: '2px 2px 0 0',
            minHeight: '4px',
          }} />
          <span style={{ fontSize: '7px', color: '#6b7280', marginTop: '2px' }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <div style={{ fontSize: '24px' }}>🥇</div>;
  if (rank === 2) return <div style={{ fontSize: '24px' }}>🥈</div>;
  if (rank === 3) return <div style={{ fontSize: '24px' }}>🥉</div>;
  return (
    <div style={{ 
      width: '24px', 
      height: '24px', 
      borderRadius: '50%', 
      backgroundColor: '#e5e7eb', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      fontSize: '11px',
      fontWeight: 600,
      color: '#374151',
    }}>
      {rank}
    </div>
  );
}

function LeaderRow({ rank, name, rate, subtitle, badge, streak, showBar = true }: { rank: number; name: string; rate: number; subtitle?: string; badge?: string; streak?: number; showBar?: boolean }) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      padding: '8px 10px', 
      backgroundColor: rank <= 3 ? `rgba(243,108,33,${0.15 - rank * 0.04})` : (rank % 2 === 0 ? '#f9fafb' : 'white'), 
      borderRadius: '6px', 
      gap: '8px',
      border: rank <= 3 ? '1px solid rgba(243,108,33,0.2)' : 'none',
    }}>
      <RankBadge rank={rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#003B71', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {subtitle && <div style={{ fontSize: '9px', color: '#6b7280' }}>{subtitle}</div>}
      </div>
      {showBar && (
        <div style={{ width: '60px', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(rate, 100)}%`, height: '100%', backgroundColor: getRateColor(rate), borderRadius: '4px', transition: 'width 0.5s ease' }} />
        </div>
      )}
      <div style={{ 
        fontSize: '13px', 
        fontWeight: 700, 
        color: 'white', 
        fontFamily: 'monospace', 
        backgroundColor: getRateColor(rate),
        padding: '3px 8px',
        borderRadius: '12px',
        minWidth: '45px',
        textAlign: 'center',
      }}>
        {rate}%
      </div>
      {badge && <span style={{ fontSize: '16px' }}>{badge}</span>}
      {streak !== undefined && streak > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', backgroundColor: '#fef3c7', padding: '2px 6px', borderRadius: '10px' }}>
          <Flame size={12} color="#F36C21" />
          <span style={{ fontSize: '10px', fontWeight: 600, color: '#92400e' }}>{streak}</span>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, value, label, trend }: { icon: React.ReactNode; value: string | number; label: string; trend?: string }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '12px', 
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{ color: '#F36C21' }}>{icon}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{value}</div>
      <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      {trend && <div style={{ fontSize: '10px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '2px' }}><TrendingUp size={10} />{trend}</div>}
    </div>
  );
}

function LeaderboardPanel({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '12px', 
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        marginBottom: '10px',
        paddingBottom: '8px',
        borderBottom: '2px solid #003B71',
      }}>
        <span style={{ fontSize: '20px' }}>{emoji}</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#003B71', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
        <Trophy size={14} color="#FFD700" style={{ marginLeft: 'auto' }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
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
        <div style={{ textAlign: 'center' }}>
          <Trophy size={48} style={{ marginBottom: '16px', animation: 'pulse 2s infinite' }} />
          <div style={{ fontSize: '18px', fontWeight: 600 }}>Loading Leaderboard...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ height: '100vh', background: 'linear-gradient(135deg, #003B71 0%, #001a3d 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <div>Failed to load leaderboard</div>
      </div>
    );
  }

  const { overall, regionLeaderboard, managerLeaderboard, repLeaderboard } = data;
  const topRegions = regionLeaderboard.slice(0, 5);
  const topManagers = managerLeaderboard.slice(0, 5);
  const topReps = repLeaderboard.slice(0, 5);

  const goldCount = repLeaderboard.filter(r => r.badge.type === 'gold').length;
  const silverCount = repLeaderboard.filter(r => r.badge.type === 'silver').length;
  const bronzeCount = repLeaderboard.filter(r => r.badge.type === 'bronze').length;

  return (
    <div style={{ 
      height: '100vh', 
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f0f2f5',
    }}>
      <div style={{ 
        background: 'linear-gradient(135deg, #003B71 0%, #002855 50%, #001a3d 100%)',
        color: 'white', 
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate("/")} data-testid="back-button" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}>
            <ArrowLeft size={18} />
          </button>
          <img src={meridianLogo} alt="Meridian" style={{ height: '28px', objectFit: 'contain' }} />
          <div style={{ height: '20px', width: '1px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ backgroundColor: '#F36C21', borderRadius: '6px', padding: '4px', display: 'flex' }}>
              <Wrench size={14} color="white" />
            </div>
            <span style={{ fontSize: '14px', fontWeight: 700 }}>StockFix</span>
            <Sparkles size={12} color="#FFD700" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '16px', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
            <Zap size={12} color="#FFD700" />
            <span style={{ fontWeight: 600 }}>LIVE</span>
          </div>
          {data.weekEndingDate && (
            <div style={{ fontSize: '11px', opacity: 0.8 }}>Week: {data.weekEndingDate}</div>
          )}
        </div>
      </div>

      <div style={{ padding: '10px 16px', display: 'flex', gap: '10px', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'white', borderRadius: '12px', padding: '12px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <CircularProgress value={overall.priorityRate} color="#F36C21" size={65} />
          <div>
            <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>Priority Rate</div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#003B71' }}>{overall.priorityCompleted}/{overall.priorityTotal} tasks</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', backgroundColor: 'white', borderRadius: '12px', padding: '12px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <CircularProgress value={overall.completionRate} color="#16a34a" size={65} />
          <div>
            <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase' }}>Overall Rate</div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#003B71' }}>{overall.totalCompleted}/{overall.totalTasks} tasks</div>
          </div>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
          <StatCard icon={<Users size={16} />} value={overall.totalReps} label="Reps" />
          <StatCard icon={<Award size={16} />} value={overall.totalManagers} label="Managers" />
          <StatCard icon={<MapPin size={16} />} value={overall.totalRegions} label="Regions" />
          <StatCard icon={<span style={{ fontSize: '16px' }}>🥇</span>} value={goldCount} label="Gold" />
          <StatCard icon={<span style={{ fontSize: '16px' }}>🥈</span>} value={silverCount} label="Silver" />
        </div>
      </div>

      <div style={{ flex: 1, padding: '0 16px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', minHeight: 0 }}>
        <LeaderboardPanel title="Top Regions" emoji="🌍">
          {topRegions.map((r, idx) => (
            <LeaderRow 
              key={r.region} 
              rank={idx + 1} 
              name={r.region} 
              rate={r.priorityRate} 
              subtitle={`${r.repCount} reps`}
            />
          ))}
        </LeaderboardPanel>

        <LeaderboardPanel title="Top Managers" emoji="👔">
          {topManagers.map((m, idx) => (
            <LeaderRow 
              key={m.manager} 
              rank={idx + 1} 
              name={m.manager} 
              rate={m.priorityRate} 
              subtitle={`${m.repCount} reps`}
            />
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
      </div>
    </div>
  );
}
