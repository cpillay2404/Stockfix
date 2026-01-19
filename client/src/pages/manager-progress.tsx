import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp, Clock, CheckCircle, AlertCircle, AlertTriangle, Users, Store } from "lucide-react";
import BottomNav from "@/components/BottomNav";

interface KpiTileProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accentColor: string;
  testId: string;
}

function KpiTile({ label, value, icon, accentColor, testId }: KpiTileProps) {
  return (
    <div
      data-testid={testId}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px',
        borderTop: `3px solid ${accentColor}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ color: accentColor, marginBottom: '4px' }}>{icon}</div>
      <span style={{ fontSize: '24px', fontWeight: 800, color: '#003B71', fontFamily: 'monospace', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ 
        fontSize: '10px', 
        color: '#6B7280', 
        textAlign: 'center', 
        marginTop: '4px',
        lineHeight: 1.2,
      }}>
        {label}
      </span>
    </div>
  );
}

interface RepRowProps {
  rep: {
    repName: string;
    open: number;
    completed: number;
    completionRate: number;
    oldestOpenDays: number;
  };
  onClick: () => void;
}

function RepRow({ rep, onClick }: RepRowProps) {
  const isAtRisk = rep.open >= 10 || rep.oldestOpenDays >= 14;
  
  return (
    <div
      data-testid={`rep-row-${rep.repName}`}
      onClick={onClick}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        cursor: 'pointer',
        borderLeft: isAtRisk ? '4px solid #DC2626' : '4px solid #10B981',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: '#003B71',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {rep.repName}
          </div>
          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            marginTop: '4px',
            fontSize: '12px',
            color: '#6B7280',
          }}>
            <span style={{ color: '#F36C21', fontWeight: 600 }}>
              {rep.open} open
            </span>
            <span style={{ color: '#10B981' }}>
              {rep.completed} done
            </span>
            <span>
              {rep.completionRate}% rate
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
          <div style={{ 
            fontSize: '12px', 
            fontWeight: 600, 
            color: rep.oldestOpenDays > 14 ? '#DC2626' : rep.oldestOpenDays > 7 ? '#F59E0B' : '#6B7280' 
          }}>
            {rep.oldestOpenDays} days oldest
          </div>
        </div>
      </div>
    </div>
  );
}

interface RiskCardProps {
  title: string;
  icon: React.ReactNode;
  items: Array<{ name: string; value: string | number }>;
  testId: string;
}

function RiskCard({ title, icon, items, testId }: RiskCardProps) {
  if (items.length === 0) return null;
  
  return (
    <div
      data-testid={testId}
      style={{
        backgroundColor: '#FEF2F2',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '12px',
        border: '1px solid #FECACA',
      }}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        marginBottom: '8px',
      }}>
        <div style={{ color: '#DC2626' }}>{icon}</div>
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#DC2626' }}>
          {title}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {items.slice(0, 5).map((item, index) => (
          <div
            key={index}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '12px',
            }}
          >
            <span style={{ color: '#374151' }}>{item.name}</span>
            <span style={{ color: '#DC2626', fontWeight: 600, marginLeft: '6px' }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ManagerProgress() {
  const [, setLocation] = useLocation();
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedClient, setSelectedClient] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ["manager-progress", selectedRegion, selectedClient],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (selectedRegion) queryParams.set('region', selectedRegion);
      if (selectedClient) queryParams.set('client', selectedClient);
      const res = await fetch(`/api/task-progress/manager?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch manager progress");
      return res.json();
    },
  });

  const handleBack = () => {
    setLocation('/');
  };

  const handleRepClick = (repName: string) => {
    setLocation(`/rep-progress?rep=${encodeURIComponent(repName)}`);
  };

  const repsAtRisk = data?.riskAttention?.repsAtRisk || [];
  const storesAtRisk = data?.riskAttention?.storesAtRisk || [];

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#F3F4F6',
      paddingBottom: '80px',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #003B71 0%, #005a9e 100%)',
        padding: '16px',
        paddingTop: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <button
            data-testid="back-button"
            onClick={handleBack}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft style={{ width: '20px', height: '20px', color: '#FFFFFF' }} />
          </button>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
              Team Task Progress
            </h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', margin: 0 }}>
              Manager Overview
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <KpiTile
            label="Total Open"
            value={data?.kpis?.totalOpen?.toLocaleString() || 0}
            icon={<AlertCircle size={18} />}
            accentColor="#F36C21"
            testId="kpi-total-open"
          />
          <KpiTile
            label="Completed"
            value={data?.kpis?.totalCompleted?.toLocaleString() || 0}
            icon={<CheckCircle size={18} />}
            accentColor="#10B981"
            testId="kpi-total-completed"
          />
          <KpiTile
            label="Rate"
            value={`${data?.kpis?.completionRate || 0}%`}
            icon={<TrendingUp size={18} />}
            accentColor="#003B71"
            testId="kpi-team-rate"
          />
          <KpiTile
            label="Oldest (Days)"
            value={data?.kpis?.oldestOpenDays || 0}
            icon={<Clock size={18} />}
            accentColor={data?.kpis?.oldestOpenDays > 14 ? '#DC2626' : '#6B7280'}
            testId="kpi-team-oldest"
          />
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {(repsAtRisk.length > 0 || storesAtRisk.length > 0) && (
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ 
              fontSize: '16px', 
              fontWeight: 700, 
              color: '#DC2626', 
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <AlertTriangle size={20} />
              Attention Required
            </h3>

            <RiskCard
              title="Reps with High Open Count or Old Tasks"
              icon={<Users size={16} />}
              items={repsAtRisk.map((r: any) => ({ 
                name: r.repName, 
                value: `${r.open} open, ${r.oldestOpenDays}d old` 
              }))}
              testId="risk-reps"
            />

            <RiskCard
              title="Stores with Most Open Tasks"
              icon={<Store size={16} />}
              items={storesAtRisk.map((s: any) => ({ 
                name: s.store.length > 20 ? s.store.substring(0, 20) + '...' : s.store, 
                value: `${s.openCount} open` 
              }))}
              testId="risk-stores"
            />
          </div>
        )}

        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '12px',
        }}>
          <h3 style={{ 
            fontSize: '16px', 
            fontWeight: 700, 
            color: '#003B71', 
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Users size={20} />
            Rep Leaderboard
          </h3>

          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            padding: '8px 12px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#6B7280',
            borderBottom: '1px solid #E5E7EB',
            marginBottom: '8px',
          }}>
            <span>REP NAME</span>
            <span>STATUS</span>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#6B7280' }}>
                Loading...
              </div>
            ) : (data?.repLeaderboard || []).length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#6B7280' }}>
                No reps found
              </div>
            ) : (
              (data?.repLeaderboard || []).map((rep: any) => (
                <RepRow
                  key={rep.repName}
                  rep={rep}
                  onClick={() => handleRepClick(rep.repName)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
