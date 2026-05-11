import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  submissionCount: number;
}

interface ClientStat {
  formName: string;
  total: number;
  visited: number;
  visitRate: number;
  avgCompliance: number;
}

interface WeekSnapshot {
  weekEndingDate: string;
  repCount: number;
  totalTasks: number;
  totalCompleted: number;
  captureRate: number;
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
  clientSummary: ClientStat[];
  history: WeekSnapshot[];
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
  const { summary, reps, history = [], clientSummary = [] } = data;
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

      {/* Client / Form Performance */}
      {clientSummary.length > 0 && (
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(243,108,33,0.2)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Client Form Performance</span>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{clientSummary.length} forms · from Customer Compliance</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 90px 130px', padding: '8px 18px', backgroundColor: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {['Client / Form', 'Total', 'Done', 'Visit %', 'Avg Compliance'].map((h, i) => (
              <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i > 0 ? 'center' : 'left' }}>{h}</div>
            ))}
          </div>
          {clientSummary.map((c, index) => {
            const visitColor = c.visitRate >= 80 ? '#F36C21' : c.visitRate >= 50 ? '#f59e0b' : '#ef4444';
            const compColor  = c.avgCompliance >= 80 ? '#F36C21' : c.avgCompliance >= 50 ? '#f59e0b' : '#ef4444';
            return (
              <div key={c.formName} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 90px 130px', padding: '10px 18px', borderBottom: index < clientSummary.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.08)', alignItems: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF', paddingRight: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.formName}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>{c.total}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: c.visited > 0 ? '#F36C21' : 'rgba(255,255,255,0.2)', textAlign: 'center' }}>{c.visited}</div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: visitColor }}>{c.visitRate}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '4px' }}>
                  <div style={{ flex: 1, height: '5px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${c.avgCompliance}%`, height: '100%', backgroundColor: compColor, borderRadius: '3px' }} />
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: c.avgCompliance > 0 ? compColor : 'rgba(255,255,255,0.2)', minWidth: '32px', textAlign: 'right' }}>{c.avgCompliance > 0 ? `${c.avgCompliance}%` : '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {summary.totalTasks === 0 && history.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.3)', fontSize: '14px' }}>
          Summary will populate once merchandiser task data is imported for the current week
        </div>
      )}

      {/* Rolling weekly history */}
      {history.length > 0 && (
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(243,108,33,0.2)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>Weekly History</span>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginLeft: '10px' }}>saved automatically · last {history.length} weeks</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 140px', padding: '8px 18px', backgroundColor: 'rgba(0,0,0,0.2)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {['Week Ending', 'Assigned', 'Done', 'Active', 'Capture Rate'].map((h, i) => (
              <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i > 0 && i < 4 ? 'center' : 'left' }}>{h}</div>
            ))}
          </div>
          {history.map((week, index) => {
            const isCurrentWeek = week.weekEndingDate === data.latestWeek;
            const rateColor = week.captureRate >= 80 ? '#F36C21' : week.captureRate >= 50 ? '#f59e0b' : '#ef4444';
            return (
              <div
                key={week.weekEndingDate}
                style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 140px', padding: '12px 18px', borderBottom: index < history.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', backgroundColor: isCurrentWeek ? 'rgba(243,108,33,0.07)' : index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.08)', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: isCurrentWeek ? 700 : 500, color: isCurrentWeek ? '#F36C21' : '#FFFFFF' }}>{week.weekEndingDate}</span>
                  {isCurrentWeek && <span style={{ fontSize: '10px', backgroundColor: '#F36C21', color: '#FFFFFF', borderRadius: '10px', padding: '1px 7px', fontWeight: 700 }}>Current</span>}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{week.totalTasks}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#F36C21', textAlign: 'center' }}>{week.totalCompleted}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{week.repCount}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '6px' }}>
                  <div style={{ flex: 1, height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${week.captureRate}%`, height: '100%', backgroundColor: rateColor, borderRadius: '3px' }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: rateColor, minWidth: '36px', textAlign: 'right' }}>{week.captureRate}%</span>
                </div>
              </div>
            );
          })}
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
  const [uploadPreview, setUploadPreview] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadPreview(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/pilot-excel-upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setUploadPreview(data);
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {data?.latestWeek && (
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', textAlign: 'right' }}>
              Week ending: <strong style={{ color: '#F36C21' }}>{data.latestWeek}</strong>
              {lastRefreshed && <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>Refreshed: {lastRefreshed} · auto every 5 min</div>}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ backgroundColor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '8px 14px', color: '#FFFFFF', cursor: uploading ? 'wait' : 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', opacity: uploading ? 0.6 : 1 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {uploading ? 'Reading...' : 'Import Excel'}
          </button>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{ backgroundColor: sidebarOpen ? '#F36C21' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', padding: '8px 14px', color: '#FFFFFF', cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            Filters{activeFilterCount > 0 && <span style={{ backgroundColor: '#FFFFFF', color: '#F36C21', borderRadius: '10px', padding: '0 6px', fontSize: '11px' }}>{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      {/* Upload error */}
      {uploadError && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderBottom: '1px solid rgba(239,68,68,0.3)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', color: '#ef4444' }}>Upload error: {uploadError}</span>
          <button onClick={() => setUploadError(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>×</button>
        </div>
      )}

      {/* Upload preview panel */}
      {uploadPreview && (
        <div style={{ backgroundColor: '#001e40', borderBottom: '1px solid rgba(243,108,33,0.3)', padding: '16px 20px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>File Preview</span>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginLeft: '10px' }}>{uploadPreview.sheetNames.length} tab{uploadPreview.sheetNames.length !== 1 ? 's' : ''} found: {uploadPreview.sheetNames.join(', ')}</span>
              </div>
              <button onClick={() => setUploadPreview(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>×</button>
            </div>
            {uploadPreview.sheetNames.map((sheetName: string) => {
              const sheet = uploadPreview.sheets[sheetName];
              return (
                <div key={sheetName} style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#F36C21', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tab: {sheetName}</div>
                  <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                          {sheet.headers.map((h: string, i: number) => (
                            <th key={i} style={{ padding: '6px 10px', color: 'rgba(255,255,255,0.5)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.05)' }}>{h || `Col ${i+1}`}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.rows.map((row: any[], ri: number) => (
                          <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.15)' }}>
                            {sheet.headers.map((_: string, ci: number) => (
                              <td key={ci} style={{ padding: '5px 10px', color: 'rgba(255,255,255,0.7)', borderRight: '1px solid rgba(255,255,255,0.04)', whiteSpace: 'nowrap' }}>
                                {row[ci] instanceof Date ? row[ci].toLocaleDateString('en-ZA') : String(row[ci] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', marginTop: '4px' }}>Showing first {sheet.rows.length} data rows · {sheet.headers.length} columns</div>
                </div>
              );
            })}
            <div style={{ marginTop: '8px', padding: '10px', backgroundColor: 'rgba(243,108,33,0.08)', borderRadius: '8px', border: '1px solid rgba(243,108,33,0.2)', fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
              Share the column names above so we can map them and complete the import.
            </div>
          </div>
        </div>
      )}

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
