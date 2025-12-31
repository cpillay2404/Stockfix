import { useState, useEffect, useMemo } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchTasks } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, LogOut, User, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Task } from "@shared/schema";

const ACTION_PRIORITY_ORDER = [
  "Fix Counts: Negative SOH",
  "Urgent: DC OOS",
  "Urgent: Place Order - DC has stock",
  "OOS – Stock on Order",
  "Review: Risk of OOS",
  "Check Count: No Sales in 30 Days",
  "Monitor: Possible Overstock",
  "Optimal",
];

const getActionColor = (action: string) => {
  if (action === 'Fix Counts: Negative SOH') return '#DC2626';
  if (action === 'Urgent: DC OOS') return '#EA580C';
  if (action === 'Urgent: Place Order - DC has stock') return '#DC2626';
  if (action === 'Review: Risk of OOS') return '#EA580C';
  if (action === 'OOS – Stock on Order') return '#EA580C';
  if (action === 'Check Count: No Sales in 30 Days') return '#DC2626';
  if (action === 'Monitor: Possible Overstock') return '#60A5FA';
  if (action === 'Optimal') return '#16A34A';
  return '#6B7280';
};

interface TaskCardProps {
  task: Task;
  contextParams: string;
}

function TaskCard({ task, contextParams }: TaskCardProps) {
  const isPending = task.actionStatus === 'Pending';
  const wfc = parseFloat(task.storeWfc);
  const hasWfc = !isNaN(wfc) && wfc > 0;

  const taskUrl = contextParams ? `/task/${task.uniqueId}?${contextParams}` : `/task/${task.uniqueId}`;

  return (
    <Link href={taskUrl} data-testid={`task-card-${task.uniqueId}`}>
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          padding: '12px 14px',
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          border: '1px solid #E5E7EB',
        }}
      >
        <h3 style={{ 
          fontSize: '14px', 
          fontWeight: 600, 
          color: '#003B71', 
          marginBottom: '4px',
          lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {task.articleDescription}
        </h3>
        
        <div style={{ 
          fontSize: '11px', 
          fontFamily: 'monospace', 
          color: '#6B7280', 
          marginBottom: '6px',
        }}>
          {task.barcode}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#6B7280' }}>
            {task.client}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {hasWfc && (
              <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>
                WFC: {wfc.toFixed(1)}
              </span>
            )}
            <Badge 
              variant={isPending ? 'outline' : 'secondary'}
              style={{
                fontSize: '10px',
                backgroundColor: isPending ? 'transparent' : '#DCFCE7',
                color: isPending ? '#6B7280' : '#16A34A',
                border: isPending ? '1px solid #D1D5DB' : 'none',
              }}
            >
              {task.actionStatus}
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  );
}

interface ActionSectionProps {
  action: string;
  tasks: Task[];
  contextParams: string;
}

