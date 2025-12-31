import { useState, useEffect, useMemo } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchTasks } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, CheckCircle2, LogOut } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Task } from "@shared/schema";

const ACTION_PRIORITY: Record<string, number> = {
  "Fix Counts: Negative SOH": 1,
  "Urgent: DC OOS": 2,
  "Urgent: Place Order - DC has stock": 3,
  "OOS – Stock on Order": 4,
  "Review: Risk of OOS": 5,
  "Check Count: No Sales in 30 Days": 6,
  "Monitor: Possible Overstock": 7,
  "Optimal": 8,
};

function sortTasks(tasks: Task[], filter: string): Task[] {
  return [...tasks].sort((a, b) => {
    if (filter === "pending" || filter === "all") {
      const priorityA = ACTION_PRIORITY[a.action] || 99;
      const priorityB = ACTION_PRIORITY[b.action] || 99;
      if (priorityA !== priorityB) return priorityA - priorityB;
      
      const wfcA = parseFloat(a.storeWfc) || Infinity;
      const wfcB = parseFloat(b.storeWfc) || Infinity;
      if (wfcA !== wfcB) return wfcA - wfcB;
      
      const sohA = parseFloat(a.storeSoh) || Infinity;
      const sohB = parseFloat(b.storeSoh) || Infinity;
      if (sohA !== sohB) return sohA - sohB;
      
      return (a.articleDescription || '').localeCompare(b.articleDescription || '');
    }
    return 0;
  });
}

interface TaskCardProps {
  task: Task;
  contextParams: string;
}

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

const FULL_ACTION_LIST = [
  "Fix Counts: Negative SOH",
  "Urgent: DC OOS",
  "Urgent: Place Order - DC has stock",
  "OOS – Stock on Order",
  "Review: Risk of OOS",
  "Check Count: No Sales in 30 Days",
  "Monitor: Possible Overstock",
  "Optimal",
];

