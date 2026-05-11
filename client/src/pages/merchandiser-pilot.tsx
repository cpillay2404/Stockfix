import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";

// ─── Types ────────────────────────────────────────────────
interface SFStore { name: string; tasks: number; completed: number; captureRate: number; clients: string[] }
interface GRFormDetail { formName: string; visited: boolean; compliance: number | null; date: string; banner: string }
interface GRStore { name: string; forms: number; visited: number; visitRate: number; avgCompliance: number; formDetails: GRFormDetail[] }

interface Merchandiser {
  name: string;
  lineManager: string | null;
  region: string | null;
  overallRate: number;
  stockFix: { tasks: number; completed: number; captureRate: number; stores: SFStore[] } | null;
  geoRep: { forms: number; visited: number; visitRate: number; avgCompliance: number; submissions: number; lineManager: string; region: string; lastDate: string; stores: GRStore[] } | null;
}

interface WeekSnapshot { weekEndingDate: string; repCount: number; totalTasks: number; totalCompleted: number; captureRate: number }
interface ClientStat { formName: string; total: number; visited: number; visitRate: number; avgCompliance: number }
interface BannerStat { banner: string; total: number; visited: number; visitRate: number; avgCompliance: number }

interface PilotReport {
  latestWeek: string | null;
  filters: { managers: string[]; regions: string[]; stores: string[]; active: { manager: string | null; region: string | null; store: string | null } };
  summary: {
    stockFix: { total: number; completed: number; captureRate: number };
    geoRep:   { total: number; visited: number; visitRate: number; avgCompliance: number; submissions: number };
    combined: { total: number; done: number; rate: number };
    activeReps: number;
  };
  merchandisers: Merchandiser[];
  clientSummary: ClientStat[];
  bannerBreakdown: BannerStat[];
  history: WeekSnapshot[];
}

type NavSection = 'overview' | 'georep' | 'stockfix' | 'stores' | 'managers' | 'regions' | 'reports' | 'alerts';

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
function KpiCard({ label, value, sub, iconBg, icon }: {
  label: string; value: string | number; sub?: string;
  iconBg: string; icon: string;
}) {
  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '10px', padding: '11px 13px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', display: 'flex', alignItems: 'flex-start', gap: '10px', height: '100%', boxSizing: 'border-box' as const }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '2px', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{sub}</div>}
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

// ─── SVG Icons ────────────────────────────────────────────
const Icons: Record<string, JSX.Element> = {
  overview: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  ),
  georep: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  stockfix: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
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

type NavGroup = { items: { key: NavSection; label: string }[] };

