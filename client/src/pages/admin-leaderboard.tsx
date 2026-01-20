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

function CircularProgress({ value, size = 80, strokeWidth = 8, color, label }: { value: number; size?: number; strokeWidth?: number; color: string; label?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '18px', fontWeight: 700, color, fontFamily: 'monospace' }}>{value}%</span>
        </div>
      </div>
      {label && <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <div style={{ fontSize: '20px' }}>🥇</div>;
  if (rank === 2) return <div style={{ fontSize: '20px' }}>🥈</div>;
  if (rank === 3) return <div style={{ fontSize: '20px' }}>🥉</div>;
  return (
    <div style={{ 
      width: '22px', 
      height: '22px', 
      borderRadius: '50%', 
      backgroundColor: '#e5e7eb', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      fontSize: '10px',
      fontWeight: 600,
      color: '#374151',
    }}>
      {rank}
    </div>
  );
}

function LeaderRow({ rank, name, rate, subtitle, badge, streak, tasks }: { rank: number; name: string; rate: number; subtitle?: string; badge?: string; streak?: number; tasks?: string }) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      padding: '6px 8px', 
      backgroundColor: rank <= 3 ? `rgba(243,108,33,${0.12 - rank * 0.03})` : (rank % 2 === 0 ? '#f9fafb' : 'white'), 
      borderRadius: '6px', 
      gap: '6px',
      border: rank <= 3 ? '1px solid rgba(243,108,33,0.15)' : 'none',
    }}>
      <RankBadge rank={rank} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#003B71', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {subtitle && <div style={{ fontSize: '8px', color: '#6b7280' }}>{subtitle}</div>}
      </div>
      <div style={{ width: '50px', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(rate, 100)}%`, height: '100%', backgroundColor: getRateColor(rate), borderRadius: '3px' }} />
      </div>
      <div style={{ 
        fontSize: '11px', 
        fontWeight: 700, 
        color: 'white', 
        fontFamily: 'monospace', 
        backgroundColor: getRateColor(rate),
        padding: '2px 6px',
        borderRadius: '10px',
        minWidth: '38px',
        textAlign: 'center',
      }}>
        {rate}%
      </div>
      {tasks && <div style={{ fontSize: '9px', color: '#6b7280', minWidth: '40px', textAlign: 'right' }}>{tasks}</div>}
      {badge && <span style={{ fontSize: '14px' }}>{badge}</span>}
      {streak !== undefined && streak > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1px', backgroundColor: '#fef3c7', padding: '2px 4px', borderRadius: '8px' }}>
          <Flame size={10} color="#F36C21" />
          <span style={{ fontSize: '9px', fontWeight: 600, color: '#92400e' }}>{streak}</span>
        </div>
      )}
    </div>
  );
}

function StatBox({ icon, value, label, color = '#003B71' }: { icon: React.ReactNode; value: string | number; label: string; color?: string }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '10px', 
      padding: '10px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ color }}>{icon}</div>
      <div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase' }}>{label}</div>
      </div>
    </div>
  );
}

function LeaderboardPanel({ title, emoji, icon, children }: { title: string; emoji: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '12px', 
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px', 
        marginBottom: '8px',
        paddingBottom: '6px',
        borderBottom: '2px solid #003B71',
      }}>
        <span style={{ fontSize: '16px' }}>{emoji}</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#003B71', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
        <div style={{ marginLeft: 'auto', color: '#F36C21' }}>{icon}</div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function BadgeCard({ emoji, count, label, color }: { emoji: string; count: number; label: string; color: string }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '10px', 
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      border: `1px solid ${color}20`,
    }}>
      <span style={{ fontSize: '20px' }}>{emoji}</span>
      <div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{count}</div>
        <div style={{ fontSize: '8px', color: '#6b7280', textTransform: 'uppercase' }}>{label}</div>
      </div>
    </div>
  );
}

function TopStreakCard({ name, streak, manager }: { name: string; streak: number; manager: string }) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: '8px', 
      padding: '6px 10px',
      backgroundColor: '#fef3c7',
      borderRadius: '8px',
      border: '1px solid #fcd34d',
    }}>
      <Flame size={16} color="#F36C21" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        <div style={{ fontSize: '8px', color: '#a16207' }}>{manager}</div>
      </div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#b45309', fontFamily: 'monospace' }}>{streak}d</div>
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
          <Trophy size={48} style={{ marginBottom: '16px' }} />
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
  const topRegions = regionLeaderboard.slice(0, 8);
  const topManagers = managerLeaderboard.slice(0, 8);
  const topReps = repLeaderboard.slice(0, 8);

  const goldCount = repLeaderboard.filter(r => r.badge.type === 'gold').length;
  const silverCount = repLeaderboard.filter(r => r.badge.type === 'silver').length;
  const bronzeCount = repLeaderboard.filter(r => r.badge.type === 'bronze').length;
  
  const topStreaks = [...repLeaderboard].filter(r => r.streak > 0).sort((a, b) => b.streak - a.streak).slice(0, 4);

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
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => navigate("/")} data-testid="back-button" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}>
            <ArrowLeft size={16} />
          </button>
          <img src={meridianLogo} alt="Meridian" style={{ height: '24px', objectFit: 'contain' }} />
          <div style={{ height: '16px', width: '1px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ backgroundColor: '#F36C21', borderRadius: '4px', padding: '3px', display: 'flex' }}>
              <Wrench size={12} color="white" />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700 }}>StockFix</span>
            <Sparkles size={10} color="#FFD700" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '3px 10px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
            <Zap size={10} color="#FFD700" />
            <span style={{ fontWeight: 600 }}>LIVE</span>
          </div>
          {data.weekEndingDate && (
            <div style={{ fontSize: '10px', opacity: 0.8 }}>Week: {data.weekEndingDate}</div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, padding: '10px 12px', display: 'grid', gridTemplateColumns: '200px 1fr 1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '10px', minHeight: 0 }}>
        <div style={{ gridRow: 'span 2', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Performance Overview</div>
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <CircularProgress value={overall.priorityRate} color="#F36C21" size={70} label="Priority" />
              <CircularProgress value={overall.completionRate} color="#16a34a" size={70} label="Overall" />
            </div>
            <div style={{ fontSize: '10px', color: '#003B71', fontWeight: 600 }}>
              {overall.priorityCompleted}/{overall.priorityTotal} priority • {overall.totalCompleted}/{overall.totalTasks} total
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <StatBox icon={<Users size={14} />} value={overall.totalReps} label="Reps" color="#003B71" />
            <StatBox icon={<Award size={14} />} value={overall.totalManagers} label="Managers" color="#6366f1" />
            <StatBox icon={<MapPin size={14} />} value={overall.totalRegions} label="Regions" color="#0891b2" />
            <StatBox icon={<Target size={14} />} value={overall.totalTasks} label="Tasks" color="#F36C21" />
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Trophy size={12} color="#FFD700" /> Badge Count
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <BadgeCard emoji="🥇" count={goldCount} label="Gold" color="#FFD700" />
              <BadgeCard emoji="🥈" count={silverCount} label="Silver" color="#C0C0C0" />
              <BadgeCard emoji="🥉" count={bronzeCount} label="Bronze" color="#CD7F32" />
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flex: 1 }}>
            <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Flame size={12} color="#F36C21" /> Top Streaks 🔥
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {topStreaks.length > 0 ? topStreaks.map((rep, idx) => (
                <TopStreakCard key={idx} name={rep.repName} streak={rep.streak} manager={rep.lineManager} />
              )) : (
                <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', padding: '10px' }}>No active streaks</div>
              )}
            </div>
          </div>
        </div>

        <LeaderboardPanel title="Regions" emoji="🌍" icon={<TrendingUp size={14} />}>
          {topRegions.map((r, idx) => (
            <LeaderRow 
              key={r.region} 
              rank={idx + 1} 
              name={r.region} 
              rate={r.priorityRate} 
              subtitle={`${r.repCount} reps`}
              tasks={`${r.priorityCompleted}/${r.priorityTasks}`}
            />
          ))}
        </LeaderboardPanel>

        <LeaderboardPanel title="Managers" emoji="👔" icon={<Award size={14} />}>
          {topManagers.map((m, idx) => (
            <LeaderRow 
              key={m.manager} 
              rank={idx + 1} 
              name={m.manager} 
              rate={m.priorityRate} 
              subtitle={m.region}
              tasks={`${m.priorityCompleted}/${m.priorityTasks}`}
            />
          ))}
        </LeaderboardPanel>

        <LeaderboardPanel title="Reps" emoji="🏆" icon={<Trophy size={14} />}>
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

        <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          <LeaderboardPanel title="Bottom Regions" emoji="📉" icon={<Target size={14} />}>
            {[...regionLeaderboard].reverse().slice(0, 5).map((r, idx) => (
              <LeaderRow 
                key={r.region} 
                rank={regionLeaderboard.length - idx} 
                name={r.region} 
                rate={r.priorityRate} 
                subtitle={`${r.repCount} reps`}
              />
            ))}
          </LeaderboardPanel>

          <LeaderboardPanel title="Bottom Managers" emoji="📊" icon={<Target size={14} />}>
            {[...managerLeaderboard].reverse().slice(0, 5).map((m, idx) => (
              <LeaderRow 
                key={m.manager} 
                rank={managerLeaderboard.length - idx} 
                name={m.manager} 
                rate={m.priorityRate} 
                subtitle={m.region}
              />
            ))}
          </LeaderboardPanel>

          <LeaderboardPanel title="Needs Attention" emoji="⚠️" icon={<Target size={14} />}>
            {[...repLeaderboard].reverse().slice(0, 5).map((rep, idx) => (
              <LeaderRow 
                key={rep.repName} 
                rank={repLeaderboard.length - idx} 
                name={rep.repName} 
                rate={rep.priorityCompletionRate} 
                subtitle={rep.lineManager}
              />
            ))}
          </LeaderboardPanel>
        </div>
      </div>
    </div>
  );
}
