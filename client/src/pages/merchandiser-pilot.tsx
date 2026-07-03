import { useState, useMemo, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, BarChart, Bar } from "recharts";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";

// ─── Types ────────────────────────────────────────────────
interface SFStore { name: string; tasks: number; completed: number; captureRate: number; clients: string[] }

interface Merchandiser {
  name: string;
  lineManager: string | null;
  region: string | null;
  overallRate: number;
  stockFix: { tasks: number; completed: number; captureRate: number; stores: SFStore[] } | null;
}

interface WeekSnapshot { weekEndingDate: string; repCount: number; totalTasks: number; totalCompleted: number; captureRate: number }
interface SFClientStat { client: string; tasks: number; completed: number; captureRate: number }
interface BannerStat { banner: string; total: number; completed: number; captureRate: number }

interface PilotReport {
  latestWeek: string | null;
  filters: { managers: string[]; regions: string[]; stores: string[]; active: { manager: string | null; region: string | null; store: string | null } };
  summary: {
    stockFix: { total: number; completed: number; captureRate: number };
    activeReps: number;
  };
  merchandisers: Merchandiser[];
  sfClientSummary: SFClientStat[];
  bannerBreakdown: BannerStat[];
  history: WeekSnapshot[];
}

type NavSection = 'overview' | 'stores' | 'managers' | 'regions' | 'reports' | 'alerts' | 'settings';

// ─── Helpers ──────────────────────────────────────────────
function tc(s: string) { return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
function rateColor(r: number) { return r >= 80 ? '#16a34a' : r >= 60 ? '#2563eb' : r >= 40 ? '#f97316' : r > 0 ? '#dc2626' : '#94a3b8'; }
function rateStatus(r: number): { label: string; color: string; bg: string } {
  if (r >= 85) return { label: 'Excellent', color: '#16a34a', bg: '#dcfce7' };
  if (r >= 70) return { label: 'Good',      color: '#2563eb', bg: '#dbeafe' };
  if (r >= 50) return { label: 'At Risk',   color: '#f97316', bg: '#ffedd5' };
  return           { label: 'Poor',        color: '#dc2626', bg: '#fee2e2' };
}
function fmtDate(d: string) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: '2-digit' });
}