const NAV_GROUPS: NavGroup[] = [
  { items: [
    { key: 'overview',  label: 'Overview'  },
    { key: 'georep',    label: 'Geo Rep'   },
    { key: 'stockfix',  label: 'Stock Fix' },
    { key: 'stores',    label: 'Stores'    },
    { key: 'managers',  label: 'Managers'  },
    { key: 'regions',   label: 'Regions'   },
  ]},
  { items: [
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

function Sidebar({ active, onNav, latestWeek }: { active: NavSection; onNav: (s: NavSection) => void; latestWeek: string | null }) {
  return (
    <div style={{ width: '200px', flexShrink: 0, backgroundColor: '#0f1f3d', minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0 }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 18px' }}>
        <img src={meridianGroupLogo} alt="Meridian" style={{ height: '26px', objectFit: 'contain' }} />
      </div>

      {/* Nav groups */}
      <nav style={{ padding: '0 8px', flex: 1 }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.08)', margin: '10px 4px' }} />}
            {group.items.map(item => (
              <NavBtn key={item.key} item={item} active={active === item.key} onNav={onNav} />
            ))}
          </div>
        ))}
      </nav>

      {/* Settings */}
      <div style={{ padding: '0 8px 0' }}>
        <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.08)', margin: '0 4px 8px' }} />
        <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px', border: 'none', cursor: 'default', backgroundColor: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '13px', textAlign: 'left' as const }}>
          <span style={{ width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.7 }}>{Icons.settings}</span>
          Settings
        </button>
      </div>
      <div style={{ padding: '12px 14px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
          M
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Meridian</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>Admin</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" style={{ marginLeft: 'auto', flexShrink: 0 }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
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

// ─── Overview Dashboard ───────────────────────────────────
function OverviewDashboard({ data, recentActivity, onSelectRep }: {
  data: PilotReport;
  recentActivity: any[];
  onSelectRep: (m: Merchandiser) => void;
}) {
  const { summary, merchandisers, history, clientSummary, bannerBreakdown } = data;
  const TOTAL_PILOT = 18;

  // Manager stats
  const managerStats = useMemo(() => {
    const map = new Map<string, { name: string; grForms: number; grVisited: number; sfTasks: number; sfDone: number }>();
    merchandisers.forEach(m => {
      const key = m.lineManager ? tc(m.lineManager) : 'Unknown';
      if (!map.has(key)) map.set(key, { name: key, grForms: 0, grVisited: 0, sfTasks: 0, sfDone: 0 });
      const s = map.get(key)!;
      if (m.geoRep) { s.grForms += m.geoRep.forms; s.grVisited += m.geoRep.visited; }
      if (m.stockFix) { s.sfTasks += m.stockFix.tasks; s.sfDone += m.stockFix.completed; }
    });
    return [...map.values()]
      .map(s => ({
        ...s,
        grRate: s.grForms > 0 ? Math.round((s.grVisited / s.grForms) * 100) : 0,
        sfRate: s.sfTasks > 0 ? Math.round((s.sfDone / s.sfTasks) * 100) : 0,
        overall: (s.grForms + s.sfTasks) > 0 ? Math.round(((s.grVisited + s.sfDone) / (s.grForms + s.sfTasks)) * 100) : 0,
      }))
      .filter(s => s.grForms > 0 || s.sfTasks > 0)
      .sort((a, b) => b.overall - a.overall);
  }, [merchandisers]);

  // Store performance
  const storePerf = useMemo(() => {
    const map = new Map<string, { name: string; manager: string; region: string; grForms: number; grVisited: number; sfTasks: number; sfDone: number }>();
    merchandisers.forEach(m => {
      const mgr = m.lineManager ? tc(m.lineManager) : '';
      const reg = m.region ? tc(m.region) : '';
      (m.geoRep?.stores || []).forEach(s => {
        if (!map.has(s.name)) map.set(s.name, { name: s.name, manager: mgr, region: reg, grForms: 0, grVisited: 0, sfTasks: 0, sfDone: 0 });
        const st = map.get(s.name)!;
        st.grForms += s.forms; st.grVisited += s.visited;
        if (!st.manager && mgr) st.manager = mgr;
        if (!st.region && reg) st.region = reg;
      });
      (m.stockFix?.stores || []).forEach(s => {
        if (!map.has(s.name)) map.set(s.name, { name: s.name, manager: mgr, region: reg, grForms: 0, grVisited: 0, sfTasks: 0, sfDone: 0 });
        const st = map.get(s.name)!;
        st.sfTasks += s.tasks; st.sfDone += s.completed;
        if (!st.manager && mgr) st.manager = mgr;
        if (!st.region && reg) st.region = reg;
      });
    });
    return [...map.values()]
      .map(s => ({ ...s, overall: (s.grForms + s.sfTasks) > 0 ? Math.round(((s.grVisited + s.sfDone) / (s.grForms + s.sfTasks)) * 100) : 0 }))
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 8);
  }, [merchandisers]);

  // Weekly chart data
  const chartData = history.slice().reverse().map(h => ({
    week: h.weekEndingDate.slice(5), // MM-DD
    'Geo Rep %': h.captureRate,
    fullDate: h.weekEndingDate,
  }));

  const pilotCoverage = Math.round((summary.activeReps / TOTAL_PILOT) * 100);

  const card: React.CSSProperties = {
    backgroundColor: '#fff', borderRadius: '10px',
    padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
    overflow: 'hidden', boxSizing: 'border-box' as const,
  };
  const hdr: React.CSSProperties = {
    fontSize: '12px', fontWeight: 700, color: '#1e293b',
    marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>

      {/* ── Row 1: KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', flexShrink: 0, height: '84px' }}>
        <KpiCard label="Active Reps"      value={summary.activeReps}                    sub={`of ${TOTAL_PILOT} pilot reps`}           iconBg="#eff6ff" icon="👥" />
        <KpiCard label="GR Visit Rate"    value={`${summary.geoRep.visitRate}%`}        sub={`${summary.geoRep.visited}/${summary.geoRep.total} forms`} iconBg="#dbeafe" icon="✅" />
        <KpiCard label="GR Compliance"    value={`${summary.geoRep.avgCompliance}%`}    sub={`when visited · ${summary.geoRep.submissions} subs`} iconBg="#ede9fe" icon="📊" />
        <KpiCard label="SF Tasks"         value={summary.stockFix.total.toLocaleString()} sub="total logged"                           iconBg="#fff7ed" icon="🔧" />
        <KpiCard label="SF Done"          value={summary.stockFix.completed}            sub={`${summary.stockFix.captureRate}% capture`} iconBg="#dcfce7" icon="✔️" />
        <KpiCard label="Pilot Coverage"   value={`${pilotCoverage}%`}                  sub={`${summary.activeReps} of ${TOTAL_PILOT} active`} iconBg="#fef9c3" icon="🎯" />
      </div>

      {/* ── Row 2: Middle panels ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr 230px', gap: '10px', flexShrink: 0, height: '218px' }}>

        {/* Left: GR vs SF Performance rings */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={hdr}>GR vs SF Performance</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', flex: 1 }}>
            <div style={{ textAlign: 'center' as const }}>
              <div style={{ position: 'relative', width: '76px', height: '76px', margin: '0 auto' }}>
                <RingChart rate={summary.geoRep.visitRate} color="#2563eb" size={76} strokeWidth={8} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>{summary.geoRep.visitRate}%</span>
                </div>
              </div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#2563eb', marginTop: '5px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Visit Rate</div>
              <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '1px' }}>{summary.geoRep.visited}/{summary.geoRep.total}</div>
            </div>
            <div style={{ textAlign: 'center' as const }}>
              <div style={{ position: 'relative', width: '76px', height: '76px', margin: '0 auto' }}>
                <RingChart rate={summary.geoRep.avgCompliance} color="#0891b2" size={76} strokeWidth={8} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>{summary.geoRep.avgCompliance}%</span>
                </div>
              </div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#0891b2', marginTop: '5px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Compliance</div>
              <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '1px' }}>when visited</div>
            </div>
          </div>
          <div style={{ padding: '7px 10px', backgroundColor: '#fff7ed', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: '9px', fontWeight: 700, color: '#F36C21', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>StockFix</div>
              <div style={{ fontSize: '10px', color: '#92400e', marginTop: '1px' }}>{summary.stockFix.completed} done · {summary.stockFix.total.toLocaleString()} total</div>
            </div>
            <span style={{ fontSize: '18px', fontWeight: 700, color: '#F36C21' }}>{summary.stockFix.captureRate}%</span>
          </div>
        </div>

        {/* Centre: Chart */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={hdr}>
            Capture Over Time
            <span style={{ fontSize: '10px', fontWeight: 400, color: '#94a3b8' }}>({history.length} wk{history.length !== 1 ? 's' : ''})</span>
          </div>
          {chartData.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '12px', textAlign: 'center' as const }}>
              Building history — new data point saved each week
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} unit="%" />
                  <Tooltip formatter={(v: any) => `${v}%`} labelFormatter={(_: any, p: any) => p?.[0]?.payload?.fullDate || ''} contentStyle={{ fontSize: '11px', padding: '4px 8px' }} />
                  <Line type="monotone" dataKey="Geo Rep %" stroke="#2563eb" strokeWidth={2} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={{ fontSize: '9px', color: '#94a3b8', textAlign: 'center' as const, marginTop: '4px', flexShrink: 0 }}>
            Visit Rate % = forms visited ÷ total · Geo Rep · saved weekly
          </div>
        </div>

        {/* Right: Compliance by Manager */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={hdr}>Compliance by Manager</div>
          {managerStats.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: '12px' }}>No manager data</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', flex: 1, overflow: 'hidden' }}>
              {managerStats.slice(0, 6).map(m => (
                <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                  <div style={{ flex: 1, fontSize: '11px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, minWidth: 0 }}>{m.name}</div>
                  <div style={{ width: '64px', flexShrink: 0 }}>
                    <div style={{ height: '5px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(m.overall, 100)}%`, height: '100%', backgroundColor: rateColor(m.overall), borderRadius: '3px' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: rateColor(m.overall), minWidth: '30px', textAlign: 'right' as const }}>{m.overall}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Bottom panels (fills remaining height) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '10px', flex: 1, minHeight: 0 }}>

        {/* Store Performance */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...hdr, justifyContent: 'space-between' }}>
            Store Performance
            <span style={{ fontSize: '10px', fontWeight: 400, color: '#2563eb', cursor: 'pointer' }}>Top 5 · View all →</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 0.8fr 58px 58px 82px', borderBottom: '1px solid #f1f5f9', paddingBottom: '5px', marginBottom: '2px', flexShrink: 0 }}>
            {['Store', 'Manager', 'Region', 'GR', 'SF', 'Status'].map((h, i) => (
              <div key={h} style={{ fontSize: '9px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: i >= 3 ? 'center' : 'left' as any, padding: '0 3px' }}>{h}</div>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {storePerf.slice(0, 5).map((s, i) => {
              const st = rateStatus(s.overall);
              return (
                <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 0.8fr 58px 58px 82px', padding: '7px 0', borderBottom: i < 4 ? '1px solid #f8fafc' : 'none', alignItems: 'center' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, padding: '0 3px' }}>{tc(s.name)}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, padding: '0 3px' }}>{s.manager || '—'}</div>
                  <div style={{ fontSize: '10px', color: '#64748b', padding: '0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{s.region || '—'}</div>
                  <div style={{ textAlign: 'center' as const, fontSize: '12px', fontWeight: 700, color: '#2563eb' }}>{s.grVisited > 0 || s.grForms > 0 ? s.grVisited : '—'}</div>
                  <div style={{ textAlign: 'center' as const, fontSize: '12px', fontWeight: 700, color: '#F36C21' }}>{s.sfTasks > 0 ? s.sfTasks : '—'}</div>
                  <div style={{ textAlign: 'center' as const }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '20px', backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Latest Submissions */}
        <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
          <div style={hdr}>Latest Submissions</div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {recentActivity.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '12px' }}>No recent completed tasks</div>
            ) : (
              <div>
                {recentActivity.slice(0, 5).map((a: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: i < 4 ? '1px solid #f1f5f9' : 'none' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>🔧</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{tc(a.rep_name)}</div>
                      <div style={{ fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{a.store_name ? tc(a.store_name) : '—'}</div>
                      <div style={{ fontSize: '9px', color: '#94a3b8' }}>{a.client?.slice(0, 22)}</div>
                    </div>
                    <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '3px', backgroundColor: '#fff7ed', color: '#F36C21' }}>SF</span>
                      <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>{a.action_date ? fmtDate(a.action_date) : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reps Table View ──────────────────────────────────────
type QuickFilter = 'all' | 'top' | 'action' | 'inactive' | 'stockfix' | 'georep';

function RepsView({ data, onSelect, sourceFilter }: { data: PilotReport; onSelect: (m: Merchandiser) => void; sourceFilter?: string }) {
  const { merchandisers, clientSummary } = data;
  const defaultFilter: QuickFilter = (sourceFilter as QuickFilter) || 'all';
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(defaultFilter);
  const [showClients, setShowClients] = useState(false);

  const filtered = merchandisers.filter(m => {
    if (quickFilter === 'top')      return m.overallRate >= 80 && (m.stockFix || m.geoRep);
    if (quickFilter === 'action')   return m.overallRate < 50  && (m.stockFix || m.geoRep);
    if (quickFilter === 'inactive') return !m.stockFix && !m.geoRep;
    if (quickFilter === 'stockfix') return !!m.stockFix;
    if (quickFilter === 'georep')   return !!m.geoRep;
    return true;
  });

  const chips: { key: QuickFilter; label: string; count: number }[] = [
    { key: 'all',      label: 'All',              count: merchandisers.length },
    { key: 'top',      label: '🏆 Top Performers', count: merchandisers.filter(m => m.overallRate >= 80 && (m.stockFix || m.geoRep)).length },
    { key: 'action',   label: '⚠️ Need Action',    count: merchandisers.filter(m => m.overallRate < 50 && (m.stockFix || m.geoRep)).length },
    { key: 'stockfix', label: '🟠 StockFix',        count: merchandisers.filter(m => !!m.stockFix).length },
    { key: 'georep',   label: '🔵 Geo Rep',         count: merchandisers.filter(m => !!m.geoRep).length },
    { key: 'inactive', label: 'Not Active',         count: merchandisers.filter(m => !m.stockFix && !m.geoRep).length },
  ];

  return (
    <div>
      {/* Quick filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '8px', marginBottom: '16px' }}>
        {chips.map(c => {
          const active = quickFilter === c.key;
          return (
            <button key={c.key} data-testid={`chip-${c.key}`} onClick={() => setQuickFilter(c.key)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '20px', border: active ? '2px solid #003B71' : '2px solid #e2e8f0', cursor: 'pointer', fontSize: '12px', fontWeight: active ? 700 : 500, backgroundColor: active ? '#003B71' : '#fff', color: active ? '#fff' : '#64748b', transition: 'all 0.15s' }}>
              {c.label}
              <span style={{ backgroundColor: active ? 'rgba(255,255,255,0.2)' : '#f1f5f9', borderRadius: '10px', padding: '0px 7px', fontSize: '11px', fontWeight: 700, color: active ? '#fff' : '#94a3b8' }}>{c.count}</span>
            </button>
          );
        })}
      </div>

      {/* Merch table */}
      <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
        {/* Orange / Blue column band */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 160px 160px 90px 20px' }}>
          <div /><div />
          <div style={{ height: '3px', backgroundColor: '#F36C21' }} />
          <div style={{ height: '3px', backgroundColor: '#2563eb' }} />
          <div /><div />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 160px 160px 90px 20px', padding: '10px 18px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>Merchandiser</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>Manager / Region</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#F36C21', textTransform: 'uppercase' as const, letterSpacing: '0.07em', textAlign: 'center', backgroundColor: 'rgba(243,108,33,0.07)', padding: '4px 0', borderRadius: '4px' }}>StockFix</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#2563eb',  textTransform: 'uppercase' as const, letterSpacing: '0.07em', textAlign: 'center', backgroundColor: 'rgba(37,99,235,0.07)',  padding: '4px 0', borderRadius: '4px' }}>Geo Rep</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.07em', textAlign: 'center' }}>Overall</div>
          <div />
        </div>
        {filtered.length === 0 && <div style={{ padding: '30px', textAlign: 'center', fontSize: '13px', color: '#94a3b8' }}>No merchandisers match this filter.</div>}
        {filtered.map((m, idx) => {
          const hasData = !!(m.stockFix || m.geoRep);
          const sfColor = rateColor(m.stockFix?.captureRate ?? 0);
          const grColor = rateColor(m.geoRep?.visitRate ?? 0);
          const ovColor = rateColor(m.overallRate);
          return (
            <div key={m.name} data-testid={`row-merch-${m.name}`}
              onClick={() => hasData && onSelect(m)}
              style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 160px 160px 90px 20px', padding: '12px 18px', borderBottom: idx < filtered.length - 1 ? '1px solid #f8fafc' : 'none', backgroundColor: '#fff', cursor: hasData ? 'pointer' : 'default', alignItems: 'center', transition: 'background-color 0.12s' }}
              onMouseEnter={e => { if (hasData) (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#fff'; }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: hasData ? '#1e293b' : '#cbd5e1' }}>{tc(m.name)}</div>
                <div style={{ display: 'flex', gap: '5px', marginTop: '3px' }}>
                  {m.stockFix && <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', backgroundColor: '#fff7ed', color: '#F36C21', border: '1px solid #fed7aa' }}>StockFix</span>}
                  {m.geoRep   && <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', backgroundColor: '#dbeafe', color: '#2563eb',  border: '1px solid #bfdbfe' }}>Geo Rep</span>}
                  {!hasData   && <span style={{ fontSize: '11px', color: '#cbd5e1' }}>Not active</span>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>{m.lineManager ? tc(m.lineManager) : '—'}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{m.region || ''}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px', backgroundColor: 'rgba(243,108,33,0.04)', borderRadius: '6px', padding: '4px 6px' }}>
                {m.stockFix ? <><MiniBar rate={m.stockFix.captureRate} color={sfColor} /><div style={{ fontSize: '10px', color: '#94a3b8' }}>{m.stockFix.completed}/{m.stockFix.tasks}</div></> : <span style={{ color: '#cbd5e1', fontSize: '13px' }}>—</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px', backgroundColor: 'rgba(37,99,235,0.04)', borderRadius: '6px', padding: '4px 6px' }}>
                {m.geoRep ? (
                  <>
                    <MiniBar rate={m.geoRep.visitRate} color={grColor} />
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>{m.geoRep.visited}/{m.geoRep.forms} · <span style={{ color: '#0891b2', fontWeight: 600 }}>{m.geoRep.avgCompliance}%</span></div>
                    {m.geoRep.submissions > m.geoRep.visited && (
                      <div title={`${m.geoRep.submissions} submissions but only ${m.geoRep.visited} visits recorded`}
                        style={{ fontSize: '9px', fontWeight: 700, color: '#f97316', backgroundColor: '#fff7ed', borderRadius: '4px', padding: '1px 5px', marginTop: '1px' }}>
                        ⚠ {m.geoRep.submissions} sub
                      </div>
                    )}
                  </>
                ) : <span style={{ color: '#cbd5e1', fontSize: '13px' }}>—</span>}
              </div>
              <div style={{ textAlign: 'center' }}>
                {hasData ? <span style={{ fontSize: '15px', fontWeight: 700, color: ovColor }}>{m.overallRate}%</span> : <span style={{ color: '#e2e8f0' }}>—</span>}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '16px', textAlign: 'right' }}>{hasData ? '›' : ''}</div>
            </div>
          );
        })}
      </div>

      {/* Client forms (collapsible) */}
      {clientSummary.length > 0 && (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden', marginTop: '16px' }}>
          <button onClick={() => setShowClients(!showClients)} style={{ width: '100%', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>Client Form Performance <span style={{ color: '#94a3b8', fontWeight: 400 }}>(Geo Rep · {clientSummary.length} forms)</span></span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{showClients ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showClients && clientSummary.map((c, i) => (
            <div key={c.formName} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px 130px', padding: '9px 18px', borderTop: '1px solid #f8fafc', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{c.formName}</div>
              <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center' }}>{c.total}</div>
              <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600, textAlign: 'center' }}>{c.visited}</div>
              <div style={{ textAlign: 'center' }}><span style={{ fontSize: '12px', fontWeight: 700, color: rateColor(c.visitRate) }}>{c.visitRate}%</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ flex: 1, height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}><div style={{ width: `${c.avgCompliance}%`, height: '100%', backgroundColor: rateColor(c.avgCompliance) }} /></div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: c.avgCompliance > 0 ? rateColor(c.avgCompliance) : '#cbd5e1', minWidth: '28px', textAlign: 'right' }}>{c.avgCompliance > 0 ? `${c.avgCompliance}%` : '—'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Managers View ────────────────────────────────────────
function ManagersView({ data, onSelectRep }: { data: PilotReport; onSelectRep: (m: Merchandiser) => void }) {
  const [expandedMgr, setExpandedMgr] = useState<string | null>(null);
  const managerMap = useMemo(() => {
    const map = new Map<string, { name: string; reps: Merchandiser[]; grForms: number; grVisited: number; sfTasks: number; sfDone: number }>();
    data.merchandisers.forEach(m => {
      const key = m.lineManager ? tc(m.lineManager) : 'Unknown';
      if (!map.has(key)) map.set(key, { name: key, reps: [], grForms: 0, grVisited: 0, sfTasks: 0, sfDone: 0 });
      const s = map.get(key)!;
      s.reps.push(m);
      if (m.geoRep) { s.grForms += m.geoRep.forms; s.grVisited += m.geoRep.visited; }
      if (m.stockFix) { s.sfTasks += m.stockFix.tasks; s.sfDone += m.stockFix.completed; }
    });
    return [...map.values()]
      .map(s => ({ ...s, overall: (s.grForms + s.sfTasks) > 0 ? Math.round(((s.grVisited + s.sfDone) / (s.grForms + s.sfTasks)) * 100) : 0 }))
      .sort((a, b) => b.overall - a.overall);
  }, [data.merchandisers]);

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Compliance by Manager</div>
      {managerMap.map((mgr, i) => {
        const st = rateStatus(mgr.overall);
        const expanded = expandedMgr === mgr.name;
        return (
          <div key={mgr.name}>
            <div onClick={() => setExpandedMgr(expanded ? null : mgr.name)}
              style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 80px 90px 100px 30px', padding: '13px 18px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', alignItems: 'center', backgroundColor: expanded ? '#f8fafc' : '#fff', transition: 'background-color 0.12s' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{mgr.name} <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>({mgr.reps.length} reps)</span></div>
              <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600, textAlign: 'center' }}>{mgr.grVisited}/{mgr.grForms}</div>
              <div style={{ fontSize: '12px', color: '#F36C21', fontWeight: 600, textAlign: 'center' }}>{mgr.sfDone}/{mgr.sfTasks}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ flex: 1, height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}><div style={{ width: `${mgr.overall}%`, height: '100%', backgroundColor: rateColor(mgr.overall) }} /></div>
              </div>
              <div style={{ textAlign: 'center' }}><span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '20px', backgroundColor: st.bg, color: st.color }}>{mgr.overall}% · {st.label}</span></div>
              <div style={{ textAlign: 'right', color: '#94a3b8' }}>{expanded ? '▲' : '▼'}</div>
            </div>
            {expanded && mgr.reps.filter(r => r.stockFix || r.geoRep).map(rep => (
              <div key={rep.name} onClick={() => onSelectRep(rep)}
                style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 80px 90px 100px 30px', padding: '10px 18px 10px 36px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', alignItems: 'center', backgroundColor: '#fafafa' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f1f5f9'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#fafafa'}>
                <div style={{ fontSize: '12px', color: '#475569' }}>{tc(rep.name)}</div>
                <div style={{ fontSize: '12px', color: '#2563eb', textAlign: 'center' }}>{rep.geoRep ? `${rep.geoRep.visited}/${rep.geoRep.forms}` : '—'}</div>
                <div style={{ fontSize: '12px', color: '#F36C21', textAlign: 'center' }}>{rep.stockFix ? `${rep.stockFix.completed}/${rep.stockFix.tasks}` : '—'}</div>
                <div />
                <div style={{ textAlign: 'center' }}><span style={{ fontSize: '12px', fontWeight: 700, color: rateColor(rep.overallRate) }}>{rep.overallRate}%</span></div>
                <div style={{ textAlign: 'right', color: '#94a3b8', fontSize: '14px' }}>›</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Regions View ─────────────────────────────────────────
function RegionsView({ data }: { data: PilotReport }) {
  const regionMap = useMemo(() => {
    const map = new Map<string, { name: string; reps: number; grForms: number; grVisited: number; sfTasks: number; sfDone: number }>();
    data.merchandisers.forEach(m => {
      const key = m.region ? tc(m.region) : 'Unknown';
      if (!map.has(key)) map.set(key, { name: key, reps: 0, grForms: 0, grVisited: 0, sfTasks: 0, sfDone: 0 });
      const s = map.get(key)!;
      s.reps++;
      if (m.geoRep) { s.grForms += m.geoRep.forms; s.grVisited += m.geoRep.visited; }
      if (m.stockFix) { s.sfTasks += m.stockFix.tasks; s.sfDone += m.stockFix.completed; }
    });
    return [...map.values()]
      .map(s => ({ ...s, overall: (s.grForms + s.sfTasks) > 0 ? Math.round(((s.grVisited + s.sfDone) / (s.grForms + s.sfTasks)) * 100) : 0 }))
      .sort((a, b) => b.overall - a.overall);
  }, [data.merchandisers]);

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>Compliance by Region</div>
      {regionMap.map((reg, i) => {
        const st = rateStatus(reg.overall);
        return (
          <div key={reg.name} style={{ display: 'grid', gridTemplateColumns: '1.5fr 80px 80px 1fr 120px', padding: '14px 18px', borderBottom: i < regionMap.length - 1 ? '1px solid #f8fafc' : 'none', alignItems: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{reg.name} <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>({reg.reps} reps)</span></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>Geo Rep</div><div style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb' }}>{reg.grVisited}/{reg.grForms}</div></div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: '11px', color: '#94a3b8' }}>StockFix</div><div style={{ fontSize: '13px', fontWeight: 700, color: '#F36C21' }}>{reg.sfDone}/{reg.sfTasks}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px' }}>
              <div style={{ flex: 1, height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}><div style={{ width: `${reg.overall}%`, height: '100%', backgroundColor: rateColor(reg.overall) }} /></div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: rateColor(reg.overall), minWidth: '38px' }}>{reg.overall}%</span>
            </div>
            <div style={{ textAlign: 'right' }}><span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', backgroundColor: st.bg, color: st.color }}>{st.label}</span></div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Store View (drill-down) ──────────────────────────────
function StoreView({ merch, onSelectStore, onBack }: { merch: Merchandiser; onSelectStore: (s: string) => void; onBack: () => void }) {
  const sfMap = new Map((merch.stockFix?.stores || []).map(s => [s.name, s]));
  const grMap = new Map((merch.geoRep?.stores || []).map(s => [s.name, s]));
  const storeNames = [...new Set([...sfMap.keys(), ...grMap.keys()])].sort();
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
        {merch.geoRep && (
          <div style={{ textAlign: 'center', padding: '12px 20px', backgroundColor: '#dbeafe', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: rateColor(merch.geoRep.visitRate) }}>{merch.geoRep.visitRate}%</div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' as const }}>Geo Rep</span>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>{merch.geoRep.visited}/{merch.geoRep.forms} forms</div>
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 160px 160px 20px', padding: '10px 18px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
          {['Store', 'StockFix', 'Geo Rep', ''].map((h, i) => (
            <div key={h + i} style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.07em', textAlign: i >= 1 ? 'center' : 'left' as any }}>{h}</div>
          ))}
        </div>
        {storeNames.map((sn, idx) => {
          const sf = sfMap.get(sn); const gr = grMap.get(sn);
          return (
            <div key={sn} data-testid={`row-store-${sn}`} onClick={() => onSelectStore(sn)}
              style={{ display: 'grid', gridTemplateColumns: '2fr 160px 160px 20px', padding: '13px 18px', borderBottom: idx < storeNames.length - 1 ? '1px solid #f8fafc' : 'none', cursor: 'pointer', alignItems: 'center', transition: 'background-color 0.12s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#fff'}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{tc(sn)}</div>
              <div style={{ textAlign: 'center' }}>
                {sf ? <><span style={{ fontSize: '14px', fontWeight: 700, color: rateColor(sf.captureRate) }}>{sf.captureRate}%</span><div style={{ fontSize: '10px', color: '#94a3b8' }}>{sf.completed}/{sf.tasks}</div></> : <span style={{ color: '#e2e8f0' }}>—</span>}
              </div>
              <div style={{ textAlign: 'center' }}>
                {gr ? <><span style={{ fontSize: '14px', fontWeight: 700, color: rateColor(gr.visitRate) }}>{gr.visitRate}%</span><div style={{ fontSize: '10px', color: '#94a3b8' }}>{gr.visited}/{gr.forms}</div></> : <span style={{ color: '#e2e8f0' }}>—</span>}
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
  const grStore = merch.geoRep?.stores.find(s => s.name === storeName) || null;
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
  const card: React.CSSProperties = { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: '16px' };

  return (
    <div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '13px', padding: '0 0 14px' }}>← {tc(merch.name)}</button>
      {sfStore && (
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
      )}
      {grStore && (
        <div style={card}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '8px', backgroundColor: '#dbeafe' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', backgroundColor: '#bfdbfe', color: '#2563eb' }}>GEO REP</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{grStore.forms} forms · {tc(storeName)}</span>
            </div>
            <div style={{ display: 'flex', gap: '14px' }}>
              <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600 }}>{grStore.visited} visited</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{grStore.forms - grStore.visited} not visited</span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: rateColor(grStore.visitRate) }}>{grStore.visitRate}%</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 80px 110px', padding: '8px 18px', backgroundColor: '#f8fafc' }}>
            {['Form / Client', 'Date', 'Visited', 'Compliance'].map((h, i) => <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, textAlign: i >= 2 ? 'center' : 'left' as any }}>{h}</div>)}
          </div>
          {grStore.formDetails.map((f, i) => (
            <div key={f.formName + i} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 80px 110px', padding: '10px 18px', borderTop: '1px solid #f8fafc', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{f.formName}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{f.date}</div>
              <div style={{ textAlign: 'center' }}><span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', backgroundColor: f.visited ? '#dbeafe' : '#fee2e2', color: f.visited ? '#2563eb' : '#dc2626' }}>{f.visited ? 'Yes' : 'No'}</span></div>
              <div style={{ textAlign: 'center' }}>{f.compliance !== null ? <span style={{ fontSize: '12px', fontWeight: 700, color: rateColor(f.compliance) }}>{f.compliance}%</span> : <span style={{ color: '#cbd5e1' }}>—</span>}</div>
            </div>
          ))}
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
  const isOverviewScreen = navSection === 'overview' && view === 'list';

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
    if (navSection === 'overview')  return <OverviewDashboard data={data} recentActivity={recentData?.activity || []} onSelectRep={handleSelectRep} />;
    if (navSection === 'georep')    return <RepsView data={data} onSelect={handleSelectRep} sourceFilter="georep" />;
    if (navSection === 'stockfix')  return <RepsView data={data} onSelect={handleSelectRep} sourceFilter="stockfix" />;
    if (navSection === 'stores')    return <OverviewDashboard data={data} recentActivity={recentData?.activity || []} onSelectRep={handleSelectRep} />;
    if (navSection === 'managers')  return <ManagersView data={data} onSelectRep={handleSelectRep} />;
    if (navSection === 'regions')   return <RegionsView data={data} />;
    if (navSection === 'reports')   return <RepsView data={data} onSelect={handleSelectRep} />;
    if (navSection === 'alerts')    return <RepsView data={data} onSelect={handleSelectRep} sourceFilter="action" />;
    return null;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#f0f4f8', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Sidebar active={navSection} onNav={s => { setNavSection(s); setView('list'); }} latestWeek={data?.latestWeek || null} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

        {/* ── Header (55px) ── */}
        <div style={{ flexShrink: 0, height: '55px', backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>Merchandiser Pilot Dashboard</div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              Geo Rep &amp; Stock Fix Monitoring
              {lastUpdated && <span style={{ marginLeft: '8px' }}>· Updated {lastUpdated}</span>}
            </div>
          </div>
          {data?.latestWeek && (
            <span style={{ backgroundColor: '#f1f5f9', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 500, color: '#64748b', flexShrink: 0 }}>
              Week: {data.latestWeek}
            </span>
          )}
        </div>

        {/* ── Filter bar (44px, list views only) ── */}
        {view === 'list' && data && (
          <div style={{ flexShrink: 0, height: '44px', backgroundColor: '#fff', borderBottom: '1px solid #f1f5f9', padding: '0 24px', display: 'flex', alignItems: 'center' }}>
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
          padding: isOverviewScreen ? '10px 20px' : '20px 24px',
          overflow: isOverviewScreen ? 'hidden' : 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8', fontSize: '14px' }}>
              Loading report — fetching SharePoint &amp; StockFix data…
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
