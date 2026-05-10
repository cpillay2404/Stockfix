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
          style={{
            textAlign: 'left', padding: '7px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: value === '' ? 700 : 400,
            backgroundColor: value === '' ? '#F36C21' : 'rgba(255,255,255,0.06)',
            color: value === '' ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
            transition: 'all 0.15s',
          }}
        >
          All {label}s
        </button>
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt === value ? '' : opt)}
            style={{
              textAlign: 'left', padding: '7px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: opt === value ? 700 : 400,
              backgroundColor: opt === value ? '#F36C21' : 'rgba(255,255,255,0.06)',
              color: opt === value ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
              transition: 'all 0.15s',
            }}
          >
            {toTitleCase(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MerchandiserPilot() {
  const [manager, setManager] = useState('');
  const [region, setRegion] = useState('');
  const [store, setStore] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
                    Filters will appear once rep task data is imported
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
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

          {data && (
            <>
              {/* Active filter chips */}
              {hasActiveFilter && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                  {manager && (
                    <div style={{ backgroundColor: 'rgba(243,108,33,0.2)', border: '1px solid #F36C21', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', color: '#F36C21', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Manager: {toTitleCase(manager)}
                      <span onClick={() => setManager('')} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
                    </div>
                  )}
                  {region && (
                    <div style={{ backgroundColor: 'rgba(243,108,33,0.2)', border: '1px solid #F36C21', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', color: '#F36C21', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Region: {toTitleCase(region)}
                      <span onClick={() => setRegion('')} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
                    </div>
                  )}
                  {store && (
                    <div style={{ backgroundColor: 'rgba(243,108,33,0.2)', border: '1px solid #F36C21', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', color: '#F36C21', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Store: {toTitleCase(store)}
                      <span onClick={() => setStore('')} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
                    </div>
                  )}
                </div>
              )}

              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '18px 16px', border: '1px solid rgba(243,108,33,0.35)', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', fontWeight: 700, color: '#F36C21', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{data.summary.overallRate}%</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capture Rate</div>
                </div>
                <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '18px 16px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{data.summary.totalCompleted}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Completed</div>
                </div>
                <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '18px 16px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{data.summary.totalTasks}</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned</div>
                </div>
                <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '18px 16px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                    {data.summary.activeReps}<span style={{ fontSize: '18px', color: 'rgba(255,255,255,0.3)' }}>/{data.summary.totalPilotReps}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Reps</div>
                </div>
              </div>

              {/* Rep Table */}
              <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(243,108,33,0.2)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Rep Performance</span>
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{data.reps.length} reps · sorted by capture rate</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 70px 150px', padding: '9px 18px', backgroundColor: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {['Rep Name', 'Assigned', 'Done', 'Pending', 'Capture Rate'].map((h, i) => (
                    <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i > 0 && i < 4 ? 'center' : 'left' }}>{h}</div>
                  ))}
                </div>

                {data.reps.length === 0 && (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
                    No reps match the selected filters
                  </div>
                )}

                {data.reps.map((rep, index) => (
                  <div
                    key={rep.repName}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 70px 70px 70px 150px',
                      padding: '13px 18px',
                      borderBottom: index < data.reps.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.1)',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{toTitleCase(rep.repName)}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {rep.region && <span>{toTitleCase(rep.region)}</span>}
                        {rep.lineManager && <span style={{ color: 'rgba(255,255,255,0.2)' }}>· {toTitleCase(rep.lineManager)}</span>}
                        {!rep.region && rep.totalTasks === 0 && <span>No tasks this week</span>}
                        {rep.lastCapture && <span style={{ color: 'rgba(255,255,255,0.2)' }}>· Last: {formatDate(rep.lastCapture)}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.75)', textAlign: 'center' }}>{rep.totalTasks || '—'}</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: rep.completed > 0 ? '#F36C21' : 'rgba(255,255,255,0.25)', textAlign: 'center' }}>{rep.completed || '—'}</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: rep.pending > 0 ? '#f59e0b' : 'rgba(255,255,255,0.25)', textAlign: 'center' }}>{rep.pending || '—'}</div>
                    <div style={{ paddingRight: '6px' }}>
                      {rep.totalTasks > 0 ? <CaptureBar rate={rep.captureRate} /> : <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.18)' }}>No data</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '11px', color: 'rgba(255,255,255,0.2)' }}>
                Powered by Meridian Nexus · StockFix Pilot Programme
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
