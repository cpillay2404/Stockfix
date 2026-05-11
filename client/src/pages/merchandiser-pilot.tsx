import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

interface PilotReport {
  latestWeek: string | null;
  filters: { managers: string[]; regions: string[]; stores: string[]; active: { manager: string | null; region: string | null; store: string | null } };
  summary: {
    stockFix: { total: number; completed: number; captureRate: number };
    geoRep:   { total: number; visited: number; visitRate: number };
    combined: { total: number; done: number; rate: number };
    activeReps: number;
  };
  merchandisers: Merchandiser[];
  clientSummary: ClientStat[];
  history: WeekSnapshot[];
}

// ─── Helpers ──────────────────────────────────────────────
function tc(s: string) { return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
function rateColor(r: number) { return r >= 80 ? '#F36C21' : r >= 50 ? '#f59e0b' : r > 0 ? '#ef4444' : 'rgba(255,255,255,0.22)'; }

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', backgroundColor: color + '22', color, letterSpacing: '0.06em', textTransform: 'uppercase' as const, border: `1px solid ${color}44` }}>
      {label}
    </span>
  );
}

function MiniBar({ rate, color }: { rate: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: '54px', height: '5px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ width: `${Math.min(rate, 100)}%`, height: '100%', backgroundColor: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '32px' }}>{rate}%</span>
    </div>
  );
}

