import { useLocation } from "wouter";
import { LayoutDashboard, ClipboardList, MessageSquare, LogOut } from "lucide-react";

interface BottomNavProps {
  rep?: string;
  store?: string;
  client?: string;
  activeTaskId?: string | null;
}

export default function BottomNav({ rep = '', store = '', client, activeTaskId }: BottomNavProps) {
  const [location, setLocation] = useLocation();

  const buildUrl = (path: string) => {
    const params = new URLSearchParams();
    if (rep) params.set('rep', rep);
    if (store) params.set('store', store);
    if (client) params.set('client', client);
    return `${path}?${params.toString()}`;
  };

  const isOverview = location.includes('/store-overview');
  const isTasks = location.includes('/tasks') && !location.includes('/task/');
  const isFeedback = location.includes('/task/');

  const handleOverview = () => setLocation(buildUrl('/store-overview'));
  const handleTasks = () => setLocation(buildUrl('/tasks'));
  const handleFeedback = () => {
    if (activeTaskId) {
      const params = new URLSearchParams();
      if (rep) params.set('rep', rep);
      if (store) params.set('store', store);
      if (client) params.set('client', client);
      setLocation(`/task/${activeTaskId}?${params.toString()}`);
    }
  };
  const handleVisit = () => {
    const params = new URLSearchParams();
    if (rep) params.set('rep', rep);
    if (store) params.set('store', store);
    if (client) params.set('client', client);
    setLocation(`/exit-visit?${params.toString()}`);
  };

  const feedbackDisabled = !activeTaskId;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '56px',
        backgroundColor: '#0D2137',
        borderTop: '1px solid rgba(23,68,111,0.6)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        zIndex: 1000,
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.15)',
      }}
      data-testid="bottom-nav"
    >
      <button
        onClick={handleOverview}
        data-testid="nav-overview"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 0',
        }}
      >
        <LayoutDashboard style={{ width: '20px', height: '20px', color: isOverview ? '#F58220' : 'rgba(220,231,247,0.55)' }} />
        <span style={{ fontSize: '10px', color: isOverview ? '#F58220' : 'rgba(220,231,247,0.55)', fontWeight: isOverview ? 600 : 400 }}>Overview</span>
      </button>

      <button
        onClick={handleTasks}
        data-testid="nav-tasks"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 0',
        }}
      >
        <ClipboardList style={{ width: '20px', height: '20px', color: isTasks ? '#F58220' : 'rgba(220,231,247,0.55)' }} />
        <span style={{ fontSize: '10px', color: isTasks ? '#F58220' : 'rgba(220,231,247,0.55)', fontWeight: isTasks ? 600 : 400 }}>Tasks</span>
      </button>

      <button
        onClick={handleFeedback}
        disabled={feedbackDisabled}
        data-testid="nav-feedback"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          background: 'none',
          border: 'none',
          cursor: feedbackDisabled ? 'not-allowed' : 'pointer',
          padding: '8px 0',
          opacity: feedbackDisabled ? 0.4 : 1,
        }}
      >
        <MessageSquare style={{ width: '20px', height: '20px', color: isFeedback ? '#F58220' : 'rgba(220,231,247,0.55)' }} />
        <span style={{ fontSize: '10px', color: isFeedback ? '#F58220' : 'rgba(220,231,247,0.55)', fontWeight: isFeedback ? 600 : 400 }}>Feedback</span>
      </button>

      <button
        onClick={handleVisit}
        data-testid="nav-visit"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '8px 0',
        }}
      >
        <LogOut style={{ width: '20px', height: '20px', color: 'rgba(220,231,247,0.55)' }} />
        <span style={{ fontSize: '10px', color: 'rgba(220,231,247,0.55)', fontWeight: 400 }}>Visit</span>
      </button>
    </div>
  );
}
