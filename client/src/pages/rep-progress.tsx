import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp, Clock, CheckCircle, AlertCircle, Search } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, LabelList, BarChart, Cell } from "recharts";
import BottomNav from "@/components/BottomNav";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

interface TaskRowProps {
  task: {
    uniqueId: string;
    articleDescription: string;
    storeName: string;
    client: string;
    storeWfc: string;
    age?: number;
    captureDate?: string;
    actionStatus: string;
  };
  onClick: () => void;
}

function TaskRow({ task, onClick }: TaskRowProps) {
  return (
    <div
      data-testid={`task-row-${task.uniqueId}`}
      onClick={onClick}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        cursor: 'pointer',
        borderLeft: `4px solid ${task.actionStatus === 'Completed' ? '#10B981' : '#F36C21'}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 600, 
            color: '#003B71',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {task.articleDescription}
          </div>
          <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
            {task.storeName}
          </div>
          <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>
            {task.client} • WFC: {parseFloat(task.storeWfc || '0').toFixed(1)}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
          {task.age !== undefined && (
            <div style={{ 
              fontSize: '12px', 
              fontWeight: 600, 
              color: task.age > 14 ? '#DC2626' : task.age > 7 ? '#F59E0B' : '#6B7280' 
            }}>
              {task.age} days
            </div>
          )}
          {task.captureDate && (
            <div style={{ fontSize: '11px', color: '#6B7280' }}>
              {new Date(task.captureDate).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RepProgress() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  
  const repName = params.get('rep') || '';
  const [activeTab, setActiveTab] = useState<'open' | 'completed'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedClient, setSelectedClient] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ["rep-progress", repName, selectedStore, selectedClient],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      queryParams.set('repName', repName);
      if (selectedStore) queryParams.set('store', selectedStore);
      if (selectedClient) queryParams.set('client', selectedClient);
      const res = await fetch(`/api/task-progress/rep?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch rep progress");
      return res.json();
    },
    enabled: !!repName,
  });

  const handleBack = () => {
    setLocation('/store-overview' + searchString);
  };

  const filteredTasks = (activeTab === 'open' ? data?.tasks?.open : data?.tasks?.completed) || [];
  const displayTasks = filteredTasks.filter((task: any) => 
    !searchQuery || 
    task.articleDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.storeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.client.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatWeekLabel = (week: string) => {
    if (!week || week === 'Unknown') return 'N/A';
    const parts = week.split('-');
    if (parts.length >= 2) {
      return `${parts[1]}/${parts[2] || ''}`;
    }
    return week;
  };

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
              My Task Progress
            </h1>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', margin: 0 }}>
              {repName}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <KpiTile
            label="Open Tasks"
            value={data?.kpis?.openCount || 0}
            icon={<AlertCircle size={18} />}
            accentColor="#F36C21"
            testId="kpi-open-tasks"
          />
          <KpiTile
            label="Completed"
            value={data?.kpis?.completedCount || 0}
            icon={<CheckCircle size={18} />}
            accentColor="#10B981"
            testId="kpi-completed-tasks"
          />
          <KpiTile
            label="Rate"
            value={`${data?.kpis?.completionRate || 0}%`}
            icon={<TrendingUp size={18} />}
            accentColor="#003B71"
            testId="kpi-completion-rate"
          />
          <KpiTile
            label="Oldest (Days)"
            value={data?.kpis?.oldestOpenDays || 0}
            icon={<Clock size={18} />}
            accentColor={data?.kpis?.oldestOpenDays > 14 ? '#DC2626' : '#6B7280'}
            testId="kpi-oldest-open"
          />
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {data?.charts?.tasksOverTime?.length > 0 && (
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#003B71', marginBottom: '8px' }}>
              Tasks by Week
            </h3>
            <div style={{ height: '120px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.charts.tasksOverTime} margin={{ top: 20, right: 10, left: -15, bottom: 5 }}>
                  <XAxis 
                    dataKey="week" 
                    tick={{ fontSize: 10, fill: '#6B7280' }}
                    tickFormatter={formatWeekLabel}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 9, fill: '#6B7280' }}
                    axisLine={false}
                    tickLine={false}
                    width={35}
                  />
                  <Bar dataKey="open" fill="#F36C21" radius={[4, 4, 0, 0]} name="Open">
                    <LabelList dataKey="open" position="top" fill="#F36C21" fontSize={9} fontWeight={600} />
                  </Bar>
                  <Bar dataKey="completed" fill="#10B981" radius={[4, 4, 0, 0]} name="Completed">
                    <LabelList dataKey="completed" position="top" fill="#10B981" fontSize={9} fontWeight={600} />
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {data?.charts?.openByStore?.length > 0 && (
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#003B71', marginBottom: '8px' }}>
              Open Tasks by Store (Top 10)
            </h3>
            <div style={{ height: '150px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={data.charts.openByStore} 
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis 
                    type="category" 
                    dataKey="store" 
                    tick={{ fontSize: 9, fill: '#6B7280' }} 
                    width={100}
                    tickFormatter={(value) => value.length > 15 ? value.substring(0, 15) + '...' : value}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Bar dataKey="count" fill="#003B71" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="count" position="right" fill="#003B71" fontSize={10} fontWeight={600} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '12px',
        }}>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'open' | 'completed')}>
            <TabsList style={{ width: '100%', marginBottom: '12px' }}>
              <TabsTrigger value="open" style={{ flex: 1 }} data-testid="tab-open">
                Open ({data?.tasks?.open?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="completed" style={{ flex: 1 }} data-testid="tab-completed">
                Completed ({data?.tasks?.completed?.length || 0})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div style={{ 
            position: 'relative',
            marginBottom: '12px',
          }}>
            <Search style={{ 
              position: 'absolute', 
              left: '12px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              width: '16px',
              height: '16px',
              color: '#9CA3AF',
            }} />
            <input
              data-testid="search-tasks"
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 36px',
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#6B7280' }}>
                Loading...
              </div>
            ) : displayTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#6B7280' }}>
                No {activeTab} tasks found
              </div>
            ) : (
              displayTasks.map((task: any) => (
                <TaskRow
                  key={task.uniqueId}
                  task={task}
                  onClick={() => setLocation(`/task/${encodeURIComponent(task.uniqueId)}`)}
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