function Breadcrumb({ items, onBack }: { items: string[]; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' as const }}>
      <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.09)', border: 'none', color: '#FFFFFF', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
        ← Back
      </button>
      {items.map((item, i) => (
        <span key={i} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {i > 0 && <span style={{ color: 'rgba(255,255,255,0.2)' }}>›</span>}
          <span style={{ color: i === items.length - 1 ? '#F36C21' : 'rgba(255,255,255,0.5)' }}>{item}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Merchandiser List View ────────────────────────────────
function MerchandiserListView({ data, onSelect }: { data: PilotReport; onSelect: (m: Merchandiser) => void }) {
  const { summary, merchandisers, history, clientSummary } = data;
  const [showHistory, setShowHistory] = useState(false);
  const [showClients, setShowClients] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(243,108,33,0.4)', textAlign: 'center' }}>
          <div style={{ padding: '8px 16px', backgroundColor: 'rgba(243,108,33,0.12)', borderBottom: '1px solid rgba(243,108,33,0.2)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#F36C21', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>Combined</span>
          </div>
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '44px', fontWeight: 700, color: '#F36C21', lineHeight: 1 }}>{summary.combined.rate}%</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '5px' }}>{summary.combined.done} / {summary.combined.total}</div>
          </div>
        </div>
        <div style={{ backgroundColor: '#002a50', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(243,108,33,0.6)', textAlign: 'center' }}>
          <div style={{ padding: '8px 16px', backgroundColor: '#F36C21' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#FFFFFF', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>StockFix Tasks</span>
          </div>
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '38px', fontWeight: 700, color: '#F36C21', lineHeight: 1 }}>{summary.stockFix.captureRate}%</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '5px' }}>{summary.stockFix.completed} done · {summary.stockFix.total} total</div>
          </div>
        </div>
        <div style={{ backgroundColor: '#001e3a', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(96,165,250,0.5)', textAlign: 'center' }}>
          <div style={{ padding: '8px 16px', backgroundColor: '#2563eb' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#FFFFFF', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>Geo Rep Forms</span>
          </div>
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '38px', fontWeight: 700, color: '#60a5fa', lineHeight: 1 }}>{summary.geoRep.visitRate}%</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '5px' }}>{summary.geoRep.visited} visited · {summary.geoRep.total} total</div>
          </div>
        </div>
      </div>

      {/* Merchandiser table */}
      <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        {/* Source-colour band above columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 140px 140px 80px 20px', backgroundColor: 'rgba(0,0,0,0.35)' }}>
          <div /><div />
          <div style={{ height: '3px', backgroundColor: '#F36C21' }} />
          <div style={{ height: '3px', backgroundColor: '#2563eb' }} />
          <div /><div />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 140px 140px 80px 20px', padding: '8px 16px', backgroundColor: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>Merchandiser</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>Manager / Region</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#F36C21', textTransform: 'uppercase' as const, letterSpacing: '0.07em', textAlign: 'center', backgroundColor: 'rgba(243,108,33,0.08)', padding: '4px 0', borderRadius: '4px' }}>StockFix</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase' as const, letterSpacing: '0.07em', textAlign: 'center', backgroundColor: 'rgba(37,99,235,0.12)', padding: '4px 0', borderRadius: '4px' }}>Geo Rep</div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.07em', textAlign: 'center' }}>Overall</div>
          <div />
        </div>

        {merchandisers.map((m, idx) => {
          const hasData = !!(m.stockFix || m.geoRep);
          const sfColor = rateColor(m.stockFix?.captureRate ?? 0);
          const grColor = rateColor(m.geoRep?.visitRate ?? 0);
          const ovColor = rateColor(m.overallRate);
          return (
            <div
              key={m.name}
              data-testid={`row-merch-${m.name}`}
              onClick={() => hasData && onSelect(m)}
              style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 140px 140px 80px 20px', padding: '11px 16px', borderBottom: idx < merchandisers.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', backgroundColor: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.07)', cursor: hasData ? 'pointer' : 'default', alignItems: 'center', transition: 'background-color 0.15s' }}
              onMouseEnter={e => { if (hasData) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(243,108,33,0.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.07)'; }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: hasData ? '#FFFFFF' : 'rgba(255,255,255,0.28)' }}>{tc(m.name)}</div>
                <div style={{ display: 'flex', gap: '5px', marginTop: '4px', flexWrap: 'wrap' as const }}>
                  {m.stockFix && <Badge label="StockFix" color="#F36C21" />}
                  {m.geoRep   && <Badge label="Geo Rep"  color="#60a5fa" />}
                  {!hasData   && <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.18)' }}>Not yet active</span>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{m.lineManager ? tc(m.lineManager) : '—'}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.28)' }}>{m.region || ''}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px', backgroundColor: 'rgba(243,108,33,0.05)', borderRadius: '6px', padding: '4px 6px' }}>
                {m.stockFix
                  ? <><MiniBar rate={m.stockFix.captureRate} color={sfColor} /><div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)' }}>{m.stockFix.completed}/{m.stockFix.tasks} tasks</div></>
                  : <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.14)' }}>—</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: '2px', backgroundColor: 'rgba(37,99,235,0.07)', borderRadius: '6px', padding: '4px 6px' }}>
                {m.geoRep
                  ? <><MiniBar rate={m.geoRep.visitRate} color={grColor} /><div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)' }}>{m.geoRep.visited}/{m.geoRep.forms} forms</div></>
                  : <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.14)' }}>—</span>}
              </div>
              <div style={{ textAlign: 'center' }}>
                {hasData ? <span style={{ fontSize: '15px', fontWeight: 700, color: ovColor }}>{m.overallRate}%</span> : <span style={{ color: 'rgba(255,255,255,0.1)' }}>—</span>}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '16px', textAlign: 'right' }}>{hasData ? '›' : ''}</div>
            </div>
          );
        })}
      </div>

      {/* Rolling History (collapsible) */}
      {history.length > 0 && (
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <button onClick={() => setShowHistory(!showHistory)} style={{ width: '100%', padding: '13px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Rolling Week History <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>(Geo Rep · {history.length} weeks)</span></span>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{showHistory ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showHistory && history.map((h, i) => (
            <div key={h.weekEndingDate} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.04)', backgroundColor: i % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>{h.weekEndingDate}</span>
              <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{h.repCount} reps</span>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>{h.totalCompleted}/{h.totalTasks}</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: rateColor(h.captureRate) }}>{h.captureRate}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Client Form Performance (collapsible) */}
      {clientSummary.length > 0 && (
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(96,165,250,0.15)', overflow: 'hidden' }}>
          <button onClick={() => setShowClients(!showClients)} style={{ width: '100%', padding: '13px 18px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Client Form Performance <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>(Geo Rep · {clientSummary.length} forms)</span></span>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{showClients ? '▲ Hide' : '▼ Show'}</span>
          </button>
          {showClients && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px 120px', padding: '8px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(0,0,0,0.18)' }}>
                {['Form', 'Total', 'Done', 'Visit%', 'Compliance'].map((h, i) => (
                  <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' as const, textAlign: i > 0 ? 'center' : 'left' as any }}>{h}</div>
                ))}
              </div>
              {clientSummary.map((c, i) => (
                <div key={c.formName} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 80px 120px', padding: '9px 18px', borderTop: '1px solid rgba(255,255,255,0.03)', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.07)', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, paddingRight: '8px' }}>{c.formName}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>{c.total}</div>
                  <div style={{ fontSize: '12px', color: c.visited > 0 ? '#60a5fa' : 'rgba(255,255,255,0.18)', textAlign: 'center' }}>{c.visited}</div>
                  <div style={{ textAlign: 'center' }}><span style={{ fontSize: '12px', fontWeight: 700, color: rateColor(c.visitRate) }}>{c.visitRate}%</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ flex: 1, height: '4px', backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${c.avgCompliance}%`, height: '100%', backgroundColor: rateColor(c.avgCompliance), borderRadius: '2px' }} />
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: c.avgCompliance > 0 ? rateColor(c.avgCompliance) : 'rgba(255,255,255,0.18)', minWidth: '28px', textAlign: 'right' }}>{c.avgCompliance > 0 ? `${c.avgCompliance}%` : '—'}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Store View ────────────────────────────────────────────
function StoreView({ merch, onSelectStore, onBack }: { merch: Merchandiser; onSelectStore: (store: string) => void; onBack: () => void }) {
  const sfMap = new Map((merch.stockFix?.stores || []).map(s => [s.name, s]));
  const grMap = new Map((merch.geoRep?.stores || []).map(s => [s.name, s]));
  const storeNames = [...new Set([...sfMap.keys(), ...grMap.keys()])].sort();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Breadcrumb items={[tc(merch.name)]} onBack={onBack} />

      {/* Rep summary row */}
      <div style={{ backgroundColor: '#003B71', borderRadius: '12px', padding: '16px 20px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: '20px', flexWrap: 'wrap' as const, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <div style={{ fontSize: '19px', fontWeight: 700, color: '#FFFFFF' }}>{tc(merch.name)}</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '3px' }}>
            {merch.lineManager ? tc(merch.lineManager) : ''}
            {merch.region ? ` · ${merch.region}` : ''}
          </div>
        </div>
        {merch.stockFix && (
          <div style={{ textAlign: 'center', padding: '10px 18px', backgroundColor: 'rgba(243,108,33,0.08)', borderRadius: '10px', border: '1px solid rgba(243,108,33,0.2)' }}>
            <div style={{ fontSize: '26px', fontWeight: 700, color: rateColor(merch.stockFix.captureRate) }}>{merch.stockFix.captureRate}%</div>
            <Badge label="StockFix" color="#F36C21" />
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', marginTop: '4px' }}>{merch.stockFix.completed}/{merch.stockFix.tasks} tasks · {merch.stockFix.stores.length} stores</div>
          </div>
        )}
        {merch.geoRep && (
          <div style={{ textAlign: 'center', padding: '10px 18px', backgroundColor: 'rgba(96,165,250,0.07)', borderRadius: '10px', border: '1px solid rgba(96,165,250,0.2)' }}>
            <div style={{ fontSize: '26px', fontWeight: 700, color: rateColor(merch.geoRep.visitRate) }}>{merch.geoRep.visitRate}%</div>
            <Badge label="Geo Rep" color="#60a5fa" />
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', marginTop: '4px' }}>{merch.geoRep.visited}/{merch.geoRep.forms} forms · {merch.geoRep.stores.length} stores</div>
          </div>
        )}
        {merch.geoRep && merch.geoRep.avgCompliance > 0 && (
          <div style={{ textAlign: 'center', padding: '10px 18px', backgroundColor: 'rgba(96,165,250,0.04)', borderRadius: '10px', border: '1px solid rgba(96,165,250,0.1)' }}>
            <div style={{ fontSize: '26px', fontWeight: 700, color: rateColor(merch.geoRep.avgCompliance) }}>{merch.geoRep.avgCompliance}%</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>Avg Compliance</div>
          </div>
        )}
      </div>

      {/* Store list */}
      <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 160px 160px 20px', padding: '10px 18px', backgroundColor: 'rgba(0,0,0,0.22)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {['Store', 'StockFix', 'Geo Rep', ''].map((h, i) => (
            <div key={h + i} style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' as const, letterSpacing: '0.07em', textAlign: i >= 1 ? 'center' : 'left' as any }}>{h}</div>
          ))}
        </div>

        {storeNames.map((storeName, idx) => {
          const sf = sfMap.get(storeName);
          const gr = grMap.get(storeName);
          return (
            <div
              key={storeName}
              data-testid={`row-store-${storeName}`}
              onClick={() => onSelectStore(storeName)}
              style={{ display: 'grid', gridTemplateColumns: '2fr 160px 160px 20px', padding: '13px 18px', borderBottom: idx < storeNames.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer', alignItems: 'center', transition: 'background-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(243,108,33,0.07)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'}
            >
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#FFFFFF' }}>{tc(storeName)}</div>
              <div style={{ textAlign: 'center' }}>
                {sf ? (
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: rateColor(sf.captureRate) }}>{sf.captureRate}%</span>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{sf.completed}/{sf.tasks} tasks</div>
                  </div>
                ) : <span style={{ color: 'rgba(255,255,255,0.14)' }}>—</span>}
              </div>
              <div style={{ textAlign: 'center' }}>
                {gr ? (
                  <div>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: rateColor(gr.visitRate) }}>{gr.visitRate}%</span>
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{gr.visited}/{gr.forms} forms</div>
                  </div>
                ) : <span style={{ color: 'rgba(255,255,255,0.14)' }}>—</span>}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'right' }}>›</div>
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
  const completedTasks = tasks.filter((t: any) => t.action_status === 'Completed');
  const pendingTasks   = tasks.filter((t: any) => t.action_status !== 'Completed');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Breadcrumb items={[tc(merch.name), tc(storeName)]} onBack={onBack} />

      {/* StockFix section */}
      {sfStore && (
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(243,108,33,0.25)', overflow: 'hidden' }}>
          <div style={{ padding: '13px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Badge label="StockFix" color="#F36C21" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>{sfStore.tasks} tasks at {tc(storeName)}</span>
            </div>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#F36C21', fontWeight: 600 }}>{completedTasks.length} done</span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{pendingTasks.length} pending</span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: rateColor(sfStore.captureRate) }}>{sfStore.captureRate}%</span>
            </div>
          </div>
          {sfLoading ? (
            <div style={{ padding: '28px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>Loading StockFix tasks…</div>
          ) : tasks.length > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 2fr 1fr 1.2fr 100px', padding: '8px 18px', backgroundColor: 'rgba(0,0,0,0.18)' }}>
                {['Client', 'Product', 'Category', 'Action', 'Status'].map(h => (
                  <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' as const }}>{h}</div>
                ))}
              </div>
              {tasks.map((t: any, i: number) => {
                const done = t.action_status === 'Completed';
                return (
                  <div key={t.unique_id || i} style={{ display: 'grid', gridTemplateColumns: '1.8fr 2fr 1fr 1.2fr 100px', padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.03)', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.06)', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{t.client}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, paddingRight: '8px' }}>{t.article_description}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)' }}>{t.category}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{t.action}</div>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', backgroundColor: done ? 'rgba(243,108,33,0.15)' : 'rgba(239,68,68,0.13)', color: done ? '#F36C21' : '#f87171' }}>
                        {t.action_status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(255,255,255,0.28)', fontSize: '13px' }}>No tasks found</div>
          )}
        </div>
      )}

      {/* Geo Rep section */}
      {grStore && (
        <div style={{ backgroundColor: '#003B71', borderRadius: '12px', border: '1px solid rgba(96,165,250,0.25)', overflow: 'hidden' }}>
          <div style={{ padding: '13px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Badge label="Geo Rep" color="#60a5fa" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>{grStore.forms} forms at {tc(storeName)}</span>
            </div>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 600 }}>{grStore.visited} visited</span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>{grStore.forms - grStore.visited} not visited</span>
              <span style={{ fontSize: '15px', fontWeight: 700, color: rateColor(grStore.visitRate) }}>{grStore.visitRate}%</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 80px 110px', padding: '8px 18px', backgroundColor: 'rgba(0,0,0,0.18)' }}>
            {['Form / Client', 'Date', 'Visited', 'Compliance'].map((h, i) => (
              <div key={h} style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase' as const, textAlign: i >= 2 ? 'center' : 'left' as any }}>{h}</div>
            ))}
          </div>
          {grStore.formDetails.map((f, i) => (
            <div key={f.formName + i} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 80px 110px', padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.03)', backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.06)', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{f.formName}</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)' }}>{f.date}</div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', backgroundColor: f.visited ? 'rgba(96,165,250,0.14)' : 'rgba(239,68,68,0.12)', color: f.visited ? '#60a5fa' : '#f87171' }}>
                  {f.visited ? 'Yes' : 'No'}
                </span>
              </div>
              <div style={{ textAlign: 'center' }}>
                {f.compliance !== null
                  ? <span style={{ fontSize: '12px', fontWeight: 700, color: rateColor(f.compliance) }}>{f.compliance}%</span>
                  : <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.18)' }}>—</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function MerchandiserPilotPage() {
  const [filterManager, setFilterManager] = useState('');
  const [filterRegion, setFilterRegion]   = useState('');
  const [filterStore, setFilterStore]     = useState('');
  const [showFilters, setShowFilters]     = useState(false);

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

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : null;

  function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
      <button onClick={onClick} style={{ textAlign: 'left', padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: active ? 700 : 400, backgroundColor: active ? '#F36C21' : 'rgba(255,255,255,0.06)', color: active ? '#FFFFFF' : 'rgba(255,255,255,0.5)', transition: 'all 0.15s', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: '100%' }}>
        {label}
      </button>
    );
  }

  function FilterBlock({ title, options, value, onChange }: { title: string; options: string[]; value: string; onChange: (v: string) => void }) {
    return (
      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '7px' }}>{title}</div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
          <FilterChip label={`All ${title}s`} active={value === ''} onClick={() => onChange('')} />
          {options.map(o => <FilterChip key={o} label={o.length > 24 ? o.slice(0, 24) + '…' : o} active={o === value} onClick={() => onChange(o === value ? '' : o)} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#001d3d', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ backgroundColor: '#003B71', borderBottom: '3px solid #F36C21', padding: '0 24px' }}>
        <div style={{ maxWidth: '1440px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '62px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img src={meridianGroupLogo} alt="Meridian Group" style={{ height: '32px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>Merchandiser Pilot Report</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                StockFix + Geo Rep
                {data?.latestWeek ? ` · Week of ${data.latestWeek}` : ''}
                {lastUpdated && <span style={{ marginLeft: '8px', color: 'rgba(255,255,255,0.22)' }}>· Updated {lastUpdated}</span>}
              </div>
            </div>
          </div>
          <button
            data-testid="button-filters"
            onClick={() => setShowFilters(!showFilters)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: showFilters ? '#F36C21' : 'rgba(255,255,255,0.09)', border: 'none', borderRadius: '8px', color: '#FFFFFF', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
          >
            ≡ Filters
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '20px 24px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* Sidebar */}
        {showFilters && data && (
          <div style={{ width: '210px', flexShrink: 0, backgroundColor: '#003B71', borderRadius: '12px', padding: '16px 13px', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: '14px' }}>Filters · Geo Rep</div>
            <FilterBlock title="Manager" options={data.filters.managers} value={filterManager} onChange={v => { setFilterManager(v); setView('list'); }} />
            <FilterBlock title="Region"  options={data.filters.regions}  value={filterRegion}  onChange={v => { setFilterRegion(v);  setView('list'); }} />
            <FilterBlock title="Store"   options={data.filters.stores}   value={filterStore}   onChange={v => { setFilterStore(v);   setView('list'); }} />
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '70px 0', color: 'rgba(255,255,255,0.35)', fontSize: '14px' }}>
              Loading report — fetching SharePoint &amp; StockFix data…
            </div>
          )}
          {error && (
            <div style={{ backgroundColor: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '20px', color: '#fca5a5', fontSize: '13px' }}>
              Error: {String(error)}
            </div>
          )}
          {data && view === 'list' && (
            <MerchandiserListView
              data={data}
              onSelect={m => { setSelMerch(m); setView('store'); }}
            />
          )}
          {data && view === 'store' && selMerch && (
            <StoreView
              merch={selMerch}
              onSelectStore={store => { setSelStore(store); setView('task'); }}
              onBack={() => setView('list')}
            />
          )}
          {data && view === 'task' && selMerch && (
            <TaskDetailView
              merch={selMerch}
              storeName={selStore}
              onBack={() => setView('store')}
            />
          )}
        </div>
      </div>
    </div>
  );
}
