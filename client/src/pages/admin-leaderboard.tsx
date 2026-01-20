import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Users, Trophy, Flame, Target, Wrench, Sparkles, Zap } from "lucide-react";
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

function getBadgeEmoji(type: string): string {
  if (type === 'gold') return '🥇';
  if (type === 'silver') return '🥈';
  if (type === 'bronze') return '🥉';
  return '';
}

function PodiumCard({ rank, name, rate, subtitle }: { rank: number; name: string; rate: number; subtitle?: string }) {
  const heights = { 1: '90px', 2: '70px', 3: '55px' };
  const colors = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
  const emojis = { 1: '🥇', 2: '🥈', 3: '🥉' };
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#003B71', marginBottom: '4px', textAlign: 'center', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </div>
      <div style={{ 
        height: heights[rank as keyof typeof heights], 
        width: '100%', 
        maxWidth: '60px',
        background: `linear-gradient(180deg, ${colors[rank as keyof typeof colors]} 0%, ${colors[rank as keyof typeof colors]}88 100%)`,
        borderRadius: '8px 8px 0 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: '8px',
      }}>
        <span style={{ fontSize: '20px' }}>{emojis[rank as keyof typeof emojis]}</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{rate}%</span>
      </div>
      {subtitle && <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '2px' }}>{subtitle}</div>}
    </div>
  );
}

