import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Clock, Camera, AlertCircle, Store, ChevronRight } from "lucide-react";
import { Task } from "@shared/schema";
import { fetchTasks } from "@/lib/api";

export default function ExitVisit() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  
  const repFilter = urlParams.get('rep') || '';
  const storeFilter = urlParams.get('store') || '';
  const clientFilter = urlParams.get('client') || '';
  const articleFilter = urlParams.get('article') || '';

  const [visitStartTime] = useState(() => {
    const stored = sessionStorage.getItem('visitStartTime');
    return stored ? new Date(stored) : new Date();
  });

  const [timeSpent, setTimeSpent] = useState('0 minutes');

  useEffect(() => {
    const now = new Date();
    const diffMs = now.getTime() - visitStartTime.getTime();
    const diffMins = Math.round(diffMs / 60000);
    if (diffMins < 60) {
      setTimeSpent(`${diffMins} minutes`);
    } else {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      setTimeSpent(`${hours}h ${mins}m`);
    }
  }, [visitStartTime]);

  const { data: pendingData } = useQuery({
    queryKey: ["exit-pending", repFilter, storeFilter, clientFilter, articleFilter],
    queryFn: () => fetchTasks(1, 1000, '', 'pending', {
      rep: repFilter,
      store: storeFilter,
      client: clientFilter,
      article: articleFilter,
    }),
  });

  const { data: completedData } = useQuery({
    queryKey: ["exit-completed", repFilter, storeFilter, clientFilter, articleFilter],
    queryFn: () => fetchTasks(1, 1000, '', 'completed', {
      rep: repFilter,
      store: storeFilter,
      client: clientFilter,
      article: articleFilter,
    }),
  });

  const completedTasks: Task[] = completedData?.tasks || [];
  const pendingTasks: Task[] = pendingData?.tasks || [];

  const photosCount = useMemo(() => {
    let count = 0;
    for (const task of completedTasks) {
      if (task.image1) count++;
      if (task.image2) count++;
    }
    return count;
  }, [completedTasks]);

  const reasonCodeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of completedTasks) {
      if (task.reasonCode) {
        counts[task.reasonCode] = (counts[task.reasonCode] || 0) + 1;
      }
    }
    return counts;
  }, [completedTasks]);

  const comments = useMemo(() => {
    const list: string[] = [];
    for (const task of completedTasks) {
      if (task.actionTakenComment && task.actionTakenComment.trim()) {
        list.push(task.actionTakenComment.trim());
      }
    }
    return list;
  }, [completedTasks]);

  const handleBack = () => {
    const params = new URLSearchParams();
    if (repFilter) params.set('rep', repFilter);
    if (storeFilter) params.set('store', storeFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (articleFilter) params.set('article', articleFilter);
    setLocation(`/tasks?${params.toString()}`);
  };

  const handleCloseVisit = () => {
    sessionStorage.removeItem('visitStartTime');
    setLocation('/');
  };

  const visitDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  
  const visitTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F3F4F6', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#003B71', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={handleBack}
          data-testid="button-back"
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'white',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <ArrowLeft style={{ width: '20px', height: '20px' }} />
        </button>
        <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'white', margin: 0 }}>
          Close & Sync Visit
        </h1>
        <div style={{ width: '20px' }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto', paddingBottom: '100px' }}>
        {/* Store Info Card */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '12px', 
          padding: '16px',
          marginBottom: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              backgroundColor: '#E8F4FD', 
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Store style={{ width: '24px', height: '24px', color: '#003B71' }} />
            </div>
            <div>
              <p style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', margin: 0 }}>
                Store: {storeFilter || 'All Stores'}
              </p>
              <p style={{ fontSize: '14px', color: '#6B7280', margin: '2px 0 0 0' }}>
                Rep: {repFilter || 'Unknown'}
              </p>
              <p style={{ fontSize: '13px', color: '#9CA3AF', margin: '2px 0 0 0' }}>
                Visit Date: {visitDate}, {visitTime}
              </p>
            </div>
          </div>
        </div>

        {/* Success Banner */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '12px', 
          padding: '20px',
          marginBottom: '16px',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <div style={{ 
            width: '48px', 
            height: '48px', 
            backgroundColor: '#D1FAE5', 
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <CheckCircle2 style={{ width: '28px', height: '28px', color: '#10B981' }} />
          </div>
          <p style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', margin: 0 }}>
            Visit Completed Successfully
          </p>
        </div>

        {/* Visit Summary Header */}
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1F2937', margin: '0 0 12px 0' }}>
          Visit Summary
        </h2>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          {/* Tasks Completed */}
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '12px', 
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <CheckCircle2 style={{ width: '18px', height: '18px', color: '#10B981' }} />
              <span style={{ fontSize: '13px', color: '#6B7280' }}>Tasks Completed</span>
            </div>
            <p style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937', margin: 0 }}>
              {completedTasks.length}
            </p>
          </div>

          {/* Tasks Outstanding */}
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '12px', 
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <AlertCircle style={{ width: '18px', height: '18px', color: '#F59E0B' }} />
              <span style={{ fontSize: '13px', color: '#6B7280' }}>Tasks Outstanding</span>
            </div>
            <p style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937', margin: 0 }}>
              {pendingTasks.length}
            </p>
          </div>

          {/* Photos Captured */}
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '12px', 
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Camera style={{ width: '18px', height: '18px', color: '#3B82F6' }} />
              <span style={{ fontSize: '13px', color: '#6B7280' }}>Photos Captured</span>
            </div>
            <p style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937', margin: 0 }}>
              {photosCount}
            </p>
          </div>

          {/* Time Spent */}
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '12px', 
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Clock style={{ width: '18px', height: '18px', color: '#F97316' }} />
              <span style={{ fontSize: '13px', color: '#6B7280' }}>Time Spent</span>
            </div>
            <p style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937', margin: 0 }}>
              {timeSpent}
            </p>
          </div>
        </div>

        {/* Reason Codes and Comments Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          {/* Reason Codes */}
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '12px', 
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', margin: '0 0 12px 0' }}>
              Reason Codes
            </p>
            {Object.keys(reasonCodeCounts).length === 0 ? (
              <p style={{ fontSize: '13px', color: '#9CA3AF', margin: 0 }}>No reason codes</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(reasonCodeCounts).map(([code, count]) => (
                  <div key={code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#4B5563' }}>{code}:</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1F2937' }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments */}
          <div style={{ 
            backgroundColor: 'white', 
            borderRadius: '12px', 
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', margin: 0 }}>
                Comments
              </p>
              <span style={{ 
                backgroundColor: '#E5E7EB', 
                borderRadius: '10px', 
                padding: '2px 8px',
                fontSize: '12px',
                fontWeight: 500,
                color: '#6B7280',
              }}>
                {comments.length}
              </span>
            </div>
            {comments.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#9CA3AF', margin: 0 }}>No comments</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {comments.slice(0, 3).map((comment, idx) => (
                  <p key={idx} style={{ fontSize: '12px', color: '#4B5563', margin: 0 }}>
                    • {comment.length > 30 ? comment.substring(0, 30) + '...' : comment}
                  </p>
                ))}
                {comments.length > 3 && (
                  <p style={{ fontSize: '11px', color: '#9CA3AF', margin: 0 }}>
                    +{comments.length - 3} more
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Visit Summary Expandable */}
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '12px', 
          padding: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: '#1F2937', margin: 0 }}>
              Visit summary
            </p>
            <ChevronRight style={{ width: '18px', height: '18px', color: '#9CA3AF' }} />
          </div>
          {Object.keys(reasonCodeCounts).length === 0 ? (
            <p style={{ fontSize: '13px', color: '#9CA3AF', margin: 0 }}>No actions recorded</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {Object.entries(reasonCodeCounts).map(([code, count]) => (
                <p key={code} style={{ fontSize: '13px', color: '#4B5563', margin: 0 }}>
                  • {code}: {count}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Close Visit Button */}
      <div style={{ 
        position: 'fixed', 
        bottom: 0, 
        left: 0, 
        right: 0, 
        padding: '16px',
        backgroundColor: '#F3F4F6',
      }}>
        <button
          onClick={handleCloseVisit}
          data-testid="button-close-visit"
          style={{
            width: '100%',
            backgroundColor: '#003B71',
            color: 'white',
            fontSize: '16px',
            fontWeight: 600,
            padding: '16px',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Close & Sync Visit
        </button>
      </div>
    </div>
  );
}
