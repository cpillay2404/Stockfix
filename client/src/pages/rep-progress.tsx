import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp, Clock, CheckCircle, AlertCircle, Search, Trophy, Flame, Award } from "lucide-react";
import { Bar, XAxis, YAxis, ResponsiveContainer, LabelList, BarChart, Cell, PieChart, Pie } from "recharts";
import BottomNav from "@/components/BottomNav";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RepGamificationStats {
  found: boolean;
  repName: string;
  weekEndingDate: string;
  stats?: {
    badge: { type: string; label: string; color: string; emoji: string };
    streak: number;
    completionRate: number;
    priorityCompletionRate: number;
    priorityTotalTasks: number;
    priorityCompletedTasks: number;
    priorityOpenTasks: number;
    rank: number;
    totalReps: number;
    teamAvgCompletion: number;
    aheadOfTeamBy: number;
    totalTasks: number;
    completedTasks: number;
  };
}

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
  const storeParam = params.get('store') || '';
  const fromManager = params.get('from') === 'manager';
  const [activeTab, setActiveTab] = useState<'open' | 'completed'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [openPage, setOpenPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [loadedOpenTasks, setLoadedOpenTasks] = useState<any[]>([]);
  const [loadedCompletedTasks, setLoadedCompletedTasks] = useState<any[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["rep-progress", repName, selectedStore, selectedClient, openPage, completedPage],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      queryParams.set('repName', repName);
      if (selectedStore) queryParams.set('store', selectedStore);
      if (selectedClient) queryParams.set('client', selectedClient);
      queryParams.set('openPage', openPage.toString());
      queryParams.set('completedPage', completedPage.toString());
      queryParams.set('limit', '50');
      const res = await fetch(`/api/task-progress/rep?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch rep progress");
      return res.json();
    },
    enabled: !!repName,
  });

  // Accumulate tasks when data changes (moved out of queryFn to avoid side effects)
  useEffect(() => {
    if (data?.tasks?.open) {
      if (openPage === 1) {
        setLoadedOpenTasks(data.tasks.open);
      } else {
        setLoadedOpenTasks(prev => {
          // Avoid duplicates by checking uniqueIds
          const existingIds = new Set(prev.map((t: any) => t.uniqueId));
          const newTasks = data.tasks.open.filter((t: any) => !existingIds.has(t.uniqueId));
          return [...prev, ...newTasks];
        });
      }
    }
  }, [data?.tasks?.open, openPage]);

  useEffect(() => {
    if (data?.tasks?.completed) {
      if (completedPage === 1) {
        setLoadedCompletedTasks(data.tasks.completed);
      } else {
        setLoadedCompletedTasks(prev => {
          const existingIds = new Set(prev.map((t: any) => t.uniqueId));
          const newTasks = data.tasks.completed.filter((t: any) => !existingIds.has(t.uniqueId));
          return [...prev, ...newTasks];
        });
      }
    }
  }, [data?.tasks?.completed, completedPage]);

  // Reset pagination when filters change (but not on initial load)
  const [initialRepName] = useState(repName);
  useEffect(() => {
    // Only reset if repName actually changed after initial load
    if (repName && repName !== initialRepName) {
      setOpenPage(1);
      setCompletedPage(1);
      setLoadedOpenTasks([]);
      setLoadedCompletedTasks([]);
    }
  }, [repName, initialRepName]);
  
  useEffect(() => {
    if (selectedStore || selectedClient) {
      setOpenPage(1);
      setCompletedPage(1);
      setLoadedOpenTasks([]);
      setLoadedCompletedTasks([]);
    }
  }, [selectedStore, selectedClient]);

  // Fetch gamification stats for this rep
  const { data: gamification } = useQuery<RepGamificationStats>({
    queryKey: ["rep-gamification", repName],
    queryFn: async () => {
      const res = await fetch(`/api/gamification/rep/${encodeURIComponent(repName)}`);
      if (!res.ok) throw new Error("Failed to fetch gamification");
      return res.json();
    },
    enabled: !!repName,
  });

  const handleBack = () => {
    if (fromManager) {
      setLocation('/manager-progress');
    } else if (storeParam) {
      setLocation('/store-overview' + searchString);
    } else {
      setLocation('/select-rep');
    }
  };

  // Use accumulated tasks from pagination
  const allTasks = activeTab === 'open' ? loadedOpenTasks : loadedCompletedTasks;
  const displayTasks = allTasks.filter((task: any) => 
    !searchQuery || 
    task.articleDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.storeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    task.client.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Check if there are more pages to load
  const hasMoreOpen = data?.tasks?.openTotalPages && openPage < data.tasks.openTotalPages;
  const hasMoreCompleted = data?.tasks?.completedTotalPages && completedPage < data.tasks.completedTotalPages;
  const hasMore = activeTab === 'open' ? hasMoreOpen : hasMoreCompleted;
  
  const loadMore = () => {
    if (activeTab === 'open') {
      setOpenPage(prev => prev + 1);
    } else {
      setCompletedPage(prev => prev + 1);
    }
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
            label="Priority Open"
            value={data?.kpis?.priorityOpenCount || 0}
            icon={<AlertCircle size={18} />}
            accentColor="#F36C21"
            testId="kpi-priority-open"
          />
          <KpiTile
            label="Priority Done"
            value={data?.kpis?.priorityCompletedCount || 0}
            icon={<CheckCircle size={18} />}
            accentColor="#10B981"
            testId="kpi-priority-completed"
          />
          <KpiTile
            label="Priority Rate"
            value={`${data?.kpis?.priorityCompletionRate || 0}%`}
            icon={<TrendingUp size={18} />}
            accentColor="#003B71"
            testId="kpi-priority-rate"
          />
        </div>

        {/* Gamification Stats */}
        {gamification?.found && gamification.stats && (
          <div 
            data-testid="gamification-card"
            style={{
              backgroundColor: 'rgba(255,255,255,0.15)',
              borderRadius: '12px',
              padding: '12px 16px',
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Badge */}
              {gamification.stats.badge.type !== 'none' && (
                <div 
                  style={{ 
                    fontSize: '28px',
                    filter: gamification.stats.badge.type === 'gold' ? 'drop-shadow(0 0 6px gold)' : undefined,
                  }}
                  title={`${gamification.stats.badge.label} Badge`}
                >
                  {gamification.stats.badge.emoji}
                </div>
              )}
              <div>
                <div style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '14px' }}>
                  {gamification.stats.badge.type !== 'none' 
                    ? gamification.stats.badge.label + ' Badge'
                    : 'Keep going!'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>
                  {gamification.stats.aheadOfTeamBy >= 0 
                    ? `${gamification.stats.aheadOfTeamBy}% above team avg`
                    : `${Math.abs(gamification.stats.aheadOfTeamBy)}% below team avg`}
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              {/* Rank */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  color: gamification.stats.rank <= 3 ? '#FFD700' : '#FFFFFF',
                }}>
                  <Trophy size={14} />
                  <span style={{ fontWeight: 700, fontSize: '16px' }}>#{gamification.stats.rank}</span>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
                  of {gamification.stats.totalReps}
                </div>
              </div>
              
              {/* Streak */}
              {gamification.stats.streak > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px',
                    color: gamification.stats.streak >= 7 ? '#FF6B6B' : gamification.stats.streak >= 3 ? '#FFB347' : '#FFFFFF',
                  }}>
                    <Flame size={14} />
                    <span style={{ fontWeight: 700, fontSize: '16px' }}>{gamification.stats.streak}</span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>
                    day streak
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '16px' }}>
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#003B71', marginBottom: '12px' }}>
            Task Status Breakdown
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '120px', height: '120px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Open', value: data?.kpis?.openCount || 0, fill: '#F36C21' },
                      { name: 'Completed', value: data?.kpis?.completedCount || 0, fill: '#10B981' },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    <Cell fill="#F36C21" />
                    <Cell fill="#10B981" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <div style={{ width: '12px', height: '12px', backgroundColor: '#F36C21', borderRadius: '2px' }} />
                <span style={{ fontSize: '14px', color: '#374151' }}>Open</span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#F36C21', marginLeft: 'auto', fontFamily: 'monospace' }}>
                  {data?.kpis?.openCount || 0}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', backgroundColor: '#10B981', borderRadius: '2px' }} />
                <span style={{ fontSize: '14px', color: '#374151' }}>Completed</span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#10B981', marginLeft: 'auto', fontFamily: 'monospace' }}>
                  {data?.kpis?.completedCount || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {data?.charts?.openByStore?.length > 0 && (
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px',
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#003B71', marginBottom: '12px' }}>
              Open Tasks by Store (Top 5)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.charts.openByStore.map((item: { store: string; count: number }, index: number) => {
                const maxCount = Math.max(...data.charts.openByStore.map((s: { count: number }) => s.count));
                const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                return (
                  <div key={item.store} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ 
                        fontSize: '12px', 
                        color: '#003B71', 
                        fontWeight: 500,
                        flex: 1,
                        paddingRight: '8px',
                      }}>
                        {index + 1}. {item.store}
                      </span>
                      <span style={{ 
                        fontSize: '14px', 
                        fontWeight: 700, 
                        color: '#003B71',
                        fontFamily: 'monospace',
                      }}>
                        {item.count}
                      </span>
                    </div>
                    <div style={{ 
                      height: '6px', 
                      backgroundColor: '#E5E7EB', 
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}>
                      <div style={{ 
                        height: '100%', 
                        width: `${barWidth}%`, 
                        backgroundColor: '#003B71',
                        borderRadius: '3px',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '12px',
        }}>
          <Tabs value={activeTab} onValueChange={(v) => {
            const newTab = v as 'open' | 'completed';
            setActiveTab(newTab);
            // Reset page when switching tabs
            if (newTab === 'open') {
              setOpenPage(1);
              setLoadedOpenTasks([]);
            } else {
              setCompletedPage(1);
              setLoadedCompletedTasks([]);
            }
          }}>
            <TabsList style={{ width: '100%', marginBottom: '12px' }}>
              <TabsTrigger value="open" style={{ flex: 1 }} data-testid="tab-open">
                Open ({data?.kpis?.openCount || 0})
              </TabsTrigger>
              <TabsTrigger value="completed" style={{ flex: 1 }} data-testid="tab-completed">
                Completed ({data?.kpis?.completedCount || 0})
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
              <>
                {displayTasks.map((task: any) => (
                  <TaskRow
                    key={task.uniqueId}
                    task={task}
                    onClick={() => setLocation(`/task/${encodeURIComponent(task.uniqueId)}`)}
                  />
                ))}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: '12px',
                      marginTop: '8px',
                      backgroundColor: '#003B71',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      opacity: isLoading ? 0.7 : 1,
                    }}
                    data-testid="load-more-button"
                  >
                    {isLoading ? 'Loading...' : 'Load More'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
