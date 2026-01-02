import { useLocation } from "wouter";
import { ArrowLeft, LogOut } from "lucide-react";

interface TopHeaderProps {
  title: string;
  onBack?: () => void;
  showExitVisit?: boolean;
}

export default function TopHeader({ title, onBack, showExitVisit = true }: TopHeaderProps) {
  const [, setLocation] = useLocation();

  const handleExitVisit = () => {
    setLocation('/');
  };

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#003B71',
        padding: '16px',
        zIndex: 100,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        {onBack ? (
          <button
            onClick={onBack}
            data-testid="button-back"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'rgba(255,255,255,0.85)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              minWidth: '70px',
            }}
          >
            <ArrowLeft style={{ width: '18px', height: '18px' }} />
            <span>Back</span>
          </button>
        ) : (
          <div style={{ minWidth: '70px' }} />
        )}

        <h1
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '18px',
            fontWeight: 600,
            color: '#FFFFFF',
            margin: 0,
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h1>

        {showExitVisit ? (
          <button
            onClick={handleExitVisit}
            data-testid="button-exit-visit"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'rgba(255,255,255,0.85)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              minWidth: '70px',
              justifyContent: 'flex-end',
            }}
          >
            <LogOut style={{ width: '16px', height: '16px' }} />
            <span>Close & Sync</span>
          </button>
        ) : (
          <div style={{ minWidth: '70px' }} />
        )}
      </div>
    </div>
  );
}