function ActionSection({ action, tasks, contextParams }: ActionSectionProps) {
  const color = getActionColor(action);
  
  return (
    <div style={{ marginBottom: '16px' }} data-testid={`section-${action.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}>
      <div 
        style={{ 
          display: 'flex',
          alignItems: 'center',
          marginBottom: '8px',
          backgroundColor: '#F9FAFB',
          borderRadius: '6px',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: '5px', backgroundColor: color, alignSelf: 'stretch', minHeight: '36px' }} />
        <div style={{ padding: '8px 12px', flex: 1 }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
            {action} ({tasks.length})
          </span>
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '5px' }}>
        {tasks.map((task) => (
          <TaskCard key={task.uniqueId} task={task} contextParams={contextParams} />
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  
  const repFilter = urlParams.get('rep') || '';
  const storeFilter = urlParams.get('store') || '';
  const clientFilter = urlParams.get('client') || '';
  const articleFilter = urlParams.get('article') || '';

  const [filter, setFilter] = useState<"pending" | "completed">("pending");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: summary } = useQuery({
    queryKey: ["task-summary", repFilter, storeFilter, clientFilter, articleFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (repFilter) params.set('rep', repFilter);
      if (storeFilter) params.set('store', storeFilter);
      if (clientFilter) params.set('client', clientFilter);
      if (articleFilter) params.set('article', articleFilter);
      const res = await fetch(`/api/tasks/summary?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", 1, debouncedSearch, filter, repFilter, storeFilter, clientFilter, articleFilter],
    queryFn: () => fetchTasks(1, 500, debouncedSearch, filter, {
      rep: repFilter,
      store: storeFilter,
      client: clientFilter,
      article: articleFilter,
    }),
  });

  const allTasks: Task[] = data?.tasks || [];
  
  const filteredTasks = useMemo(() => {
    let tasks = allTasks;
    
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      tasks = tasks.filter(t => 
        t.articleDescription?.toLowerCase().includes(searchLower) ||
        t.barcode?.toLowerCase().includes(searchLower) ||
        t.storeName?.toLowerCase().includes(searchLower) ||
        t.client?.toLowerCase().includes(searchLower)
      );
    }
    
    return tasks;
  }, [allTasks, debouncedSearch]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    
    for (const task of filteredTasks) {
      const action = task.action || 'Unknown';
      if (!groups[action]) {
        groups[action] = [];
      }
      groups[action].push(task);
    }
    
    return ACTION_PRIORITY_ORDER
      .filter(action => groups[action] && groups[action].length > 0)
      .map(action => ({
        action,
        tasks: groups[action],
      }));
  }, [filteredTasks]);

  const displayedPendingCount = summary?.pendingCountExcludingOptimal ?? summary?.pendingCount ?? 0;

  const handleBack = () => {
    const params = new URLSearchParams();
    if (repFilter) params.set('rep', repFilter);
    if (storeFilter) params.set('store', storeFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (articleFilter) params.set('article', articleFilter);
    setLocation(`/store-overview?${params.toString()}`);
  };

  const handleExitVisit = () => {
    setLocation('/');
  };

  const contextParams = useMemo(() => {
    const params = new URLSearchParams();
    if (repFilter) params.set('rep', repFilter);
    if (storeFilter) params.set('store', storeFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (articleFilter) params.set('article', articleFilter);
    return params.toString();
  }, [repFilter, storeFilter, clientFilter, articleFilter]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6' }}>
      {/* Header Section - Blue */}
      <div style={{ backgroundColor: '#003B71', padding: '16px' }}>
        {/* Navigation Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', position: 'relative' }}>
          <button
            onClick={handleBack}
            data-testid="button-back"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '14px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <ArrowLeft style={{ width: '18px', height: '18px' }} />
            <span>Back</span>
          </button>
          
          {/* Centered Title */}
          <h1 
            style={{ 
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '20px', 
              fontWeight: 700, 
              color: '#FFFFFF',
              margin: 0,
            }}
          >
            Tasks
          </h1>
          
          <button
            onClick={handleExitVisit}
            data-testid="button-exit-visit"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '14px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <LogOut style={{ width: '16px', height: '16px' }} />
            <span>Exit Visit</span>
          </button>
        </div>

        {/* Rep and Store Context Row */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {repFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.7)' }} />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>{repFilter}</span>
            </div>
          )}
          {storeFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.7)' }} />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>{storeFilter}</span>
            </div>
          )}
        </div>
      </div>

      {/* Content Section - Grey Background */}
      <div style={{ padding: '16px' }}>
        {/* Search and Filter Card */}
        <div 
          style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: '10px', 
            padding: '12px',
            marginBottom: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <Search style={{ 
              position: 'absolute', 
              left: '10px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              width: '16px', 
              height: '16px', 
              color: '#9CA3AF' 
            }} />
            <Input
              placeholder="Search article, barcode, client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
              style={{ paddingLeft: '36px', height: '38px', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant={filter === "pending" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("pending")}
              style={{ 
                borderRadius: '20px', 
                fontSize: '13px',
                backgroundColor: filter === "pending" ? '#003B71' : 'transparent',
                flex: 1,
              }}
              data-testid="button-filter-pending"
            >
              Pending ({displayedPendingCount})
            </Button>
            <Button
              variant={filter === "completed" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("completed")}
              style={{ 
                borderRadius: '20px', 
                fontSize: '13px',
                backgroundColor: filter === "completed" ? '#003B71' : 'transparent',
                flex: 1,
              }}
              data-testid="button-filter-completed"
            >
              Completed ({summary?.completedCount || 0})
            </Button>
          </div>
        </div>

        {/* Task Sections */}
        {isLoading ? (
          <>
            <Skeleton style={{ height: '40px', borderRadius: '6px', backgroundColor: '#E5E7EB', marginBottom: '8px' }} />
            <Skeleton style={{ height: '80px', borderRadius: '8px', backgroundColor: '#E5E7EB', marginBottom: '8px' }} />
            <Skeleton style={{ height: '80px', borderRadius: '8px', backgroundColor: '#E5E7EB', marginBottom: '16px' }} />
            <Skeleton style={{ height: '40px', borderRadius: '6px', backgroundColor: '#E5E7EB', marginBottom: '8px' }} />
            <Skeleton style={{ height: '80px', borderRadius: '8px', backgroundColor: '#E5E7EB' }} />
          </>
        ) : groupedTasks.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '48px 16px',
            color: '#6B7280',
          }}>
            <p>No tasks found matching your criteria.</p>
          </div>
        ) : (
          groupedTasks.map(({ action, tasks }) => (
            <ActionSection 
              key={action} 
              action={action} 
              tasks={tasks} 
              contextParams={contextParams} 
            />
          ))
        )}
      </div>
    </div>
  );
}
