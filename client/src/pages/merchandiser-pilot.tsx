import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";

interface RepStat {
  repName: string;
  lineManager: string | null;
  region: string | null;
  storeCount: number;
  totalTasks: number;
  completed: number;
  pending: number;
  captureRate: number;
  lastCapture: string | null;
}

interface PilotReport {
  latestWeek: string | null;
  filters: {
    managers: string[];
    regions: string[];
    stores: string[];
    active: { manager: string | null; region: string | null; store: string | null };
  };
  summary: {
    totalTasks: number;
    totalCompleted: number;
    overallRate: number;
    activeReps: number;
    totalPilotReps: number;
  };
  reps: RepStat[];
}

function toTitleCase(str: string) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CaptureBar({ rate }: { rate: number }) {
  const color = rate >= 80 ? '#F36C21' : rate >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '8px', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${rate}%`, height: '100%', backgroundColor: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: 700, color, minWidth: '36px', textAlign: 'right' }}>{rate}%</span>
    </div>
  );
}

function FilterSection({ label, options, value, onChange }: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <button
          onClick={() => onChange('')}
          style={{ textAlign: 'left', padding: '7px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: value === '' ? 700 : 400, backgroundColor: value === '' ? '#F36C21' : 'rgba(255,255,255,0.06)', color: value === '' ? '#FFFFFF' : 'rgba(255,255,255,0.6)', transition: 'all 0.15s' }}
        >
          All {label}s
        </button>
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt === value ? '' : opt)}
            style={{ textAlign: 'left', padding: '7px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: opt === value ? 700 : 400, backgroundColor: opt === value ? '#F36C21' : 'rgba(255,255,255,0.06)', color: opt === value ? '#FFFFFF' : 'rgba(255,255,255,0.6)', transition: 'all 0.15s' }}
          >
            {toTitleCase(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryTab({ data }: { data: PilotReport }) {
  const { summary, reps } = data;
  const totalPending = summary.totalTasks - summary.totalCompleted;
  const top3 = reps.filter(r => r.totalTasks > 0).slice(0, 3);
  const bottom3 = [...reps].filter(r => r.totalTasks > 0).sort((a, b) => a.captureRate - b.captureRate).slice(0, 3);
  const noData = reps.filter(r => r.totalTasks === 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Big KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '22px 16px', border: '2px solid rgba(243,108,33,0.5)', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', fontWeight: 700, color: '#F36C21', lineHeight: 1 }}>{summary.overallRate}%</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overall Capture Rate</div>
        </div>
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '22px 16px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>{summary.totalCompleted}</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tasks Completed</div>
        </div>
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '22px 16px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', fontWeight: 700, color: totalPending > 0 ? '#f59e0b' : '#FFFFFF', lineHeight: 1 }}>{totalPending}</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tasks Pending</div>
        </div>
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '22px 16px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
          <div style={{ fontSize: '44px', fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>
            {summary.activeReps}<span style={{ fontSize: '20px', color: 'rgba(255,255,255,0.3)' }}>/{summary.totalPilotReps}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Active Merchandisers</div>
        </div>
      </div>

      {/* Top / Bottom performers side by side */}
      {(top3.length > 0 || bottom3.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Top performers */}
          <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(243,108,33,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🏆</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Top Performers</span>
            </div>
            {top3.map((r, i) => (
              <div key={r.repName} style={{ padding: '12px 16px', borderBottom: i < top3.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#F36C21', minWidth: '16px' }}>#{i + 1}</span>
                  <div>
                    <div style={{ fontSize: '13px', color: '#FFFFFF', fontWeight: 500 }}>{toTitleCase(r.repName)}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{r.completed}/{r.totalTasks} tasks</div>
                  </div>
                </div>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#F36C21' }}>{r.captureRate}%</span>
              </div>
            ))}
            {top3.length === 0 && <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>No data yet</div>}
          </div>

          {/* Needs attention */}
          <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Needs Attention</span>
            </div>
            {bottom3.map((r, i) => (
              <div key={r.repName} style={{ padding: '12px 16px', borderBottom: i < bottom3.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '13px', color: '#FFFFFF', fontWeight: 500 }}>{toTitleCase(r.repName)}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{r.completed}/{r.totalTasks} tasks</div>
                </div>
                <span style={{ fontSize: '16px', fontWeight: 700, color: r.captureRate < 50 ? '#ef4444' : '#f59e0b' }}>{r.captureRate}%</span>
              </div>
            ))}
            {bottom3.length === 0 && <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>No data yet</div>}
          </div>
        </div>
      )}

      {/* Not yet active */}
      {noData.length > 0 && (
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
            Not Yet Active This Week ({noData.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {noData.map(r => (
              <span key={r.repName} style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>
                {toTitleCase(r.repName)}
              </span>
            ))}
          </div>
        </div>
      )}

      {summary.totalTasks === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
          Summary will populate once merchandiser task data is imported for the current week
        </div>
      )}
    </div>
  );
}

export default function MerchandiserPilot() {
  const [manager, setManager] = useState('');
  const [region, setRegion] = useState('');
  const [store, setStore] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'detail'>('summary');

  const params = new URLSearchParams();
  if (manager) params.set('manager', manager);
  if (region) params.set('region', region);
  if (store) params.set('store', store);
  const queryString = params.toString();

  const { data, isLoading, error, dataUpdatedAt } = useQuery<PilotReport>({
    queryKey: ['pilot-report', manager, region, store],
    queryFn: async () => {
      const res = await fetch(`/api/pilot-report${queryString ? `?${queryString}` : ''}`);
      if (!res.ok) throw new Error('Failed to load pilot report');
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60000,
  });

  const lastRefreshed = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('en-ZA') : null;
  const hasActiveFilter = !!(manager || region || store);
  const activeFilterCount = [manager, region, store].filter(Boolean).length;
  const clearAll = () => { setManager(''); setRegion(''); setStore(''); };

  const tabStyle = (tab: 'summary' | 'detail') => ({
    padding: '8px 20px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    backgroundColor: activeTab === tab ? '#F36C21' : 'rgba(255,255,255,0.07)',
    color: activeTab === tab ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#002855', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#001e40', borderBottom: '2px solid #F36C21', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src={meridianGroupLogo} alt="Meridian Group" style={{ height: '34px' }} />
          <div style={{ width: '1px', height: '34px', backgroundColor: 'rgba(243,108,33,0.4)' }} />
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: '#FFFFFF' }}>Merchandiser Pilot</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Task Execution Report</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {data?.latestWeek && (
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', textAlign: 'right' }}>
              Week ending: <strong style={{ color: '#F36C21' }}>{data.latestWeek}</strong>
              {lastRefreshed && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>Refreshed: {lastRefreshed} · auto every 5 min</div>}
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{ backgroundColor: sidebarOpen ? '#F36C21' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', padding: '8px 14px', color: '#FFFFFF', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            Filters{activeFilterCount > 0 && <span style={{ backgroundColor: '#FFFFFF', color: '#F36C21', borderRadius: '10px', padding: '0 6px', fontSize: '11px' }}>{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', maxWidth: '1100px', margin: '0 auto', padding: '24px 16px', gap: '20px', alignItems: 'flex-start' }}>

        {/* Sidebar */}
        {sidebarOpen && (
          <div style={{ width: '200px', flexShrink: 0, backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(243,108,33,0.2)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Filters</span>
              {hasActiveFilter && (
                <button onClick={clearAll} style={{ fontSize: '11px', color: '#F36C21', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear all</button>
              )}
            </div>
            {isLoading && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>Loading...</div>}
            {data && (
              <>
                {(data.filters?.managers ?? []).length > 0 && (
                  <FilterSection label="Manager" options={data.filters.managers} value={manager} onChange={v => { setManager(v); setStore(''); }} />
                )}
                {(data.filters?.regions ?? []).length > 0 && (
                  <FilterSection label="Region" options={data.filters.regions} value={region} onChange={v => { setRegion(v); setStore(''); }} />
                )}
                {(data.filters?.stores ?? []).length > 0 && (
                  <FilterSection label="Store" options={data.filters.stores} value={store} onChange={setStore} />
                )}
                {(data.filters?.managers ?? []).length === 0 && (data.filters?.regions ?? []).length === 0 && (
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '20px 0' }}>
                    Filters will appear once merchandiser data is imported
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={tabStyle('summary')} onClick={() => setActiveTab('summary')}>Summary</button>
              <button style={tabStyle('detail')} onClick={() => setActiveTab('detail')}>Detail</button>
            </div>
            {/* Active filter chips */}
            {hasActiveFilter && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {manager && (
                  <div style={{ backgroundColor: 'rgba(243,108,33,0.2)', border: '1px solid #F36C21', borderRadius: '20px', padding: '3px 10px', fontSize: '12px', color: '#F36C21', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    Manager: {toTitleCase(manager)} <span onClick={() => setManager('')} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
                  </div>
                )}
                {region && (
                  <div style={{ backgroundColor: 'rgba(243,108,33,0.2)', border: '1px solid #F36C21', borderRadius: '20px', padding: '3px 10px', fontSize: '12px', color: '#F36C21', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    Region: {toTitleCase(region)} <span onClick={() => setRegion('')} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
                  </div>
                )}
                {store && (
                  <div style={{ backgroundColor: 'rgba(243,108,33,0.2)', border: '1px solid #F36C21', borderRadius: '20px', padding: '3px 10px', fontSize: '12px', color: '#F36C21', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    Store: {toTitleCase(store)} <span onClick={() => setStore('')} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {isLoading && (
            <div style={{ textAlign: 'center', padding: '80px', color: 'rgba(255,255,255,0.5)' }}>
              <div style={{ fontSize: '16px' }}>Loading pilot report...</div>
            </div>
          )}
          {error && (
            <div style={{ textAlign: 'center', padding: '80px', color: '#ef4444' }}>
              <div style={{ fontSize: '16px' }}>Failed to load report. Please refresh.</div>
            </div>
          )}

          {data && activeTab === 'summary' && <SummaryTab data={data} />}

          {data && activeTab === 'detail' && (
            <>
              {/* KPI strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                <div style={{ backgroundColor: '#003B71', borderRadius: '10px', padding: '14px', border: '1px solid rgba(243,108,33,0.35)', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#F36C21', lineHeight: 1 }}>{data.summary.overallRate}%</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capture Rate</div>
                </div>
                <div style={{ backgroundColor: '#003B71', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>{data.summary.totalCompleted}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completed</div>
                </div>
                <div style={{ backgroundColor: '#003B71', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>{data.summary.totalTasks}</div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned</div>
                </div>
                <div style={{ backgroundColor: '#003B71', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,0.07)', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>
                    {data.summary.activeReps}<span style={{ fontSize: '16px', color: 'rgba(255,255,255,0.3)' }}>/{data.summary.totalPilotReps}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginTop: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active</div>
                </div>
              </div>

              {/* Merchandiser Table — grouped by Region → Manager */}
              {(() => {
                const COL = '1fr 70px 70px 70px 150px';

                // Build region → manager → reps hierarchy
                const regionMap = new Map<string, Map<string, RepStat[]>>();
                for (const rep of data.reps) {
                  const r = rep.region ? toTitleCase(rep.region) : '— No Region';
                  const m = rep.lineManager ? toTitleCase(rep.lineManager) : '— No Manager';
                  if (!regionMap.has(r)) regionMap.set(r, new Map());
                  const mgMap = regionMap.get(r)!;
                  if (!mgMap.has(m)) mgMap.set(m, []);
                  mgMap.get(m)!.push(rep);
                }
                const regions = [...regionMap.entries()].sort(([a], [b]) => a.localeCompare(b));

                return (
                  <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(243,108,33,0.2)', overflow: 'hidden' }}>
                    {/* Table header */}
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Merchandiser Performance</span>
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{data.reps.length} merchandisers · grouped by region</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '9px 18px', backgroundColor: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {['Merchandiser Name', 'Assigned', 'Done', 'Pending', 'Capture Rate'].map((h, i) => (
                        <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i > 0 && i < 4 ? 'center' : 'left' }}>{h}</div>
                      ))}
                    </div>

                    {data.reps.length === 0 && (
                      <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
                        No merchandisers match the selected filters
                      </div>
                    )}

                    {regions.map(([regionName, mgMap]) => {
                      const managers = [...mgMap.entries()].sort(([a], [b]) => a.localeCompare(b));
                      const regionTotal = managers.flatMap(([, reps]) => reps).reduce((s, r) => s + r.totalTasks, 0);
                      const regionDone = managers.flatMap(([, reps]) => reps).reduce((s, r) => s + r.completed, 0);
                      const regionRate = regionTotal > 0 ? Math.round((regionDone / regionTotal) * 100) : null;

                      return (
                        <div key={regionName}>
                          {/* Region row */}
                          <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '10px 18px', backgroundColor: 'rgba(0,29,60,0.7)', borderTop: '1px solid rgba(243,108,33,0.25)', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'center' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#F36C21', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                              📍 {regionName}
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{regionTotal || '—'}</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: regionDone > 0 ? '#F36C21' : 'rgba(255,255,255,0.25)', textAlign: 'center' }}>{regionDone || '—'}</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>{regionTotal - regionDone > 0 ? regionTotal - regionDone : '—'}</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: regionRate !== null ? (regionRate >= 80 ? '#F36C21' : regionRate >= 50 ? '#f59e0b' : '#ef4444') : 'rgba(255,255,255,0.2)' }}>
                              {regionRate !== null ? `${regionRate}%` : 'No data'}
                            </div>
                          </div>

                          {managers.map(([managerName, reps]) => {
                            const mgTotal = reps.reduce((s, r) => s + r.totalTasks, 0);
                            const mgDone = reps.reduce((s, r) => s + r.completed, 0);
                            const mgRate = mgTotal > 0 ? Math.round((mgDone / mgTotal) * 100) : null;

                            return (
                              <div key={managerName}>
                                {/* Manager row */}
                                <div style={{ display: 'grid', gridTemplateColumns: COL, padding: '8px 18px 8px 28px', backgroundColor: 'rgba(0,0,0,0.25)', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'center' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>└</span> {managerName}
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>{mgTotal || '—'}</div>
                                  <div style={{ fontSize: '11px', color: mgDone > 0 ? 'rgba(243,108,33,0.7)' : 'rgba(255,255,255,0.2)', textAlign: 'center' }}>{mgDone || '—'}</div>
                                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>{mgTotal - mgDone > 0 ? mgTotal - mgDone : '—'}</div>
                                  <div style={{ fontSize: '11px', color: mgRate !== null ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)' }}>
                                    {mgRate !== null ? `${mgRate}%` : '—'}
                                  </div>
                                </div>

                                {/* Merchandiser rows */}
                                {reps.map((rep, ri) => (
                                  <div
                                    key={rep.repName}
                                    style={{ display: 'grid', gridTemplateColumns: COL, padding: '12px 18px 12px 40px', borderBottom: '1px solid rgba(255,255,255,0.03)', backgroundColor: ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.08)', alignItems: 'center' }}
                                  >
                                    <div>
                                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{toTitleCase(rep.repName)}</div>
                                      {rep.lastCapture && (
                                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>Last: {formatDate(rep.lastCapture)}</div>
                                      )}
                                      {rep.totalTasks === 0 && (
                                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', marginTop: '2px' }}>No tasks this week</div>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{rep.totalTasks || '—'}</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: rep.completed > 0 ? '#F36C21' : 'rgba(255,255,255,0.2)', textAlign: 'center' }}>{rep.completed || '—'}</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: rep.pending > 0 ? '#f59e0b' : 'rgba(255,255,255,0.2)', textAlign: 'center' }}>{rep.pending || '—'}</div>
                                    <div style={{ paddingRight: '6px' }}>
                                      {rep.totalTasks > 0 ? <CaptureBar rate={rep.captureRate} /> : <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.15)' }}>No data</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </>
          )}

          {data && (
            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
              Powered by Meridian Nexus · StockFix Pilot Programme
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