// ─── SVG Ring / Donut Chart ───────────────────────────────
function RingChart({ rate, color, size = 110, strokeWidth = 11 }: { rate: number; color: string; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const filled = (Math.min(rate, 100) / 100) * circ;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" />
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────
function KpiCard({ label, value, sub, iconBg, iconColor, icon }: {
  label: string; value: string | number; sub?: string;
  iconBg: string; iconColor?: string; icon: React.ReactNode;
}) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '13px 14px 12px', boxShadow: '0 2px 8px rgba(15,31,61,0.08)', border: '1px solid #e8edf4', borderTop: `3px solid ${iconColor || '#cbd5e1'}`, display: 'flex', alignItems: 'flex-start', gap: '11px', height: '100%', boxSizing: 'border-box' as const }}>
      <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: iconBg, color: iconColor || '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: '4px', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{value}</div>
        {sub && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Mini progress bar (light theme) ──────────────────────
function MiniBar({ rate, color }: { rate: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ width: '80px', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${Math.min(rate, 100)}%`, height: '100%', backgroundColor: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '36px' }}>{rate}%</span>
    </div>
  );
}

// ─── KPI & Dashboard SVG Icons ────────────────────────────
const Svg = {
  tasks:    () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>,
  check:    () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>,
  open:     () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  rate:     () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
  brand:    () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>,
  store:    () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  alert:    () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  users:    () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
};

// ─── Sidebar SVG Icons ────────────────────────────────────
const Icons: Record<string, ReactElement> = {
  overview: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  ),
  stores: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  managers: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  regions: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  reports: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  alerts: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
};

type NavGroup = { label?: string; items: { key: NavSection; label: string }[] };

const NAV_GROUPS: NavGroup[] = [
  { label: 'DASHBOARDS', items: [
    { key: 'overview',  label: 'Overview'  },
    { key: 'stores',    label: 'Stores'    },
  ]},
  { label: 'ANALYTICS', items: [
    { key: 'managers',  label: 'Managers'  },
    { key: 'regions',   label: 'Regions'   },
    { key: 'reports',   label: 'Reports'   },
    { key: 'alerts',    label: 'Alerts'    },
  ]},
];

function NavBtn({ item, active, onNav }: { item: { key: NavSection; label: string }; active: boolean; onNav: (s: NavSection) => void }) {
  return (
    <button
      data-testid={`nav-${item.key}`}
      onClick={() => onNav(item.key)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
        padding: '9px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
        marginBottom: '2px',
        backgroundColor: active ? '#2563eb' : 'transparent',
        color: active ? '#ffffff' : 'rgba(255,255,255,0.5)',
        fontSize: '13px', fontWeight: active ? 600 : 400,
        textAlign: 'left' as const, transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
      onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.5)'; } }}
    >
      <span style={{ width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: active ? 1 : 0.7 }}>
        {Icons[item.key]}
      </span>
      {item.label}
    </button>
  );
}

function Sidebar({ active, onNav }: { active: NavSection; onNav: (s: NavSection) => void }) {
  return (
    <div style={{ width: '210px', flexShrink: 0, backgroundColor: '#0f1f3d', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0 }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px' }}>
        <img src={meridianGroupLogo} alt="Meridian" style={{ height: '26px', objectFit: 'contain' }} />
      </div>

      {/* Nav groups */}
      <nav style={{ padding: '0 8px', flex: 1, overflowY: 'auto' }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} style={{ marginBottom: '4px' }}>
            {gi > 0 && <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.07)', margin: '8px 4px 10px' }} />}
            {group.label && (
              <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', padding: '0 12px 5px', textTransform: 'uppercase' as const }}>
                {group.label}
              </div>
            )}
            {group.items.map(item => (
              <NavBtn key={item.key} item={item} active={active === item.key} onNav={onNav} />
            ))}
          </div>
        ))}
      </nav>

      {/* Settings */}
      <div style={{ padding: '0 8px' }}>
        <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.07)', margin: '0 4px 8px' }} />
        <NavBtn item={{ key: 'settings', label: 'Settings' }} active={active === 'settings'} onNav={onNav} />
      </div>

      {/* User footer */}
      <div style={{ padding: '10px 14px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
        <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>M</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Meridian</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Admin</div>
        </div>
      </div>
    </div>
  );
}

// ─── Top Filter Bar ───────────────────────────────────────
function FilterBar({ filters, filterManager, filterRegion, filterStore, setFilterManager, setFilterRegion, setFilterStore }: {
  filters: PilotReport['filters'];
  filterManager: string; filterRegion: string; filterStore: string;
  setFilterManager: (v: string) => void; setFilterRegion: (v: string) => void; setFilterStore: (v: string) => void;
}) {
  const sel: React.CSSProperties = { padding: '5px 26px 5px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', color: '#1e293b', backgroundColor: '#fff', cursor: 'pointer', appearance: 'none' as any, backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%2394a3b8\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', minWidth: '130px' };
  const lbl: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', fontWeight: 500 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <label style={lbl}>Manager
        <select value={filterManager} onChange={e => setFilterManager(e.target.value)} style={sel} data-testid="filter-manager">
          <option value="">All Managers</option>
          {filters.managers.map(m => <option key={m} value={m}>{tc(m)}</option>)}
        </select>
      </label>
      <label style={lbl}>Region
        <select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} style={sel} data-testid="filter-region">
          <option value="">All Regions</option>
          {filters.regions.map(r => <option key={r} value={r}>{tc(r)}</option>)}
        </select>
      </label>
      <label style={lbl}>Store
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={{ ...sel, minWidth: '160px' }} data-testid="filter-store">
          <option value="">All Stores</option>
          {filters.stores.map(s => <option key={s} value={s}>{tc(s)}</option>)}
        </select>
      </label>
    </div>
  );
}

// ─── Overview Dashboard (StockFix) ─────────────────────────
function OverviewDashboard({ data, recentActivity }: { data: PilotReport; recentActivity: any[] }) {
  const { summary, merchandisers, sfClientSummary, history } = data;
  const sf = summary.stockFix;
  const total = sf.total;
  const completed = sf.completed;
  const open = Math.max(0, total - completed);
  const totalPilotReps = merchandisers.length;

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    backgroundColor: '#fff', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(15,31,61,0.06)', border: '1px solid #e8edf4', overflow: 'hidden',
    boxSizing: 'border-box' as const, ...extra,
  });

  const donutData = [
    { name: 'Resolved', value: completed, fill: '#16a34a' },
    { name: 'Open',     value: open,      fill: '#f97316' },
  ].filter(d => d.value > 0);

  const openByStore = useMemo(() => {
    const map = new Map<string, { store: string; manager: string; sfTasks: number; sfDone: number }>();
    merchandisers.forEach(m => {
      const mgr = m.lineManager ? tc(m.lineManager) : '—';
      (m.stockFix?.stores || []).forEach(s => {
        if (!map.has(s.name)) map.set(s.name, { store: tc(s.name), manager: mgr, sfTasks: 0, sfDone: 0 });
        const st = map.get(s.name)!;
        st.sfTasks += s.tasks; st.sfDone += s.completed;
      });
    });
    return [...map.values()]
      .filter(s => s.sfTasks > 0)
      .map(s => ({ ...s, open: s.sfTasks - s.sfDone, rate: s.sfTasks > 0 ? Math.round((s.sfDone / s.sfTasks) * 100) : 0 }))
      .sort((a, b) => b.open - a.open);
  }, [merchandisers]);

  const topClient = sfClientSummary?.[0]?.client ?? '—';
  const pilotCoverage = totalPilotReps > 0 ? Math.round((summary.activeReps / totalPilotReps) * 100) : 0;

  const chartData = history.slice().reverse().map(h => ({
    week: h.weekEndingDate.slice(5), 'Capture Rate %': h.captureRate, fullDate: h.weekEndingDate,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '10px' }}>

      {/* ── KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '10px', flexShrink: 0, height: '84px' }}>
        <KpiCard label="Active Reps"     value={summary.activeReps}          sub={`of ${totalPilotReps} pilot reps`}      iconBg="#eff6ff" iconColor="#2563eb" icon={<Svg.users />} />
        <KpiCard label="Tasks Logged"    value={total.toLocaleString()}      sub="total SF tasks"         iconBg="#fff7ed" iconColor="#f97316" icon={<Svg.tasks />} />
        <KpiCard label="Completed"       value={completed.toLocaleString()}   sub={`${sf.captureRate}% rate`} iconBg="#dcfce7" iconColor="#16a34a" icon={<Svg.check />} />
        <KpiCard label="Open Issues"     value={open.toLocaleString()}        sub="pending resolution"     iconBg="#fee2e2" iconColor="#dc2626" icon={<Svg.open />} />
        <KpiCard label="Pilot Coverage"  value={`${pilotCoverage}%`}         sub={`${summary.activeReps} of ${totalPilotReps} active`} iconBg="#fef9c3" iconColor="#d97706" icon={<Svg.rate />} />
        <KpiCard label="Top Brand"       value={topClient.length > 10 ? topClient.slice(0,10)+'…' : topClient} sub={sfClientSummary?.[0] ? `${sfClientSummary[0].tasks} tasks` : '—'} iconBg="#ede9fe" iconColor="#7c3aed" icon={<Svg.brand />} />
      </div>

      {/* ── Charts Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr 240px', gap: '10px', flexShrink: 0, height: '220px' }}>

        {/* Resolution Donut */}
        <div style={{ ...card(), display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f4f8', fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.07em', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: '#F36C21', flexShrink: 0 }} />Resolution Performance</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '8px 14px' }}>
            <div style={{ position: 'relative', width: '120px', height: '120px', flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} innerRadius={42} outerRadius={58} dataKey="value" paddingAngle={2}>
                    {donutData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: rateColor(sf.captureRate) }}>{sf.captureRate}%</div>
                <div style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' as const }}>Resolved</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {donutData.map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: d.fill, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>{d.value.toLocaleString()}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{d.name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Capture Over Time */}
        <div style={{ ...card(), display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f4f8', fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.07em', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: '#003B71', flexShrink: 0 }} />
            Capture Over Time
            <span style={{ fontSize: '10px', fontWeight: 400, color: '#94a3b8' }}>({history.length} wk{history.length !== 1 ? 's' : ''})</span>
          </div>
          {chartData.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '12px', textAlign: 'center' as const }}>
              Building history — new data point saved each week
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, padding: '4px 8px 6px 0' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} unit="%" />
                  <Tooltip formatter={(v: any) => `${v}%`} labelFormatter={(_: any, p: any) => p?.[0]?.payload?.fullDate || ''} contentStyle={{ fontSize: '11px', padding: '4px 8px' }} />
                  <Line type="monotone" dataKey="Capture Rate %" stroke="#F36C21" strokeWidth={2} dot={{ r: 4, fill: '#F36C21' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Issues by Brand/Client */}
        <div style={{ ...card(), display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f4f8', fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.07em', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: '#F36C21', flexShrink: 0 }} />Issues by Brand / Client</div>
          <div style={{ flex: 1, minHeight: 0, padding: '8px 14px 6px' }}>
            {sfClientSummary && sfClientSummary.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sfClientSummary.slice(0, 6)} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 4 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="client" tick={{ fontSize: 11, fill: '#475569' }} width={82} />
                  <Tooltip formatter={(v: any) => [v, 'Tasks']} contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="tasks" fill="#f97316" radius={[0, 3, 3, 0]} barSize={13} label={{ position: 'right', fontSize: 11, fill: '#94a3b8', formatter: (v: any) => v }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '12px' }}>No brand data available</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Row ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 270px', gap: '10px' }}>

        {/* Open Issues by Store */}
        <div style={{ ...card(), display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: '#F36C21', flexShrink: 0 }} />Open Issues by Store</span>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>{openByStore.filter(s => s.open > 0).length} stores with open tasks</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px 70px 65px 75px', padding: '7px 14px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
            {['Store','Manager','Tasks','Done','Open','Rate'].map(h => (
              <div key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{h}</div>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {openByStore.length === 0
              ? <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No store data available.</div>
              : openByStore.slice(0, 12).map((s, i) => {
                  const st = rateStatus(s.rate);
                  return (
                    <div key={s.store} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 70px 70px 65px 75px', padding: '9px 14px', borderBottom: i < openByStore.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center' }}>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.store}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.manager}</div>
                      <div style={{ fontSize: '12px', color: '#475569', fontWeight: 500 }}>{s.sfTasks}</div>
                      <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>{s.sfDone}</div>
                      <div style={{ fontSize: '12px', color: s.open > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{s.open}</div>
                      <div><span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', backgroundColor: st.bg, color: st.color }}>{s.rate}%</span></div>
                    </div>
                  );
                })}
          </div>
        </div>

        {/* Latest Submissions */}
        <div style={{ ...card(), display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f4f8', fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.07em', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: '#F36C21', flexShrink: 0 }} />Latest Submissions</div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {(recentActivity || []).length === 0
              ? <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>No recent activity.</div>
              : recentActivity.slice(0, 8).map((a: any, i: number) => {
                  const isDone = (a.actionStatus || a.action_status || '').toLowerCase() === 'completed';
                  return (
                    <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', backgroundColor: isDone ? '#dcfce7' : '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                        {isDone
                          ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                          : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
                        }
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{tc(a.repName || a.rep_name || '')} · {tc(a.storeName || a.store_name || '')}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{a.client || a.action || 'Task update'}</div>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>{(a.actionDate || a.action_date) ? fmtDate(a.actionDate || a.action_date) : ''}</div>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '8px', backgroundColor: isDone ? '#dcfce7' : '#fff7ed', color: isDone ? '#16a34a' : '#f97316', flexShrink: 0 }}>
                        {isDone ? 'Done' : 'Open'}
                      </span>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Store Detail Panel ────────────────────────────────────
interface StoreDetailProp {
  name: string; manager: string; region: string;
  sfTasks: number; sfDone: number; sfOpen: number; sfRate: number;
  overallRate: number;
  status: { label: string; color: string; bg: string };
}

function StoreDetailPanel({ storeName, storeData, data, onBack }: {
  storeName: string;
  storeData: StoreDetailProp | null;
  data: PilotReport;
  onBack: () => void;
}) {
  const { merchandisers } = data;
  const storeNameUpper = storeName.toUpperCase();

  const repsAtStore = merchandisers.filter(m =>
    (m.stockFix?.stores || []).some(s => s.name === storeNameUpper)
  );

  const sfEntries = repsAtStore.flatMap(m => {
    const store = m.stockFix?.stores.find(s => s.name === storeNameUpper);
    if (!store) return [];
    return [{ rep: tc(m.name), tasks: store.tasks, completed: store.completed, captureRate: store.captureRate, clients: store.clients }];
  });

  const sfTotal    = sfEntries.reduce((s, e) => s + e.tasks, 0);
  const sfDone     = sfEntries.reduce((s, e) => s + e.completed, 0);
  const sfOpen     = Math.max(0, sfTotal - sfDone);
  const sfRate     = sfTotal > 0 ? Math.round((sfDone / sfTotal) * 100) : 0;

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    backgroundColor: '#fff', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(15,31,61,0.06)', border: '1px solid #e8edf4', overflow: 'hidden',
    boxSizing: 'border-box' as const, ...extra,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '10px' }}>

      {/* Breadcrumb */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', height: '28px' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '12px', padding: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Stores
        </button>
        <span style={{ color: '#cbd5e1' }}>/</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>{storeName}</span>
      </div>

      {/* Store Info + KPIs */}
      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: '260px 1fr', gap: '10px', height: '110px' }}>
        <div style={{ ...card(), padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '8px', backgroundColor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{storeName}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>{storeData?.manager || '—'}{storeData?.region ? ` · ${storeData.region}` : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', backgroundColor: storeData?.status.bg || '#f1f5f9', color: storeData?.status.color || '#64748b', fontWeight: 700 }}>{storeData?.status.label || 'Unknown'}</span>
            <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', backgroundColor: '#fff7ed', color: '#f97316', fontWeight: 600 }}>Pilot Active</span>
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>{repsAtStore.length} rep{repsAtStore.length !== 1 ? 's' : ''} assigned</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
          <KpiCard label="SF Tasks"     value={sfTotal.toLocaleString()}               sub="total logged"        iconBg="#fff7ed" iconColor="#f97316" icon={<Svg.tasks />} />
          <KpiCard label="SF Resolved"  value={sfDone.toLocaleString()}                sub={`${sfRate}% rate`}   iconBg="#dcfce7" iconColor="#16a34a" icon={<Svg.check />} />
          <KpiCard label="Open Issues"  value={sfOpen.toLocaleString()}                sub="pending"             iconBg="#fee2e2" iconColor="#dc2626" icon={<Svg.open />} />
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 270px', gap: '10px' }}>

        {/* SF Detail */}
        <div style={{ ...card(), display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', fontWeight: 700, color: '#f97316', flexShrink: 0 }}>Stock Fix — Task & Resolution</div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {sfEntries.length === 0
              ? <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>No Stock Fix tasks at this store.</div>
              : <>
                  <div style={{ display: 'flex', gap: '14px', padding: '10px 14px', borderBottom: '1px solid #f8fafc', alignItems: 'center' }}>
                    <div style={{ position: 'relative', width: '66px', height: '66px', flexShrink: 0 }}>
                      <RingChart rate={sfRate} color="#f97316" size={66} strokeWidth={7} />
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#f97316' }}>{sfRate}%</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.6 }}>
                      <div>{sfDone} completed / {sfTotal} tasks</div>
                      <div>Open: <span style={{ fontWeight: 700, color: sfOpen > 0 ? '#dc2626' : '#16a34a' }}>{sfOpen}</span></div>
                      <div>{sfEntries.length} rep(s) with SF tasks</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 55px 55px 60px', padding: '6px 14px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    {['Rep','Tasks','Done','Rate'].map(h => <div key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</div>)}
                  </div>
                  {sfEntries.map((e, i) => (
                    <div key={i} style={{ padding: '8px 14px', borderBottom: '1px solid #f8fafc' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 55px 55px 60px', alignItems: 'center' }}>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: '#1e293b' }}>{e.rep}</div>
                        <div style={{ fontSize: '12px', color: '#f97316', fontWeight: 600 }}>{e.tasks}</div>
                        <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>{e.completed}</div>
                        <div><span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '8px', backgroundColor: rateStatus(e.captureRate).bg, color: rateStatus(e.captureRate).color }}>{e.captureRate}%</span></div>
                      </div>
                      {e.clients.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '4px', marginTop: '5px' }}>
                          {e.clients.map((c, j) => <span key={j} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '6px', backgroundColor: '#fff7ed', color: '#f97316', border: '1px solid #fed7aa' }}>{c}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </>
            }
          </div>
        </div>

        {/* Action Summary */}
        <div style={{ ...card(), display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', fontWeight: 700, color: '#1e293b', flexShrink: 0 }}>Store Action Summary</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {[
              sfOpen > 0           && { icon: 'alert', color: '#dc2626', bg: '#fee2e2', text: `Resolve ${sfOpen} open Stock Fix issue${sfOpen !== 1 ? 's' : ''}` },
              sfRate >= 80         && { icon: 'check', color: '#16a34a', bg: '#dcfce7', text: `SF resolution rate is strong at ${sfRate}%` },
              sfTotal === 0        && { icon: 'alert', color: '#f97316', bg: '#fff7ed', text: 'No Stock Fix activity logged yet' },
              sfOpen === 0 && sfTotal > 0 && { icon: 'check', color: '#16a34a', bg: '#dcfce7', text: 'All tasks resolved. Keep up the good work.' },
            ].filter(Boolean).map((a: any, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', padding: '7px 9px', borderRadius: '7px', backgroundColor: a.bg }}>
                <div style={{ color: a.color, marginTop: '1px', flexShrink: 0 }}>
                  {a.icon === 'alert' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                  {a.icon === 'check' && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <span style={{ fontSize: '11px', color: a.color, fontWeight: 500, lineHeight: 1.4 }}>{a.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stores Dashboard ─────────────────────────────────────
function StoresDashboard({ data }: { data: PilotReport }) {
  const { merchandisers } = data;
  const [selStore, setSelStore] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 8;

  const storePerf = useMemo((): StoreDetailProp[] => {
    const map = new Map<string, { name: string; manager: string; region: string; sfTasks: number; sfDone: number }>();
    merchandisers.forEach(m => {
      const mgr = m.lineManager ? tc(m.lineManager) : '';
      const reg = m.region ? tc(m.region) : '';
      (m.stockFix?.stores || []).forEach(s => {
        if (!map.has(s.name)) map.set(s.name, { name: s.name, manager: mgr, region: reg, sfTasks: 0, sfDone: 0 });
        const st = map.get(s.name)!;
        st.sfTasks += s.tasks; st.sfDone += s.completed;
        if (!st.manager && mgr) st.manager = mgr;
        if (!st.region && reg) st.region = reg;
      });
    });
    return [...map.values()].map(s => {
      const sfRate = s.sfTasks > 0 ? Math.round((s.sfDone / s.sfTasks) * 100) : 0;
      return {
        name: tc(s.name), manager: s.manager, region: s.region,
        sfTasks: s.sfTasks, sfDone: s.sfDone, sfOpen: s.sfTasks - s.sfDone, sfRate,
        overallRate: sfRate, status: rateStatus(sfRate),
      };
    }).filter(s => s.sfTasks > 0)
      .sort((a, b) => b.overallRate - a.overallRate);
  }, [merchandisers]);

  if (selStore) {
    const storeData = storePerf.find(s => s.name === selStore);
    return <StoreDetailPanel storeName={selStore} storeData={storeData || null} data={data} onBack={() => setSelStore(null)} />;
  }

  const visited    = storePerf.filter(s => s.sfDone > 0).length;
  const notVisited = storePerf.filter(s => s.sfDone === 0).length;
  const sfIssues   = storePerf.reduce((s, x) => s + x.sfTasks, 0);
  const atRisk     = storePerf.filter(s => s.overallRate > 0 && s.overallRate < 70).length;

  const statusGroups = [
    { name: 'Excellent', count: storePerf.filter(s => s.overallRate >= 85).length, fill: '#16a34a' },
    { name: 'Good',      count: storePerf.filter(s => s.overallRate >= 70 && s.overallRate < 85).length, fill: '#2563eb' },
    { name: 'At Risk',   count: storePerf.filter(s => s.overallRate >= 50 && s.overallRate < 70).length, fill: '#f97316' },
    { name: 'Poor',      count: storePerf.filter(s => s.overallRate > 0 && s.overallRate < 50).length, fill: '#dc2626' },
    { name: 'No Data',   count: storePerf.filter(s => s.overallRate === 0).length, fill: '#94a3b8' },
  ].filter(s => s.count > 0);

  const topStoreChart = storePerf.filter(s => s.sfRate > 0).slice(0, 6).map(s => ({
    name: s.name.length > 13 ? s.name.slice(0, 13) + '…' : s.name,
    sfRate: s.sfRate,
  }));

  const needsAttention = [...storePerf].sort((a,b) => a.overallRate - b.overallRate).filter(s => s.overallRate < 70).slice(0, 4);

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    backgroundColor: '#fff', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(15,31,61,0.06)', border: '1px solid #e8edf4', overflow: 'hidden',
    boxSizing: 'border-box' as const, ...extra,
  });

  const totalPages  = Math.ceil(storePerf.length / PAGE_SIZE);
  const pageStores  = storePerf.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '10px' }}>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', flexShrink: 0, height: '84px' }}>
        <KpiCard label="Pilot Stores"      value={storePerf.length}           sub="total stores"        iconBg="#fff7ed" iconColor="#f97316" icon={<Svg.store />} />
        <KpiCard label="Stores Visited"    value={visited}                    sub="with activity"       iconBg="#dcfce7" iconColor="#16a34a" icon={<Svg.check />} />
        <KpiCard label="Not Visited"       value={notVisited}                 sub="no activity logged"  iconBg="#fee2e2" iconColor="#dc2626" icon={<Svg.open />} />
        <KpiCard label="SF Issues Logged"  value={sfIssues.toLocaleString()}  sub="total SF tasks"      iconBg="#fff7ed" iconColor="#f97316" icon={<Svg.tasks />} />
        <KpiCard label="Stores At Risk"    value={atRisk}                     sub="below 70% rate"      iconBg="#fee2e2" iconColor="#dc2626" icon={<Svg.alert />} />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px 230px', gap: '10px', flexShrink: 0, height: '200px' }}>

        {/* Store Performance Bar */}
        <div style={{ ...card(), display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f4f8', fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.07em', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: '#f97316', flexShrink: 0 }} />Store Performance — Top by Resolution</div>
          <div style={{ flex: 1, minHeight: 0, padding: '6px 10px 6px 6px' }}>
            {topStoreChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topStoreChart} layout="vertical" margin={{ top: 0, right: 44, bottom: 0, left: 6 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} width={84} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Bar dataKey="sfRate"  name="SF Rate %"       fill="#f97316" radius={[0, 3, 3, 0]} barSize={12} label={{ position: 'right', fontSize: 10, fill: '#94a3b8', formatter: (v: any) => v > 0 ? `${v}%` : '' }} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '12px' }}>No store data</div>}
          </div>
        </div>

        {/* Status Donut */}
        <div style={{ ...card(), display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f4f8', fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.07em', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: '#475569', flexShrink: 0 }} />Status Breakdown</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px' }}>
            <div style={{ width: '96px', height: '96px', flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusGroups.map(s => ({ name: s.name, value: s.count, fill: s.fill }))} innerRadius={30} outerRadius={46} dataKey="value" paddingAngle={2}>
                    {statusGroups.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {statusGroups.map(s => (
                <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: s.fill, flexShrink: 0 }} />
                  <span style={{ fontSize: '10px', color: '#64748b' }}>{s.name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b', marginLeft: '4px' }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Needs Attention */}
        <div style={{ ...card(), display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f4f8', fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.07em', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '7px' }}><span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: '#dc2626', flexShrink: 0 }} />Requiring Attention</div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {needsAttention.length === 0
              ? <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>All stores performing well</div>
              : needsAttention.map((s, i) => (
                  <div key={i} style={{ padding: '9px 14px', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setSelStore(s.name)}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '135px' }}>{s.name}</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                        {s.sfOpen > 0 ? `${s.sfOpen} open SF` : 'No open issues'}
                      </div>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', backgroundColor: s.status.bg, color: s.status.color, flexShrink: 0 }}>{s.overallRate}%</span>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      {/* Store Table */}
      <div style={{ flex: 1, minHeight: 0, ...card(), display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 130px 100px 90px 78px 90px 82px', padding: '8px 14px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          {['Store','Manager','Region','SF Issues','Open','SF Rate','Status'].map(h => (
            <div key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{h}</div>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {pageStores.map((s: any, i) => (
            <div key={s.name} onClick={() => setSelStore(s.name)} style={{ display: 'grid', gridTemplateColumns: '1.6fr 130px 100px 90px 78px 90px 82px', padding: '9px 14px', borderBottom: i < pageStores.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#fff'}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.name}</div>
              <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.manager || '—'}</div>
              <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.region || '—'}</div>
              <div style={{ fontSize: '12px', color: '#f97316', fontWeight: 500 }}>{s.sfTasks}</div>
              <div style={{ fontSize: '12px', color: s.sfOpen > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{s.sfOpen}</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: s.sfTasks > 0 ? rateColor(s.sfRate) : '#cbd5e1' }}>{s.sfTasks > 0 ? `${s.sfRate}%` : '—'}</div>
              <div><span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '10px', backgroundColor: s.status.bg, color: s.status.color }}>{s.status.label}</span></div>
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div style={{ flexShrink: 0, padding: '8px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, storePerf.length)} of {storePerf.length} stores</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} style={{ padding: '3px 10px', fontSize: '11px', borderRadius: '5px', border: '1px solid #e2e8f0', cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#cbd5e1' : '#475569', background: '#fff' }}>Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page === totalPages-1} style={{ padding: '3px 10px', fontSize: '11px', borderRadius: '5px', border: '1px solid #e2e8f0', cursor: page === totalPages-1 ? 'default' : 'pointer', color: page === totalPages-1 ? '#cbd5e1' : '#475569', background: '#fff' }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Managers View ────────────────────────────────────────
function ManagersView({ data, onSelectRep }: { data: PilotReport; onSelectRep: (m: Merchandiser) => void }) {
  const [expandedMgr, setExpandedMgr] = useState<string | null>(null);
  const managerMap = useMemo(() => {
    const map = new Map<string, { name: string; reps: Merchandiser[]; sfTasks: number; sfDone: number }>();
    data.merchandisers.forEach(m => {
      const key = m.lineManager ? tc(m.lineManager) : 'Unknown';
      if (!map.has(key)) map.set(key, { name: key, reps: [], sfTasks: 0, sfDone: 0 });
      const s = map.get(key)!;
      s.reps.push(m);
      if (m.stockFix) { s.sfTasks += m.stockFix.tasks; s.sfDone += m.stockFix.completed; }
    });
    return [...map.values()]
      .map(s => ({
        ...s,
        sfRate:  s.sfTasks > 0  ? Math.round((s.sfDone   / s.sfTasks) * 100) : 0,
        overall: s.sfTasks > 0 ? Math.round((s.sfDone / s.sfTasks) * 100) : 0,
      }))
      .sort((a, b) => b.overall - a.overall);
  }, [data.merchandisers]);

  const totalSfTasks = managerMap.reduce((s, m) => s + m.sfTasks, 0);
  const totalSfDone  = managerMap.reduce((s, m) => s + m.sfDone, 0);
  const avgOverall   = managerMap.length > 0 ? Math.round(managerMap.reduce((s, m) => s + m.overall, 0) / managerMap.length) : 0;
  const worst        = managerMap[managerMap.length - 1];

  const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(15,31,61,0.06)', border: '1px solid #e8edf4', overflow: 'hidden', boxSizing: 'border-box' as const };
  const panelHdr: React.CSSProperties = { padding: '11px 16px', borderBottom: '1px solid #f0f4f8', fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.07em', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '7px' };
  const dot = (c: string) => <span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: c, flexShrink: 0 }} />;
  const miniBar = (pct: number, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}>
      <div style={{ width: '44px', height: '5px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 700, color: rateColor(pct), minWidth: '28px' }}>{pct}%</span>
    </div>
  );
  const COLS = '2fr 60px 110px 100px 96px 22px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '10px' }}>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', flexShrink: 0, height: '84px' }}>
        {[
          { label: 'Managers',       value: String(managerMap.length),                sub: 'line managers',        iconBg: '#eff6ff', iconColor: '#2563eb',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
          { label: 'Avg Resolution', value: `${avgOverall}%`,                          sub: 'across all managers',  iconBg: '#f8fafc', iconColor: rateColor(avgOverall), icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
          { label: 'SF Tasks',       value: `${totalSfDone}/${totalSfTasks}`,           sub: `${totalSfTasks > 0 ? Math.round(totalSfDone/totalSfTasks*100) : 0}% completion`, iconBg: '#fff7ed', iconColor: '#f97316', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> },
          { label: 'Attention',      value: worst && worst.overall < 60 ? worst.name.split(' ')[0] : 'All Good', sub: worst && worst.overall < 60 ? `${worst.overall}% overall` : 'no critical flags', iconBg: worst && worst.overall < 60 ? '#fee2e2' : '#f0fdf4', iconColor: worst && worst.overall < 60 ? '#dc2626' : '#16a34a', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', overflow: 'visible' }}>
            <div style={{ width: 36, height: 36, borderRadius: '9px', backgroundColor: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.iconColor, flexShrink: 0 }}>{k.icon}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{k.label}</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{k.value}</div>
              <div style={{ fontSize: '10px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Manager Table */}
      <div style={{ flex: 1, minHeight: 0, ...card, display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...panelHdr, justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>{dot('#003B71')}Performance by Manager</span>
          <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400, letterSpacing: 0 }}>{managerMap.length} managers · click row to expand reps</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '7px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f0f4f8', flexShrink: 0 }}>
          {[['Manager','left'],['Reps','center'],['SF Done/Tot','center'],['SF Rate','center'],['Status','center'],['','center']].map(([h, a]) => (
            <div key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: a as any }}>{h}</div>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {managerMap.map(mgr => {
            const st = rateStatus(mgr.overall);
            const expanded = expandedMgr === mgr.name;
            return (
              <div key={mgr.name}>
                <div onClick={() => setExpandedMgr(expanded ? null : mgr.name)}
                  onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'; }}
                  onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLElement).style.backgroundColor = '#fff'; }}
                  style={{ display: 'grid', gridTemplateColumns: COLS, padding: '12px 16px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', alignItems: 'center', backgroundColor: expanded ? '#f8fafc' : '#fff', transition: 'background-color 0.1s' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{mgr.name}</div>
                  <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>{mgr.reps.length}</div>
                  <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#f97316' }}>{mgr.sfDone}/{mgr.sfTasks || 0}</div>
                  <div>{mgr.sfTasks > 0 ? miniBar(mgr.sfRate, '#f97316') : <div style={{ textAlign: 'center', color: '#cbd5e1' }}>—</div>}</div>
                  <div style={{ textAlign: 'center' }}><span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', backgroundColor: st.bg, color: st.color }}>{st.label}</span></div>
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>{expanded ? '▲' : '▼'}</div>
                </div>
                {expanded && mgr.reps.filter((r: Merchandiser) => r.stockFix).map((rep: Merchandiser) => {
                  const rSfRate = rep.stockFix?.captureRate ?? 0;
                  return (
                    <div key={rep.name} onClick={() => onSelectRep(rep)}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f1f5f9'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#fafafa'}
                      style={{ display: 'grid', gridTemplateColumns: COLS, padding: '9px 16px 9px 30px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', alignItems: 'center', backgroundColor: '#fafafa' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#1e293b', fontWeight: 500 }}>{tc(rep.name)}</div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                          {rep.stockFix && <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', backgroundColor: '#fff7ed', color: '#f97316' }}>SF</span>}
                        </div>
                      </div>
                      <div />
                      <div style={{ textAlign: 'center', fontSize: '11px', color: '#f97316' }}>{rep.stockFix ? `${rep.stockFix.completed}/${rep.stockFix.tasks}` : '—'}</div>
                      <div style={{ textAlign: 'center' }}>{rep.stockFix ? <span style={{ fontSize: '11px', fontWeight: 700, color: rateColor(rSfRate) }}>{rSfRate}%</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</div>
                      <div />
                      <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>›</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Regions View ─────────────────────────────────────────
function RegionsView({ data }: { data: PilotReport }) {
  const regionMap = useMemo(() => {
    const map = new Map<string, { name: string; reps: number; sfTasks: number; sfDone: number }>();
    data.merchandisers.forEach(m => {
      const key = m.region ? tc(m.region) : 'Unknown';
      if (!map.has(key)) map.set(key, { name: key, reps: 0, sfTasks: 0, sfDone: 0 });
      const s = map.get(key)!;
      s.reps++;
      if (m.stockFix) { s.sfTasks += m.stockFix.tasks; s.sfDone += m.stockFix.completed; }
    });
    return [...map.values()]
      .map(s => ({
        ...s,
        sfRate:  s.sfTasks > 0  ? Math.round((s.sfDone   / s.sfTasks) * 100) : 0,
        overall: s.sfTasks > 0 ? Math.round((s.sfDone / s.sfTasks) * 100) : 0,
      }))
      .sort((a, b) => b.overall - a.overall);
  }, [data.merchandisers]);

  const totalReps  = regionMap.reduce((s, r) => s + r.reps, 0);
  const sfRegions  = regionMap.filter(r => r.sfTasks > 0);
  const avgSfRate  = sfRegions.length > 0 ? Math.round(sfRegions.reduce((s, r) => s + r.sfRate, 0) / sfRegions.length) : 0;

  const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(15,31,61,0.06)', border: '1px solid #e8edf4', overflow: 'hidden', boxSizing: 'border-box' as const };
  const panelHdr: React.CSSProperties = { padding: '11px 16px', borderBottom: '1px solid #f0f4f8', fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.07em', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '7px' };
  const dot = (c: string) => <span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: c, flexShrink: 0 }} />;
  const miniBar = (pct: number, color: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', justifyContent: 'center' }}>
      <div style={{ width: '44px', height: '5px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '11px', fontWeight: 700, color: rateColor(pct), minWidth: '28px' }}>{pct}%</span>
    </div>
  );
  const COLS = '2fr 60px 110px 100px 96px';
  const barData = regionMap.map(r => ({ name: r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name, 'SF': r.sfRate }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: '10px' }}>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', flexShrink: 0, height: '84px' }}>
        {[
          { label: 'Regions',      value: String(regionMap.length), sub: 'active regions',          iconBg: '#eff6ff', iconColor: '#2563eb',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
          { label: 'Total Reps',   value: String(totalReps),         sub: 'across all regions',     iconBg: '#f8fafc', iconColor: '#64748b',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
          { label: 'Avg SF Rate',  value: `${avgSfRate}%`,           sub: 'task completion avg',    iconBg: '#fff7ed', iconColor: '#f97316',  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> },
          { label: 'Best Region',  value: regionMap[0]?.name || '—', sub: regionMap[0] ? `${regionMap[0].overall}% overall` : 'no data', iconBg: '#f0fdf4', iconColor: '#16a34a', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', overflow: 'visible' }}>
            <div style={{ width: 36, height: 36, borderRadius: '9px', backgroundColor: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.iconColor, flexShrink: 0 }}>{k.icon}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{k.label}</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{k.value}</div>
              <div style={{ fontSize: '10px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '10px', flex: 1, minHeight: 0 }}>

        {/* Region Table */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...panelHdr, justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>{dot('#003B71')}Performance by Region</span>
            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 400, letterSpacing: 0 }}>{regionMap.length} regions</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '7px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f0f4f8', flexShrink: 0 }}>
            {[['Region','left'],['Reps','center'],['SF Done/Tot','center'],['SF Rate','center'],['Status','center']].map(([h, a]) => (
              <div key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: a as any }}>{h}</div>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {regionMap.map((reg, i) => {
              const st = rateStatus(reg.overall);
              return (
                <div key={reg.name} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '13px 16px', borderBottom: i < regionMap.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{reg.name}</div>
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{reg.reps} reps</div>
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>{reg.reps}</div>
                  <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#f97316' }}>{reg.sfDone}/{reg.sfTasks}</div>
                  <div>{reg.sfTasks > 0 ? miniBar(reg.sfRate, '#f97316') : <div style={{ textAlign: 'center', color: '#cbd5e1' }}>—</div>}</div>
                  <div style={{ textAlign: 'center' }}><span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', backgroundColor: st.bg, color: st.color }}>{st.label}</span></div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SF Rate Chart */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={panelHdr}>{dot('#475569')}Rate Comparison</div>
          <div style={{ flex: 1, minHeight: 0, padding: '8px 0 8px 0' }}>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 4 }}>
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} width={80} />
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Stock Fix']} contentStyle={{ fontSize: 11 }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} formatter={() => 'Stock Fix'} />
                  <Bar dataKey="SF" fill="#f97316" radius={[0,3,3,0]} barSize={10} label={{ position: 'right', fontSize: 10, fill: '#94a3b8', formatter: (v: any) => v > 0 ? `${v}%` : '' }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: '12px' }}>No data</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Alerts View ──────────────────────────────────────────
function AlertsView({ data, onSelect }: { data: PilotReport; onSelect: (m: Merchandiser) => void }) {
  const { merchandisers } = data;
  type AlertItem = { merch: Merchandiser; reasons: string[]; priority: 'high' | 'medium' };

  const alerts: AlertItem[] = merchandisers
    .map(m => {
      const reasons: string[] = [];
      let priority: 'high' | 'medium' = 'medium';
      if (!m.stockFix) { reasons.push('Not active on Stock Fix'); priority = 'high'; }
      if (m.stockFix && m.stockFix.captureRate < 50 && m.stockFix.tasks > 0) { reasons.push(`SF completion: ${m.stockFix.captureRate}%`); priority = 'high'; }
      if (m.overallRate < 30 && m.stockFix) priority = 'high';
      return { merch: m, reasons, priority };
    })
    .filter(a => a.reasons.length > 0)
    .sort((a, b) => a.priority === b.priority ? a.merch.overallRate - b.merch.overallRate : a.priority === 'high' ? -1 : 1);

  const high = alerts.filter(a => a.priority === 'high').length;
  const med  = alerts.filter(a => a.priority === 'medium').length;
  const ok   = merchandisers.length - alerts.length;

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' as const }}>
        {[
          { count: high, label: 'Critical',     bg: '#fee2e2', border: '#fca5a5', color: '#dc2626' },
          { count: med,  label: 'Needs Review',  bg: '#fff7ed', border: '#fed7aa', color: '#f97316' },
          { count: ok,   label: 'On Track',      bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: '12px', padding: '14px 22px', border: `1px solid ${s.border}`, minWidth: '140px' }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: s.color, letterSpacing: '-0.02em' }}>{s.count}</div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: s.color, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {alerts.length === 0 ? (
        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '40px', textAlign: 'center' as const, fontSize: '14px', color: '#16a34a', fontWeight: 600 }}>
          All reps are performing well — no alerts to show.
        </div>
      ) : (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(15,31,61,0.06)', border: '1px solid #e8edf4', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.8fr 90px 20px', padding: '8px 18px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f0f4f8' }}>
            {['Rep', 'Manager', 'Region', 'Alert Reason', 'Overall', ''].map(h => (
              <div key={h} style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{h}</div>
            ))}
          </div>
          {alerts.map((a, i) => (
            <div key={a.merch.name}
              onClick={() => a.merch.stockFix && onSelect(a.merch)}
              style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.8fr 90px 20px', padding: '12px 18px', borderBottom: i < alerts.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center', cursor: a.merch.stockFix ? 'pointer' : 'default', backgroundColor: '#fff', transition: 'background-color 0.1s' }}
              onMouseEnter={e => { if (a.merch.stockFix) (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'; }}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#fff'}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{tc(a.merch.name)}</div>
                <div style={{ display: 'flex', gap: '4px', marginTop: '3px' }}>
                  {a.merch.stockFix && <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '3px', backgroundColor: '#fff7ed', color: '#f97316' }}>SF</span>}
                  {!a.merch.stockFix && <span style={{ fontSize: '9px', color: '#94a3b8' }}>Inactive</span>}
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{a.merch.lineManager ? tc(a.merch.lineManager) : '—'}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>{a.merch.region || '—'}</div>
              <div>
                {a.reasons.map((r, ri) => (
                  <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: ri < a.reasons.length - 1 ? '3px' : 0 }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: a.priority === 'high' ? '#dc2626' : '#f97316', flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: a.priority === 'high' ? '#dc2626' : '#ea580c', fontWeight: 500 }}>{r}</span>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center' }}>
                {a.merch.stockFix
                  ? <span style={{ fontSize: '13px', fontWeight: 700, color: rateColor(a.merch.overallRate) }}>{a.merch.overallRate}%</span>
                  : <span style={{ fontSize: '11px', color: '#94a3b8' }}>—</span>}
              </div>
              <div style={{ color: '#94a3b8' }}>{a.merch.stockFix ? '›' : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Reports View ─────────────────────────────────────────
function ReportsView({ data, onSelect }: { data: PilotReport; onSelect: (m: Merchandiser) => void }) {
  const { merchandisers } = data;
  type SortKey = 'name' | 'manager' | 'sfRate' | 'overall';
  const [sortKey, setSortKey] = useState<SortKey>('overall');
  const [sortAsc, setSortAsc]   = useState(false);

  const rows = useMemo(() => merchandisers
    .filter(m => m.stockFix)
    .map(m => ({
      merch: m,
      name: tc(m.name), manager: m.lineManager ? tc(m.lineManager) : '—', region: m.region || '—',
      sfTasks: m.stockFix?.tasks ?? 0, sfDone: m.stockFix?.completed ?? 0,
      sfRate: m.stockFix?.captureRate ?? 0, overall: m.overallRate,
    }))
    .sort((a, b) => {
      const v = (a as any)[sortKey] < (b as any)[sortKey] ? -1 : (a as any)[sortKey] > (b as any)[sortKey] ? 1 : 0;
      return sortAsc ? v : -v;
    }),
  [merchandisers, sortKey, sortAsc]);

  function handleSort(key: SortKey) { if (sortKey === key) setSortAsc(a => !a); else { setSortKey(key); setSortAsc(false); } }

  const colHdr = (label: string, key?: SortKey) => (
    <div key={label} onClick={() => key && handleSort(key)}
      style={{ fontSize: '10px', fontWeight: 700, color: key && sortKey === key ? '#2563eb' : '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', cursor: key ? 'pointer' : 'default', userSelect: 'none' as const, display: 'flex', alignItems: 'center', gap: '3px' }}>
      {label}{key && sortKey === key && <span>{sortAsc ? '↑' : '↓'}</span>}
    </div>
  );

  const cols = '2fr 1.2fr 1fr 68px 68px 80px 84px';

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(15,31,61,0.06)', border: '1px solid #e8edf4', overflow: 'hidden' }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' as const, letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: '#475569' }} />Full Rep Report
        </div>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{rows.length} active reps · click column header to sort</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '8px 18px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f0f4f8' }}>
        {colHdr('Rep','name')}{colHdr('Manager','manager')}{colHdr('Region')}
        {colHdr('SF Tasks')}{colHdr('SF Done')}{colHdr('SF Rate','sfRate')}{colHdr('Overall','overall')}
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
        {rows.map((r, i) => (
          <div key={r.name} onClick={() => onSelect(r.merch)}
            style={{ display: 'grid', gridTemplateColumns: cols, padding: '10px 18px', borderBottom: i < rows.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center', cursor: 'pointer', backgroundColor: '#fff', transition: 'background-color 0.1s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#fff'}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{r.name}</div>
            <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r.manager}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{r.region}</div>
            <div style={{ fontSize: '12px', color: '#475569', textAlign: 'center' }}>{r.sfTasks > 0 ? r.sfTasks : <span style={{ color: '#e2e8f0' }}>—</span>}</div>
            <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600, textAlign: 'center' }}>{r.sfTasks > 0 ? r.sfDone : <span style={{ color: '#e2e8f0', fontWeight: 400 }}>—</span>}</div>
            <div style={{ textAlign: 'center' }}>{r.sfTasks > 0 ? <span style={{ fontSize: '12px', fontWeight: 700, color: rateColor(r.sfRate) }}>{r.sfRate}%</span> : <span style={{ color: '#e2e8f0' }}>—</span>}</div>
            <div style={{ textAlign: 'center' }}><span style={{ fontSize: '13px', fontWeight: 700, color: rateColor(r.overall) }}>{r.overall}%</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Settings View ────────────────────────────────────────
function SettingsView({ data }: { data: PilotReport | null }) {
  const card: React.CSSProperties = {
    backgroundColor: '#fff', borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(15,31,61,0.06)', border: '1px solid #e8edf4',
    padding: '22px 24px', marginBottom: '14px',
  };
  const sHdr = (color: string, label: string) => (
    <div style={{ fontSize: '11px', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ display: 'inline-block', width: '3px', height: '13px', borderRadius: '2px', backgroundColor: color }} />{label}
    </div>
  );
  const row = (label: string, value: React.ReactNode, last = false): ReactElement => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: last ? 'none' : '1px solid #f1f5f9', fontSize: '13px' }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 600, color: '#1e293b' }}>{value}</span>
    </div>
  );
  const totalPilotReps = data?.merchandisers.length ?? 0;
  return (
    <div style={{ maxWidth: '620px' }}>
      <div style={card}>
        {sHdr('#003B71', 'Pilot Configuration')}
        {row('Pilot Size', `${totalPilotReps.toLocaleString()} Merchandisers`)}
        {row('Active Reps', <span style={{ color: '#16a34a' }}>{data?.summary.activeReps ?? '—'} / {totalPilotReps.toLocaleString()}</span>)}
        {row('Latest Data Week', <span style={{ color: '#2563eb' }}>{data?.latestWeek ?? 'Loading…'}</span>)}
        {row('Program', (
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: '#fff7ed', color: '#f97316' }}>StockFix</span>
        ), true)}
      </div>
      <div style={card}>
        {sHdr('#F36C21', 'Data Sources')}
        {row('StockFix Source', 'StockFix PostgreSQL Database')}
        {row('Data Refresh', 'Auto — every 5 minutes', true)}
      </div>
      <div style={card}>
        {sHdr('#64748b', 'About')}
        {row('Application', 'StockFix Merchandiser Pilot Dashboard')}
        {row('Platform', 'Meridian Group')}
        {row('Version', '2.0 — July 2026', true)}
      </div>
    </div>
  );
}

// ─── Store View (drill-down) ──────────────────────────────
function StoreView({ merch, onSelectStore, onBack }: { merch: Merchandiser; onSelectStore: (s: string) => void; onBack: () => void }) {
  const sfMap = new Map((merch.stockFix?.stores || []).map(s => [s.name, s]));
  const storeNames = [...sfMap.keys()].sort();
  const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '13px', padding: 0 }}>← Back</button>
      <div style={{ ...card, padding: '18px 22px', display: 'flex', gap: '20px', flexWrap: 'wrap' as const, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>{tc(merch.name)}</div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '3px' }}>{merch.lineManager ? tc(merch.lineManager) : ''}{merch.region ? ` · ${merch.region}` : ''}</div>
        </div>
        {merch.stockFix && (
          <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: '#fff7ed', borderRadius: '10px', border: '1px solid #fed7aa' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: rateColor(merch.stockFix.captureRate) }}>{merch.stockFix.captureRate}%</div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#F36C21', textTransform: 'uppercase' as const }}>StockFix</span>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>{merch.stockFix.completed}/{merch.stockFix.tasks} tasks</div>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 160px 20px', padding: '10px 18px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
          {['Store', 'StockFix', ''].map((h, i) => (
            <div key={h + i} style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.07em', textAlign: i >= 1 ? 'center' : 'left' as any }}>{h}</div>
          ))}
        </div>
        {storeNames.length === 0 && <div style={{ padding: '30px', textAlign: 'center', fontSize: '13px', color: '#94a3b8' }}>No stores with Stock Fix activity.</div>}
        {storeNames.map((sn, idx) => {
          const sf = sfMap.get(sn);
          return (
            <div key={sn} data-testid={`row-store-${sn}`} onClick={() => onSelectStore(sn)}
              style={{ display: 'grid', gridTemplateColumns: '2fr 160px 20px', padding: '13px 18px', borderBottom: idx < storeNames.length - 1 ? '1px solid #f8fafc' : 'none', cursor: 'pointer', alignItems: 'center', transition: 'background-color 0.12s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#fff'}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{tc(sn)}</div>
              <div style={{ textAlign: 'center' }}>
                {sf ? <><span style={{ fontSize: '14px', fontWeight: 700, color: rateColor(sf.captureRate) }}>{sf.captureRate}%</span><div style={{ fontSize: '10px', color: '#94a3b8' }}>{sf.completed}/{sf.tasks}</div></> : <span style={{ color: '#e2e8f0' }}>—</span>}
              </div>
              <div style={{ color: '#cbd5e1', textAlign: 'right' }}>›</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Task Detail View ──────────────────────────────────────
function TaskDetailView({ merch, storeName, onBack }: { merch: Merchandiser; storeName: string; onBack: () => void }) {
  const sfStore = merch.stockFix?.stores.find(s => s.name === storeName) || null;
  const { data: sfData, isLoading: sfLoading } = useQuery<{ tasks: any[] }>({
    queryKey: ['pilot-tasks', merch.name, storeName],
    queryFn: async () => {
      const r = await fetch(`/api/pilot-tasks?rep=${encodeURIComponent(merch.name)}&store=${encodeURIComponent(storeName)}`);
      return r.json();
    },
    enabled: !!sfStore,
    staleTime: 300000,
  });
  const tasks = sfData?.tasks || [];
  const done = tasks.filter((t: any) => t.action_status === 'Completed');
  const pending = tasks.filter((t: any) => t.action_status !== 'Completed');
  const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(15,31,61,0.06)', border: '1px solid #e8edf4', overflow: 'hidden', marginBottom: '16px' };

  return (
    <div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '13px', padding: '0 0 14px' }}>← {tc(merch.name)}</button>
      {sfStore ? (
        <div style={card}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '8px', backgroundColor: '#fff7ed' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: '#fed7aa', color: '#F36C21' }}>STOCKFIX</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{sfStore.tasks} tasks · {tc(storeName)}</span>
            </div>
            <div style={{ display: 'flex', gap: '14px' }}>
              <span style={{ fontSize: '12px', color: '#F36C21', fontWeight: 600 }}>{done.length} done</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{pending.length} pending</span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: rateColor(sfStore.captureRate) }}>{sfStore.captureRate}%</span>
            </div>
          </div>
          {sfLoading ? <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Loading tasks…</div> : tasks.length > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 2fr 1fr 1.2fr 100px', padding: '8px 18px', backgroundColor: '#f8fafc' }}>
                {['Client', 'Product', 'Category', 'Action', 'Status'].map(h => <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const }}>{h}</div>)}
              </div>
              {tasks.map((t: any, i: number) => {
                const isDone = t.action_status === 'Completed';
                return (
                  <div key={t.unique_id || i} style={{ display: 'grid', gridTemplateColumns: '1.8fr 2fr 1fr 1.2fr 100px', padding: '10px 18px', borderTop: '1px solid #f8fafc', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{t.client}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, paddingRight: '8px' }}>{t.article_description}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>{t.category}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{t.action}</div>
                    <div><span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', backgroundColor: isDone ? '#fff7ed' : '#fee2e2', color: isDone ? '#F36C21' : '#dc2626' }}>{t.action_status}</span></div>
                  </div>
                );
              })}
            </>
          ) : <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No tasks found</div>}
        </div>
      ) : (
        <div style={card}>
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No Stock Fix data for this store.</div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function MerchandiserPilotPage() {
  const [navSection, setNavSection] = useState<NavSection>('overview');
  const [filterManager, setFilterManager] = useState('');
  const [filterRegion, setFilterRegion]   = useState('');
  const [filterStore, setFilterStore]     = useState('');
  const [view, setView]         = useState<'list' | 'store' | 'task'>('list');
  const [selMerch, setSelMerch] = useState<Merchandiser | null>(null);
  const [selStore, setSelStore] = useState<string>('');

  const params = new URLSearchParams();
  if (filterManager) params.set('manager', filterManager);
  if (filterRegion)  params.set('region', filterRegion);
  if (filterStore)   params.set('store', filterStore);

  const { data, isLoading, error, dataUpdatedAt } = useQuery<PilotReport>({
    queryKey: ['pilot-report', filterManager, filterRegion, filterStore],
    queryFn: async () => {
      const r = await fetch(`/api/pilot-report${params.toString() ? '?' + params.toString() : ''}`);
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60000,
  });

  const { data: recentData } = useQuery<{ activity: any[] }>({
    queryKey: ['pilot-recent'],
    queryFn: async () => {
      const r = await fetch('/api/pilot-recent');
      return r.json();
    },
    staleTime: 120000,
  });

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : null;
  const isDashboardScreen = ['overview', 'stores', 'managers', 'regions', 'reports', 'alerts'].includes(navSection) && view === 'list';

  const headerMeta: Record<string, { title: string; sub: string }> = {
    overview:  { title: 'Merchandiser Pilot Dashboard',      sub: 'Stock Fix Task & Resolution Monitoring' },
    stores:    { title: 'Store Performance Dashboard',       sub: 'Store-Level Stock Fix Performance' },
    managers:  { title: 'Compliance by Manager',             sub: 'Manager-Level Stock Fix Performance' },
    regions:   { title: 'Compliance by Region',              sub: 'Regional Stock Fix Performance' },
    reports:   { title: 'Reports',                           sub: 'All Active Merchandiser Activity — click headers to sort' },
    alerts:    { title: 'Action Required',                   sub: 'Reps & stores requiring immediate attention' },
    settings:  { title: 'Settings',                          sub: 'Pilot configuration & data sources' },
  };
  const hdr = headerMeta[navSection] || headerMeta.overview;

  function handleSelectRep(m: Merchandiser) {
    setSelMerch(m);
    setView('store');
  }

  function renderContent() {
    if (view === 'store' && selMerch) {
      return <StoreView merch={selMerch} onSelectStore={s => { setSelStore(s); setView('task'); }} onBack={() => setView('list')} />;
    }
    if (view === 'task' && selMerch) {
      return <TaskDetailView merch={selMerch} storeName={selStore} onBack={() => setView('store')} />;
    }
    if (!data) return null;
    if (navSection === 'overview')  return <OverviewDashboard data={data} recentActivity={recentData?.activity || []} />;
    if (navSection === 'stores')    return <StoresDashboard data={data} />;
    if (navSection === 'managers')  return <ManagersView data={data} onSelectRep={handleSelectRep} />;
    if (navSection === 'regions')   return <RegionsView data={data} />;
    if (navSection === 'reports')   return <ReportsView data={data} onSelect={handleSelectRep} />;
    if (navSection === 'alerts')    return <AlertsView data={data} onSelect={handleSelectRep} />;
    if (navSection === 'settings')  return <SettingsView data={data} />;
    return null;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#f0f4f8', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Sidebar active={navSection} onNav={s => { setNavSection(s); setView('list'); }} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

        {/* ── Header (60px) ── */}
        <div style={{ flexShrink: 0, height: '60px', backgroundColor: '#fff', borderBottom: '2px solid #f0f4f8', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(15,31,61,0.04)' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', lineHeight: 1.2, letterSpacing: '-0.01em' }}>{hdr.title}</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>
              {hdr.sub}
              {lastUpdated && <span style={{ marginLeft: '8px', color: '#b0bac8' }}>· Updated {lastUpdated}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            {data?.latestWeek && (
              <span style={{ backgroundColor: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '6px', padding: '4px 12px', fontSize: '11px', fontWeight: 600, color: '#2563eb', letterSpacing: '0.02em' }}>
                Week {data.latestWeek}
              </span>
            )}
            <a
              href="/api/pilot-export"
              download="pilot-tasks.json"
              style={{ backgroundColor: '#2563eb', color: '#fff', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              ↓ Download JSON
            </a>
            <a
              href="/api/pilot-export-xlsx"
              download
              style={{ backgroundColor: '#16a34a', color: '#fff', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              ↓ Download Excel
            </a>
          </div>
        </div>

        {/* ── Filter bar (44px, list views only) ── */}
        {view === 'list' && data && (
          <div style={{ flexShrink: 0, height: '44px', backgroundColor: '#fafbfc', borderBottom: '1px solid #edf0f5', padding: '0 24px', display: 'flex', alignItems: 'center' }}>
            <FilterBar
              filters={data.filters}
              filterManager={filterManager}
              filterRegion={filterRegion}
              filterStore={filterStore}
              setFilterManager={v => { setFilterManager(v); setView('list'); }}
              setFilterRegion={v => { setFilterRegion(v); setView('list'); }}
              setFilterStore={v => { setFilterStore(v); setView('list'); }}
            />
          </div>
        )}

        {/* ── Content area ── */}
        <div style={{
          flex: 1, minHeight: 0,
          padding: isDashboardScreen ? '10px 20px' : '20px 24px',
          overflow: isDashboardScreen ? 'hidden' : 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8', fontSize: '14px' }}>
              Loading report — fetching StockFix data…
            </div>
          )}
          {error && (
            <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '10px', padding: '16px 20px', color: '#dc2626', fontSize: '13px' }}>
              Error: {String(error)}
            </div>
          )}
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
