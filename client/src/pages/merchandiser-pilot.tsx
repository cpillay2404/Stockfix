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
    <div style={{ minHeight: '100vh', backgroundColor: '#002855', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#001e40', borderBottom: '2px solid #F36C21', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img src={meridianGroupLogo} alt="Meridian Group" style={{ height: '36px' }} />
          <div style={{ width: '1px', height: '36px', backgroundColor: 'rgba(243,108,33,0.4)' }} />
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>Merchandiser Pilot</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Task Execution Report</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {data?.latestWeek && (
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>Week ending: <strong style={{ color: '#F36C21' }}>{data.latestWeek}</strong></div>
          )}
          {lastRefreshed && (
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>Refreshed: {lastRefreshed} · auto every 5 min</div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '28px 16px' }}>

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
            {/* KPI Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '28px' }}>
              <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '22px 20px', border: '1px solid rgba(243,108,33,0.3)', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', fontWeight: 700, color: '#F36C21', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{data.summary.overallRate}%</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Overall Capture Rate</div>
              </div>
              <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '22px 20px', border: '1px solid rgba(243,108,33,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{data.summary.totalCompleted}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tasks Completed</div>
              </div>
              <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '22px 20px', border: '1px solid rgba(243,108,33,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{data.summary.totalTasks}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Tasks Assigned</div>
              </div>
              <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '22px 20px', border: '1px solid rgba(243,108,33,0.2)', textAlign: 'center' }}>
                <div style={{ fontSize: '40px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {data.summary.activeReps}<span style={{ fontSize: '20px', color: 'rgba(255,255,255,0.35)' }}>/{data.summary.totalPilotReps}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Reps</div>
              </div>
            </div>

            {/* Rep Table */}
            <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(243,108,33,0.2)', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>Rep Performance</span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{data.reps.length} pilot reps · sorted by capture rate</span>
              </div>

              {/* Table Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 160px', padding: '10px 20px', backgroundColor: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Rep Name</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Assigned</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Done</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>Pending</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Capture Rate</div>
              </div>

              {data.reps.map((rep, index) => (
                <div
                  key={rep.repName}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 80px 80px 160px',
                    padding: '14px 20px',
                    borderBottom: index < data.reps.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.12)',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#FFFFFF' }}>{toTitleCase(rep.repName)}</div>
                    {rep.lastCapture && (
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>Last active: {formatDate(rep.lastCapture)}</div>
                    )}
                    {!rep.lastCapture && rep.totalTasks === 0 && (
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '2px' }}>No tasks this week</div>
                    )}
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(255,255,255,0.8)', textAlign: 'center' }}>{rep.totalTasks || '—'}</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: rep.completed > 0 ? '#F36C21' : 'rgba(255,255,255,0.3)', textAlign: 'center' }}>{rep.completed || '—'}</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: rep.pending > 0 ? '#f59e0b' : 'rgba(255,255,255,0.3)', textAlign: 'center' }}>{rep.pending || '—'}</div>
                  <div style={{ paddingRight: '8px' }}>
                    {rep.totalTasks > 0 ? <CaptureBar rate={rep.captureRate} /> : <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.2)' }}>No data</span>}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '11px', color: 'rgba(255,255,255,0.25)' }}>
              Powered by Meridian Nexus · StockFix Pilot Programme
            </div>
          </>
        )}
      </div>
    </div>
  );
}