function LeaderRow({ rank, name, rate, badge, streak }: { rank: number; name: string; rate: number; badge?: string; streak?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', backgroundColor: rank % 2 === 0 ? '#f9fafb' : 'white', borderRadius: '4px', gap: '8px' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: '#F36C21', width: '16px' }}>{rank}</span>
      <span style={{ fontSize: '11px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151' }}>{name}</span>
      <div style={{ width: '50px', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(rate, 100)}%`, height: '100%', backgroundColor: getRateColor(rate), borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 600, color: getRateColor(rate), fontFamily: 'monospace', width: '32px', textAlign: 'right' }}>{rate}%</span>
      {badge && <span style={{ fontSize: '12px' }}>{badge}</span>}
      {streak !== undefined && streak > 0 && <span style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '1px' }}><Flame size={10} color="#F36C21" />{streak}</span>}
    </div>
  );
}

function KPICard({ value, label, icon, color }: { value: string | number; label: string; icon: React.ReactNode; color: string }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '8px', 
      padding: '10px 12px', 
      display: 'flex', 
      alignItems: 'center', 
      gap: '10px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ color }}>{icon}</div>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '9px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      </div>
    </div>
  );
}

function LeaderboardCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '12px', 
      padding: '12px', 
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', borderBottom: '2px solid #003B71', paddingBottom: '6px' }}>
        <div style={{ color: '#003B71' }}>{icon}</div>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#003B71', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
      </div>
      {children}
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
      <div style={{ height: '100vh', backgroundColor: '#003B71', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <div style={{ textAlign: 'center' }}>
          <Trophy size={48} style={{ marginBottom: '16px', opacity: 0.8 }} />
          <div>Loading Leaderboard...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ height: '100vh', backgroundColor: '#003B71', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <div>Failed to load leaderboard</div>
      </div>
    );
  }

  const { overall, regionLeaderboard, managerLeaderboard, repLeaderboard } = data;
  const topRegions = regionLeaderboard.slice(0, 5);
  const topManagers = managerLeaderboard.slice(0, 5);
  const topReps = repLeaderboard.slice(0, 5);

  return (
    <div style={{ 
      height: '100vh', 
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f3f4f6',
    }}>
      <div style={{ 
        background: 'linear-gradient(135deg, #003B71 0%, #002855 50%, #001a3d 100%)',
        color: 'white', 
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => navigate("/")} data-testid="back-button" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: '4px' }}>
            <ArrowLeft size={20} />
          </button>
          <img src={meridianLogo} alt="Meridian" style={{ height: '32px', objectFit: 'contain' }} />
          <div style={{ height: '24px', width: '1px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              backgroundColor: '#F36C21', 
              borderRadius: '8px', 
              padding: '6px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(243,108,33,0.4)',
            }}>
              <Wrench size={18} color="white" />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                StockFix <Sparkles size={14} color="#FFD700" />
              </div>
              <div style={{ fontSize: '10px', opacity: 0.8, letterSpacing: '1px' }}>LEADERBOARD</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            backgroundColor: 'rgba(255,255,255,0.1)', 
            borderRadius: '20px', 
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
          }}>
            <Zap size={14} color="#FFD700" />
            <span style={{ fontWeight: 600 }}>LIVE</span>
          </div>
          {data.weekEndingDate && (
            <div style={{ fontSize: '12px', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Target size={14} />
              Week: {data.weekEndingDate}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
        <KPICard value={`${overall.priorityRate}%`} label="Priority Rate" icon={<Target size={18} />} color="#F36C21" />
        <KPICard value={`${overall.completionRate}%`} label="Overall Rate" icon={<Trophy size={18} />} color="#16a34a" />
        <KPICard value={`${overall.priorityCompleted}/${overall.priorityTotal}`} label="Priority Done" icon={<Flame size={18} />} color="#dc2626" />
        <KPICard value={overall.totalReps} label="Reps" icon={<Users size={18} />} color="#003B71" />
        <KPICard value={overall.totalManagers} label="Managers" icon={<Users size={18} />} color="#6366f1" />
        <KPICard value={overall.totalRegions} label="Regions" icon={<MapPin size={18} />} color="#0891b2" />
      </div>

      <div style={{ flex: 1, padding: '0 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', minHeight: 0 }}>
        <LeaderboardCard title="Top Regions 🌍" icon={<MapPin size={16} />}>
          {topRegions.length >= 3 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
              <PodiumCard rank={2} name={topRegions[1].region} rate={topRegions[1].priorityRate} subtitle={`${topRegions[1].repCount} reps`} />
              <PodiumCard rank={1} name={topRegions[0].region} rate={topRegions[0].priorityRate} subtitle={`${topRegions[0].repCount} reps`} />
              <PodiumCard rank={3} name={topRegions[2].region} rate={topRegions[2].priorityRate} subtitle={`${topRegions[2].repCount} reps`} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {topRegions.slice(3).map((r, idx) => (
              <LeaderRow key={r.region} rank={idx + 4} name={r.region} rate={r.priorityRate} />
            ))}
          </div>
        </LeaderboardCard>

        <LeaderboardCard title="Top Managers 👔" icon={<Users size={16} />}>
          {topManagers.length >= 3 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
              <PodiumCard rank={2} name={topManagers[1].manager} rate={topManagers[1].priorityRate} subtitle={`${topManagers[1].repCount} reps`} />
              <PodiumCard rank={1} name={topManagers[0].manager} rate={topManagers[0].priorityRate} subtitle={`${topManagers[0].repCount} reps`} />
              <PodiumCard rank={3} name={topManagers[2].manager} rate={topManagers[2].priorityRate} subtitle={`${topManagers[2].repCount} reps`} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {topManagers.slice(3).map((m, idx) => (
              <LeaderRow key={m.manager} rank={idx + 4} name={m.manager} rate={m.priorityRate} />
            ))}
          </div>
        </LeaderboardCard>

        <LeaderboardCard title="Top Reps 🏆" icon={<Trophy size={16} />}>
          {topReps.length >= 3 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
              <PodiumCard rank={2} name={topReps[1].repName} rate={topReps[1].priorityCompletionRate} subtitle={topReps[1].lineManager} />
              <PodiumCard rank={1} name={topReps[0].repName} rate={topReps[0].priorityCompletionRate} subtitle={topReps[0].lineManager} />
              <PodiumCard rank={3} name={topReps[2].repName} rate={topReps[2].priorityCompletionRate} subtitle={topReps[2].lineManager} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {topReps.slice(3).map((rep, idx) => (
              <LeaderRow 
                key={rep.repName} 
                rank={idx + 4} 
                name={rep.repName} 
                rate={rep.priorityCompletionRate} 
                badge={getBadgeEmoji(rep.badge.type)}
                streak={rep.streak}
              />
            ))}
          </div>
        </LeaderboardCard>
      </div>
    </div>
  );
}
