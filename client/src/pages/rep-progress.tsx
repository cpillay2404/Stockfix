import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, TrendingUp, Clock, CheckCircle, AlertCircle, Search, Trophy, Flame, Award } from "lucide-react";
import { Bar, XAxis, YAxis, ResponsiveContainer, LabelList, BarChart, Cell, PieChart, Pie } from "recharts";
import BottomNav from "@/components/BottomNav";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { safeParseFloat } from "@/lib/utils";
import { COLORS } from "@/lib/design-tokens";

// Matches the dark navy/orange theme (Carin, 2026-08-17: "work on all
// screens that don't have this new navy blue design") - reachable from
// manager-progress.tsx (already redesigned) via a rep-row tap, so leaving
// this light would be a jarring mismatch mid-flow.
const NAVY_ELEVATED = COLORS.navyElevated;
const NAVY_DEEP = COLORS.bgPrimary;
const NAVY_CARD = COLORS.navyElevated;
const ORANGE = COLORS.orange;
const TEXT_MUTED = COLORS.textMuted;
const RED = "#F87171";
const GREEN = "#34D399";

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
        backgroundColor: NAVY_CARD,
        borderRadius: 10,
        padding: 12,
        borderTop: `3px solid ${accentColor}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ color: accentColor, marginBottom: 4 }}>{icon}</div>
      <span style={{ fontSize: 24, fontWeight: 800, color: "#F7F9FC", fontFamily: 'monospace', lineHeight: 1 }}>
        {value}
      </span>
      <span style={{
        fontSize: 10,
        color: TEXT_MUTED,
        textAlign: 'center',
        marginTop: 4,
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
        backgroundColor: NAVY_CARD,
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        cursor: 'pointer',
        borderLeft: `4px solid ${task.actionStatus === 'Completed' ? GREEN : ORANGE}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#F7F9FC",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {task.articleDescription}
          </div>
          <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>
            {task.storeName}
          </div>
          <div style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 2, opacity: 0.8 }}>
            {task.client} • WFC: {safeParseFloat(task.storeWfc || '0').toFixed(1)}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
          {task.captureDate && (
            <div style={{ fontSize: 11, color: TEXT_MUTED }}>
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
  const prevFiltersRef = useRef({ repName: '', store: '', client: '' });

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

  // Accumulate tasks for pagination - only add when loading additional pages
  useEffect(() => {
    if (data?.tasks?.open && openPage > 1) {
      setLoadedOpenTasks(prev => {
        const existingIds = new Set(prev.map((t: any) => t.uniqueId));
        const newTasks = data.tasks.open.filter((t: any) => !existingIds.has(t.uniqueId));
        return [...prev, ...newTasks];
      });
    }
  }, [data?.tasks?.open, openPage]);

  useEffect(() => {
    if (data?.tasks?.completed && completedPage > 1) {
      setLoadedCompletedTasks(prev => {
        const existingIds = new Set(prev.map((t: any) => t.uniqueId));
        const newTasks = data.tasks.completed.filter((t: any) => !existingIds.has(t.uniqueId));
        return [...prev, ...newTasks];
      });
    }
  }, [data?.tasks?.completed, completedPage]);

  // Reset accumulated tasks when filters change
  useEffect(() => {
    setLoadedOpenTasks([]);
    setLoadedCompletedTasks([]);
    setOpenPage(1);
    setCompletedPage(1);
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

  // Combine page 1 data with accumulated pagination data
  const openTasksList = [
    ...(data?.tasks?.open || []),
    ...loadedOpenTasks
  ];
  const completedTasksList = [
    ...(data?.tasks?.completed || []),
    ...loadedCompletedTasks
  ];

  const allTasks = activeTab === 'open' ? openTasksList : completedTasksList;
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
      backgroundColor: NAVY_DEEP,
      paddingBottom: 80,
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${NAVY_ELEVATED} 0%, ${NAVY_DEEP} 100%)`,
        borderBottom: `1px solid ${COLORS.lineBlue}`,
        padding: 16,
        paddingTop: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button
            data-testid="back-button"
            onClick={handleBack}
            style={{
              background: 'rgba(23,68,111,0.35)',
              border: 'none',
              borderRadius: 8,
              padding: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft style={{ width: 20, height: 20, color: "#F7F9FC" }} />
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#F7F9FC", margin: 0 }}>
              My Task Progress
            </h1>
            <p style={{ fontSize: 13, color: TEXT_MUTED, margin: 0 }}>
              {repName}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <KpiTile
            label="Priority Open"
            value={data?.kpis?.priorityOpenCount || 0}
            icon={<AlertCircle size={18} />}
            accentColor={ORANGE}
            testId="kpi-priority-open"
          />
          <KpiTile
            label="Priority Done"
            value={data?.kpis?.priorityCompletedCount || 0}
            icon={<CheckCircle size={18} />}
            accentColor={GREEN}
            testId="kpi-priority-completed"
          />
          <KpiTile
            label="Priority Rate"
            value={`${data?.kpis?.priorityCompletionRate || 0}%`}
            icon={<TrendingUp size={18} />}
            accentColor="#60A5FA"
            testId="kpi-priority-rate"
          />
        </div>

        {/* Gamification Stats */}
        {gamification?.found && gamification.stats && (
          <div
            data-testid="gamification-card"
            style={{
              backgroundColor: 'rgba(255,121,0,0.1)',
              border: '1px solid rgba(255,121,0,0.25)',
              borderRadius: 12,
              padding: '12px 16px',
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Badge */}
              {gamification.stats.badge.type !== 'none' && (
                <div
                  style={{
                    fontSize: 28,
                    filter: gamification.stats.badge.type === 'gold' ? 'drop-shadow(0 0 6px gold)' : undefined,
                  }}
                  title={`${gamification.stats.badge.label} Badge`}
                >
                  {gamification.stats.badge.emoji}
                </div>
              )}
              <div>
                <div style={{ color: "#F7F9FC", fontWeight: 600, fontSize: 14 }}>
                  {gamification.stats.badge.type !== 'none'
                    ? gamification.stats.badge.label + ' Badge'
                    : 'Keep going!'}
                </div>
                <div style={{ color: TEXT_MUTED, fontSize: 11 }}>
                  {gamification.stats.aheadOfTeamBy >= 0
                    ? `${gamification.stats.aheadOfTeamBy}% above team avg`
                    : `${Math.abs(gamification.stats.aheadOfTeamBy)}% below team avg`}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              {/* Rank */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  color: gamification.stats.rank <= 3 ? '#FFD700' : "#F7F9FC",
                }}>
                  <Trophy size={14} />
                  <span style={{ fontWeight: 700, fontSize: 16 }}>#{gamification.stats.rank}</span>
                </div>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>
                  of {gamification.stats.totalReps}
                </div>
              </div>

              {/* Streak */}
              {gamification.stats.streak > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: gamification.stats.streak >= 7 ? RED : gamification.stats.streak >= 3 ? "#FBBF24" : "#F7F9FC",
                  }}>
                    <Flame size={14} />
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{gamification.stats.streak}</span>
                  </div>
                  <div style={{ color: TEXT_MUTED, fontSize: 10 }}>
                    day streak
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: 16 }}>
        <div style={{
          backgroundColor: NAVY_CARD,
          borderRadius: 10,
          padding: 12,
          marginBottom: 16,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#F7F9FC", marginBottom: 12 }}>
            Task Status Breakdown
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 120, height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Priority Open', value: data?.kpis?.priorityOpenCount || 0, fill: RED },
                      { name: 'Non-Priority Open', value: (data?.kpis?.openCount || 0) - (data?.kpis?.priorityOpenCount || 0), fill: ORANGE },
                      { name: 'Completed', value: data?.kpis?.completedCount || 0, fill: GREEN },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    <Cell fill={RED} />
                    <Cell fill={ORANGE} />
                    <Cell fill={GREEN} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 12, height: 12, backgroundColor: RED, borderRadius: 2 }} />
                <span style={{ fontSize: 13, color: TEXT_MUTED }}>Priority Open</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: RED, marginLeft: 'auto', fontFamily: 'monospace' }}>
                  {data?.kpis?.priorityOpenCount || 0}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 12, height: 12, backgroundColor: ORANGE, borderRadius: 2 }} />
                <span style={{ fontSize: 13, color: TEXT_MUTED }}>Non-Priority Open</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: ORANGE, marginLeft: 'auto', fontFamily: 'monospace' }}>
                  {(data?.kpis?.openCount || 0) - (data?.kpis?.priorityOpenCount || 0)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, backgroundColor: GREEN, borderRadius: 2 }} />
                <span style={{ fontSize: 13, color: TEXT_MUTED }}>Completed</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: GREEN, marginLeft: 'auto', fontFamily: 'monospace' }}>
                  {data?.kpis?.completedCount || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {data?.charts?.openByStore?.length > 0 && (
          <div style={{
            backgroundColor: NAVY_CARD,
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#F7F9FC", marginBottom: 12 }}>
              Open Tasks by Store (Top 5)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.charts.openByStore.map((item: { store: string; count: number }, index: number) => {
                const maxCount = Math.max(...data.charts.openByStore.map((s: { count: number }) => s.count));
                const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                return (
                  <div key={item.store} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        fontSize: 12,
                        color: "#F7F9FC",
                        fontWeight: 500,
                        flex: 1,
                        paddingRight: 8,
                      }}>
                        {index + 1}. {item.store}
                      </span>
                      <span style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#F7F9FC",
                        fontFamily: 'monospace',
                      }}>
                        {item.count}
                      </span>
                    </div>
                    <div style={{
                      height: 6,
                      backgroundColor: 'rgba(23,68,111,0.4)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${barWidth}%`,
                        backgroundColor: ORANGE,
                        borderRadius: 3,
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
          backgroundColor: NAVY_CARD,
          borderRadius: 10,
          padding: 12,
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
            <TabsList style={{ width: '100%', marginBottom: 12 }}>
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
            marginBottom: 12,
          }}>
            <Search style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 16,
              height: 16,
              color: TEXT_MUTED,
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
                borderRadius: 8,
                border: `1px solid ${COLORS.lineBlue}`,
                fontSize: 14,
                color: "#F7F9FC",
                backgroundColor: NAVY_DEEP,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: 20, color: TEXT_MUTED }}>
                Loading...
              </div>
            ) : displayTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: TEXT_MUTED }}>
                No {activeTab} tasks found
              </div>
            ) : (
              <>
                {displayTasks.map((task: any) => (
                  <TaskRow
                    key={task.uniqueId}
                    task={task}
                    onClick={() => setLocation(`/task/${encodeURIComponent(task.uniqueId)}?rep=${encodeURIComponent(repName)}&from=rep-progress`)}
                  />
                ))}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      padding: 12,
                      marginTop: 8,
                      backgroundColor: ORANGE,
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 14,
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
