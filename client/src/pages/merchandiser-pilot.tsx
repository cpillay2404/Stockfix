import { useQuery } from "@tanstack/react-query";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";

interface RepStat {
  repName: string;
  totalTasks: number;
  completed: number;
  pending: number;
  captureRate: number;
  lastCapture: string | null;
}

interface PilotReport {
  latestWeek: string | null;
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
  const color = rate >= 80 ? '#22c55e' : rate >= 50 ? '#f97316' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${rate}%`, height: '100%', backgroundColor: color, borderRadius: '4px', transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: '13px', fontWeight: 600, color, minWidth: '36px', textAlign: 'right' }}>{rate}%</span>
    </div>
  );
}

export default function MerchandiserPilot() {
  const { data, isLoading, error, dataUpdatedAt } = useQuery<PilotReport>({
    queryKey: ['pilot-report'],
    queryFn: async () => {
      const res = await fetch('/api/pilot-report');
      if (!res.ok) throw new Error('Failed to load pilot report');
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60000,
  });

  const lastRefreshed = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('en-ZA') : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#003B71', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img src={meridianGroupLogo} alt="Meridian Group" style={{ height: '36px' }} />
          <div style={{ width: '1px', height: '36px', backgroundColor: 'rgba(255,255,255,0.3)' }} />
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>Merchandiser Pilot</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Task Execution Report</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {data?.latestWeek && (
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>Week ending: <strong style={{ color: '#F36C21' }}>{data.latestWeek}</strong></div>
          )}
          {lastRefreshed && (
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Last refreshed: {lastRefreshed} · auto-refreshes every 5 min</div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px' }}>

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
            <div style={{ fontSize: '16px' }}>Loading pilot report...</div>
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#ef4444' }}>
            <div style={{ fontSize: '16px' }}>Failed to load report. Please refresh.</div>
          </div>
        )}

        {data && (
          <>
            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' }}>
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', textAlign: 'center' }}>
                <div style={{ fontSize: '36px', fontWeight: 700, color: '#003B71', fontVariantNumeric: 'tabular-nums' }}>{data.summary.overallRate}%</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Overall Capture Rate</div>
              </div>
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', textAlign: 'center' }}>
                <div style={{ fontSize: '36px', fontWeight: 700, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{data.summary.totalCompleted}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Tasks Completed</div>
              </div>
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', textAlign: 'center' }}>
                <div style={{ fontSize: '36px', fontWeight: 700, color: '#F36C21', fontVariantNumeric: 'tabular-nums' }}>{data.summary.totalTasks}</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Total Tasks Assigned</div>
              </div>
              <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', textAlign: 'center' }}>
                <div style={{ fontSize: '36px', fontWeight: 700, color: '#003B71', fontVariantNumeric: 'tabular-nums' }}>{data.summary.activeReps}<span style={{ fontSize: '18px', color: '#94a3b8' }}>/{data.summary.totalPilotReps}</span></div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>Active Reps</div>
              </div>
            </div>

            {/* Rep Table */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#003B71' }}>Rep Performance</span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{data.reps.length} pilot reps · sorted by capture rate</span>
              </div>

              {/* Table Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 160px', gap: '0', padding: '10px 20px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Rep Name</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center' }}>Assigned</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center' }}>Done</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center' }}>Pending</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Capture Rate</div>
              </div>

              {data.reps.map((rep, index) => (
                <div
                  key={rep.repName}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 80px 80px 160px',
                    gap: '0',
                    padding: '14px 20px',
                    borderBottom: index < data.reps.length - 1 ? '1px solid #f1f5f9' : 'none',
                    backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#fafafa',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#1e293b' }}>{toTitleCase(rep.repName)}</div>
                    {rep.lastCapture && (
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Last active: {formatDate(rep.lastCapture)}</div>
                    )}
                    {!rep.lastCapture && rep.totalTasks === 0 && (
                      <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>No tasks this week</div>
                    )}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#334155', textAlign: 'center' }}>{rep.totalTasks || '—'}</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#22c55e', textAlign: 'center' }}>{rep.completed || '—'}</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: rep.pending > 0 ? '#f97316' : '#94a3b8', textAlign: 'center' }}>{rep.pending || '—'}</div>
                  <div style={{ paddingRight: '8px' }}>
                    {rep.totalTasks > 0 ? <CaptureBar rate={rep.captureRate} /> : <span style={{ fontSize: '13px', color: '#cbd5e1' }}>No data</span>}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: '#94a3b8' }}>
              Powered by Meridian Nexus · StockFix Pilot Programme
            </div>
          </>
        )}
      </div>
    </div>
  );
}