function TaskCard({ task, contextParams }: TaskCardProps) {
  const isPending = task.actionStatus === 'Pending';
  const wfc = parseFloat(task.storeWfc);
  const hasWfc = !isNaN(wfc) && wfc > 0;
  const actionColor = getActionColor(task.action);

  const taskUrl = contextParams ? `/task/${task.uniqueId}?${contextParams}` : `/task/${task.uniqueId}`;

  return (
    <Link href={taskUrl} data-testid={`task-card-${task.uniqueId}`}>
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          padding: '14px 16px',
          borderLeft: `4px solid ${isPending ? actionColor : '#16A34A'}`,
          cursor: 'pointer',
        }}
      >
        <div style={{ 
          fontSize: '14px', 
          fontWeight: 700,
          color: actionColor,
          marginBottom: '8px',
          lineHeight: 1.3,
        }}>
          {task.action}
        </div>
        
        <h3 style={{ 
          fontSize: '15px', 
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
          fontSize: '12px', 
          fontFamily: 'monospace', 
          color: '#6B7280', 
          backgroundColor: '#F3F4F6',
          padding: '2px 6px',
          borderRadius: '4px',
          display: 'inline-block',
          marginBottom: '8px',
        }}>
          {task.barcode}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '12px', color: '#6B7280' }}>
            {task.client}
          </span>
          {hasWfc && (
            <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 500 }}>
              WFC: {wfc.toFixed(1)}
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          {!isPending && <CheckCircle2 style={{ width: '16px', height: '16px', color: '#16A34A' }} />}
        </div>
      </div>
    </Link>
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
  const [actionFilter, setActionFilter] = useState<string>("all");
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
    
    if (actionFilter !== "all") {
      tasks = tasks.filter(t => t.action === actionFilter);
    } else if (filter === "pending") {
      tasks = tasks.filter(t => t.action !== "Optimal");
    }
    
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      tasks = tasks.filter(t => 
        t.articleDescription?.toLowerCase().includes(searchLower) ||
        t.barcode?.toLowerCase().includes(searchLower) ||
        t.storeName?.toLowerCase().includes(searchLower) ||
        t.client?.toLowerCase().includes(searchLower)
      );
    }
    
    return sortTasks(tasks, filter);
  }, [allTasks, actionFilter, filter, debouncedSearch]);

  const actionChips = useMemo(() => {
    const counts = filter === "pending" 
      ? (summary?.pendingActionCounts || {}) 
      : (summary?.completedActionCounts || {});
    const chipOrder = [
      "Fix Counts: Negative SOH",
      "Urgent: DC OOS", 
      "Urgent: Place Order - DC has stock",
      "OOS – Stock on Order",
      "Review: Risk of OOS",
      "Check Count: No Sales in 30 Days",
      "Monitor: Possible Overstock",
      "Optimal",
    ];
    
    return chipOrder
      .filter(action => (counts[action] || 0) > 0 || action === "Optimal")
      .map(action => ({
        action,
        count: counts[action] || 0,
      }));
  }, [summary, filter]);
  
  const displayedPendingCount = summary?.pendingCountExcludingOptimal ?? summary?.pendingCount ?? 0;

  const formatWeekEnding = (dateStr: string | null) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

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
    <div style={{ minHeight: '100vh', backgroundColor: '#003B71' }}>
      <div style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
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

        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>
          Tasks
        </h1>
        
        {summary?.latestWeekEnding && (
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '12px' }}>
            Week Ending: {formatWeekEnding(summary.latestWeekEnding)}
          </p>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
          {repFilter && (
            <Badge style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#FFFFFF', fontSize: '11px' }}>
              Rep: {repFilter}
            </Badge>
          )}
          {storeFilter && (
            <Badge style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#FFFFFF', fontSize: '11px' }}>
              Store: {storeFilter}
            </Badge>
          )}
          {clientFilter && (
            <Badge style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: '#FFFFFF', fontSize: '11px' }}>
              Client: {clientFilter}
            </Badge>
          )}
        </div>

        <div 
          style={{ 
            backgroundColor: '#FFFFFF', 
            borderRadius: '12px', 
            padding: '12px',
            marginBottom: '16px',
          }}
        >
          <div style={{ position: 'relative', marginBottom: '12px' }}>
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
              style={{ paddingLeft: '36px', height: '40px', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <Button
              variant={filter === "pending" ? "default" : "outline"}
              size="sm"
              onClick={() => { setFilter("pending"); setActionFilter("all"); }}
              style={{ 
                borderRadius: '20px', 
                fontSize: '13px',
                backgroundColor: filter === "pending" ? '#003B71' : 'transparent',
              }}
              data-testid="button-filter-pending"
            >
              Pending ({displayedPendingCount})
            </Button>
            <Button
              variant={filter === "completed" ? "default" : "outline"}
              size="sm"
              onClick={() => { setFilter("completed"); setActionFilter("all"); }}
              style={{ 
                borderRadius: '20px', 
                fontSize: '13px',
                backgroundColor: filter === "completed" ? '#003B71' : 'transparent',
              }}
              data-testid="button-filter-completed"
            >
              Completed ({summary?.completedCount || 0})
            </Button>
          </div>

          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            gap: '6px',
          }}>
            {FULL_ACTION_LIST.map((action) => {
              const counts = filter === "pending" 
                ? (summary?.pendingActionCounts || {}) 
                : (summary?.completedActionCounts || {});
              const count = counts[action] || 0;
              
              if (count === 0 && action !== 'Optimal') return null;
              
              const bgColor = getActionColor(action);
              const isSelected = actionFilter === action;
              return (
                <button
                  key={action}
                  onClick={() => setActionFilter(actionFilter === action ? "all" : action)}
                  data-testid={`action-filter-${action.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: isSelected ? '3px solid #FFFFFF' : 'none',
                    backgroundColor: bgColor,
                    color: '#FFFFFF',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: action === 'Optimal' && count === 0 ? 0.5 : 1,
                  }}
                >
                  <span>{action}</span>
                  <span style={{ 
                    fontSize: '12px', 
                    fontWeight: 500,
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    padding: '2px 10px',
                    borderRadius: '10px',
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
            Showing {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isLoading ? (
            <>
              <Skeleton style={{ height: '120px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
              <Skeleton style={{ height: '120px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
              <Skeleton style={{ height: '120px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
            </>
          ) : filteredTasks.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '48px 16px',
              color: 'rgba(255,255,255,0.7)',
            }}>
              <p>No tasks found matching your criteria.</p>
            </div>
          ) : (
            filteredTasks.map((task) => (
              <TaskCard key={task.uniqueId} task={task} contextParams={contextParams} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
