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

function MiniBar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
  return (
    <div style={{ width: '100%', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min((value / max) * 100, 100)}%`, height: '100%', backgroundColor: color, borderRadius: '2px' }} />
    </div>
  );
}

function PodiumItem({ rank, name, rate, badge, streak, subtitle }: { rank: number; name: string; rate: number; badge?: string; streak?: number; subtitle?: string }) {
  const heights = { 1: '70px', 2: '55px', 3: '45px' };
  const colors = { 1: 'linear-gradient(180deg, #FFD700 0%, #FFA500 100%)', 2: 'linear-gradient(180deg, #E8E8E8 0%, #A8A8A8 100%)', 3: 'linear-gradient(180deg, #CD7F32 0%, #8B4513 100%)' };
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#003B71', textAlign: 'center', maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '2px' }}>
        {name}
      </div>
      <div style={{ 
        height: heights[rank as keyof typeof heights], 
        width: '50px',
        background: colors[rank as keyof typeof colors],
        borderRadius: '6px 6px 0 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        <span style={{ fontSize: '16px' }}>{medals[rank as keyof typeof medals]}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#003B71', fontFamily: 'monospace' }}>{rate}%</span>
        {badge && <span style={{ position: 'absolute', top: '-8px', right: '-4px', fontSize: '12px' }}>{badge}</span>}
        {streak && streak > 0 && (
          <div style={{ position: 'absolute', bottom: '-6px', display: 'flex', alignItems: 'center', gap: '1px', backgroundColor: '#fff', borderRadius: '8px', padding: '1px 4px', fontSize: '9px', color: '#F36C21', fontWeight: 600 }}>
            <Flame size={8} /> {streak}
          </div>
        )}
      </div>
      {subtitle && <div style={{ fontSize: '8px', color: '#6b7280', marginTop: '2px' }}>{subtitle}</div>}
    </div>
  );
}

function CompactRow({ rank, name, rate, badge, streak, extra }: { rank: number; name: string; rate: number; badge?: string; streak?: number; extra?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '3px 6px', backgroundColor: rank % 2 === 0 ? '#f9fafb' : 'white', borderRadius: '3px', gap: '4px', fontSize: '10px' }}>
      <span style={{ fontWeight: 700, color: '#F36C21', width: '14px' }}>{rank}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151', fontWeight: 500 }}>{name}</span>
      <div style={{ width: '40px' }}><MiniBar value={rate} color={getRateColor(rate)} /></div>
      <span style={{ fontWeight: 600, color: getRateColor(rate), fontFamily: 'monospace', width: '28px', textAlign: 'right' }}>{rate}%</span>
      {badge && <span style={{ fontSize: '10px', width: '14px' }}>{badge}</span>}
      {streak !== undefined && streak > 0 && <span style={{ display: 'flex', alignItems: 'center', fontSize: '9px', color: '#F36C21' }}><Flame size={8} />{streak}</span>}
      {extra && <span style={{ fontSize: '8px', color: '#6b7280' }}>{extra}</span>}
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
      <div style={{ height: '100vh', background: 'linear-gradient(135deg, #003B71, #001a3d)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <div style={{ textAlign: 'center' }}>
          <Trophy size={48} style={{ marginBottom: '16px' }} />
          <div>Loading Leaderboard...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ height: '100vh', background: '#003B71', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <div>Failed to load</div>
      </div>
    );
  }

  const { overall, regionLeaderboard, managerLeaderboard, repLeaderboard } = data;
  const topRegions = regionLeaderboard.slice(0, 7);
  const topManagers = managerLeaderboard.slice(0, 7);
  const topReps = repLeaderboard.slice(0, 7);
  
  const totalGold = managerLeaderboard.reduce((s, m) => s + m.goldBadges, 0);
  const totalSilver = managerLeaderboard.reduce((s, m) => s + m.silverBadges, 0);
  const totalBronze = managerLeaderboard.reduce((s, m) => s + m.bronzeBadges, 0);
  
  const streakChampions = [...repLeaderboard].sort((a, b) => b.streak - a.streak).slice(0, 3);

  return (
    <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a2e' }}>
      <div style={{ 
        background: 'linear-gradient(135deg, #003B71 0%, #002855 100%)',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '2px solid #F36C21',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate("/")} data-testid="back-button" style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
            <ArrowLeft size={18} />
          </button>
          <img src={meridianLogo} alt="Meridian" style={{ height: '28px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ backgroundColor: '#F36C21', borderRadius: '6px', padding: '4px', display: 'flex' }}>
              <Wrench size={14} color="white" />
            </div>
            <span style={{ color: 'white', fontWeight: 700, fontSize: '14px' }}>StockFix</span>
            <Sparkles size={12} color="#FFD700" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Zap size={12} color="#FFD700" />
            <span style={{ color: 'white', fontSize: '10px', fontWeight: 600 }}>LIVE</span>
          </div>
          {data.weekEndingDate && <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px' }}>Week: {data.weekEndingDate}</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '8px', padding: '8px', backgroundColor: '#003B71' }}>
        <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#F36C21', fontFamily: 'monospace' }}>{overall.priorityRate}%</div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Priority</div>
        </div>
        <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#16a34a', fontFamily: 'monospace' }}>{overall.completionRate}%</div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Overall</div>
        </div>
        <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>{overall.priorityCompleted}<span style={{ fontSize: '12px', opacity: 0.6 }}>/{overall.priorityTotal}</span></div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Tasks Done</div>
        </div>
        <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>{overall.totalReps}</div>
          <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>Reps</div>
        </div>
        
        <div style={{ backgroundColor: 'rgba(255,215,0,0.15)', borderRadius: '8px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span style={{ fontSize: '20px' }}>🥇</span>
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#FFD700', fontFamily: 'monospace' }}>{totalGold}</span>
        </div>
        <div style={{ backgroundColor: 'rgba(192,192,192,0.15)', borderRadius: '8px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span style={{ fontSize: '20px' }}>🥈</span>
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#C0C0C0', fontFamily: 'monospace' }}>{totalSilver}</span>
        </div>
        <div style={{ backgroundColor: 'rgba(205,127,50,0.15)', borderRadius: '8px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <span style={{ fontSize: '20px' }}>🥉</span>
          <span style={{ fontSize: '20px', fontWeight: 700, color: '#CD7F32', fontFamily: 'monospace' }}>{totalBronze}</span>
        </div>
        <div style={{ backgroundColor: 'rgba(243,108,33,0.2)', borderRadius: '8px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
          <Flame size={18} color="#F36C21" />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#F36C21', fontFamily: 'monospace' }}>{streakChampions[0]?.streak || 0}d</div>
            <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60px' }}>{streakChampions[0]?.repName || '-'}</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', padding: '8px', backgroundColor: '#0f0f1a', minHeight: 0 }}>
        <div style={{ backgroundColor: '#1e1e30', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <MapPin size={14} color="#F36C21" />
            <span style={{ color: 'white', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Regions 🌍</span>
            <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>{regionLeaderboard.length}</span>
          </div>
          {topRegions.length >= 3 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '4px', marginBottom: '8px' }}>
              <PodiumItem rank={2} name={topRegions[1].region} rate={topRegions[1].priorityRate} subtitle={`${topRegions[1].repCount} reps`} />
              <PodiumItem rank={1} name={topRegions[0].region} rate={topRegions[0].priorityRate} subtitle={`${topRegions[0].repCount} reps`} />
              <PodiumItem rank={3} name={topRegions[2].region} rate={topRegions[2].priorityRate} subtitle={`${topRegions[2].repCount} reps`} />
            </div>
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
            {topRegions.slice(3).map((r, idx) => (
              <CompactRow key={r.region} rank={idx + 4} name={r.region} rate={r.priorityRate} extra={`${r.repCount}r`} />
            ))}
          </div>
          <div style={{ marginTop: '6px', padding: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
            <div style={{ display: 'flex', gap: '2px', height: '20px', alignItems: 'flex-end' }}>
              {topRegions.slice(0, 7).map((r, i) => (
                <div key={i} style={{ flex: 1, backgroundColor: getRateColor(r.priorityRate), borderRadius: '2px 2px 0 0', height: `${Math.max(r.priorityRate * 0.2, 4)}px` }} title={`${r.region}: ${r.priorityRate}%`} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#1e1e30', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Users size={14} color="#F36C21" />
            <span style={{ color: 'white', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Managers 👔</span>
            <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>{managerLeaderboard.length}</span>
          </div>
          {topManagers.length >= 3 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '4px', marginBottom: '8px' }}>
              <PodiumItem rank={2} name={topManagers[1].manager} rate={topManagers[1].priorityRate} subtitle={`${topManagers[1].repCount} reps`} />
              <PodiumItem rank={1} name={topManagers[0].manager} rate={topManagers[0].priorityRate} subtitle={`${topManagers[0].repCount} reps`} />
              <PodiumItem rank={3} name={topManagers[2].manager} rate={topManagers[2].priorityRate} subtitle={`${topManagers[2].repCount} reps`} />
            </div>
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
            {topManagers.slice(3).map((m, idx) => (
              <CompactRow key={m.manager} rank={idx + 4} name={m.manager} rate={m.priorityRate} extra={m.goldBadges > 0 ? `🥇${m.goldBadges}` : m.silverBadges > 0 ? `🥈${m.silverBadges}` : ''} />
            ))}
          </div>
          <div style={{ marginTop: '6px', padding: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
            <div style={{ display: 'flex', gap: '2px', height: '20px', alignItems: 'flex-end' }}>
              {topManagers.slice(0, 7).map((m, i) => (
                <div key={i} style={{ flex: 1, backgroundColor: getRateColor(m.priorityRate), borderRadius: '2px 2px 0 0', height: `${Math.max(m.priorityRate * 0.2, 4)}px` }} title={`${m.manager}: ${m.priorityRate}%`} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: '#1e1e30', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Trophy size={14} color="#F36C21" />
            <span style={{ color: 'white', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reps 🏆</span>
            <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>{repLeaderboard.length}</span>
          </div>
          {topReps.length >= 3 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '4px', marginBottom: '8px' }}>
              <PodiumItem rank={2} name={topReps[1].repName} rate={topReps[1].priorityCompletionRate} badge={topReps[1].badge.type !== 'none' ? (topReps[1].badge.type === 'gold' ? '🥇' : topReps[1].badge.type === 'silver' ? '🥈' : '🥉') : undefined} streak={topReps[1].streak} />
              <PodiumItem rank={1} name={topReps[0].repName} rate={topReps[0].priorityCompletionRate} badge={topReps[0].badge.type !== 'none' ? (topReps[0].badge.type === 'gold' ? '🥇' : topReps[0].badge.type === 'silver' ? '🥈' : '🥉') : undefined} streak={topReps[0].streak} />
              <PodiumItem rank={3} name={topReps[2].repName} rate={topReps[2].priorityCompletionRate} badge={topReps[2].badge.type !== 'none' ? (topReps[2].badge.type === 'gold' ? '🥇' : topReps[2].badge.type === 'silver' ? '🥈' : '🥉') : undefined} streak={topReps[2].streak} />
            </div>
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
            {topReps.slice(3).map((rep, idx) => (
              <CompactRow key={rep.repName} rank={idx + 4} name={rep.repName} rate={rep.priorityCompletionRate} badge={rep.badge.type !== 'none' ? (rep.badge.type === 'gold' ? '🥇' : rep.badge.type === 'silver' ? '🥈' : '🥉') : undefined} streak={rep.streak} />
            ))}
          </div>
          <div style={{ marginTop: '6px', padding: '4px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
            <div style={{ display: 'flex', gap: '2px', height: '20px', alignItems: 'flex-end' }}>
              {topReps.slice(0, 7).map((r, i) => (
                <div key={i} style={{ flex: 1, backgroundColor: getRateColor(r.priorityCompletionRate), borderRadius: '2px 2px 0 0', height: `${Math.max(r.priorityCompletionRate * 0.2, 4)}px` }} title={`${r.repName}: ${r.priorityCompletionRate}%`} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#003B71', padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Flame size={14} color="#F36C21" />
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '10px', fontWeight: 600 }}>TOP STREAKS:</span>
            {streakChampions.map((c, i) => (
              <span key={i} style={{ color: 'white', fontSize: '10px', backgroundColor: 'rgba(243,108,33,0.3)', padding: '2px 6px', borderRadius: '8px' }}>
                {c.repName.split(' ')[0]} {c.streak}d 🔥
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Award size={12} color="#FFD700" />
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '9px' }}>Powered by StockFix Gamification Engine</span>
        </div>
      </div>
    </div>
  );
}
