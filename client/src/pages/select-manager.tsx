import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Wrench, Users, ChevronRight } from "lucide-react";
import { useAccess } from "@/context/AccessContext";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import meridianNexusLogo from "@/assets/meridian-nexus-logo.png";

export default function SelectManager() {
  const [, setLocation] = useLocation();
  const { accessMode, setAccessMode, setSelectedManager } = useAccess();

  useEffect(() => {
    if (accessMode !== "manager") {
      setAccessMode("manager");
    }
  }, [accessMode, setAccessMode]);

  const { data: managersData, isLoading } = useQuery({
    queryKey: ["managers"],
    queryFn: async () => {
      const res = await fetch("/api/managers");
      if (!res.ok) throw new Error("Failed to fetch managers");
      return res.json();
    },
  });

  const managers: string[] = managersData?.managers || [];

  const handleBack = () => {
    setLocation("/");
  };

  const handleManagerSelect = (manager: string) => {
    setSelectedManager(manager);
    setLocation(`/manager-progress?manager=${encodeURIComponent(manager)}`);
  };

  return (
    <div 
      className="h-screen flex flex-col items-center overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #003B71 0%, #002F5A 100%)' }}
    >
      <div style={{ paddingTop: '32px', paddingBottom: '20px' }}>
        <img 
          src={meridianGroupLogo} 
          alt="Meridian Group" 
          style={{ height: '48px' }}
        />
      </div>

      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Wrench style={{ width: '28px', height: '28px', color: '#F36C21' }} />
          <span style={{ fontSize: '30px', fontWeight: 700, color: '#FFFFFF' }}>
            StockFix
          </span>
        </div>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.7)', marginTop: '6px' }}>
          Manager Login
        </p>
      </div>

      <div 
        style={{
          width: '420px',
          maxWidth: 'calc(100% - 32px)',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0px 16px 40px rgba(0,0,0,0.25)',
          maxHeight: 'calc(100vh - 280px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <button
          onClick={handleBack}
          data-testid="button-back"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#003B71',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          <ArrowLeft style={{ width: '18px', height: '18px' }} />
          Back
        </button>

        <label style={{ fontSize: '14px', color: '#003B71', marginBottom: '12px', display: 'block', fontWeight: 500 }}>
          Select Your Name
        </label>

        {isLoading && (
          <p style={{ fontSize: '14px', color: '#9CA3AF', textAlign: 'center', padding: '20px' }}>
            Loading managers...
          </p>
        )}

        {!isLoading && managers.length === 0 && (
          <p style={{ fontSize: '14px', color: '#9CA3AF', textAlign: 'center', padding: '20px' }}>
            No managers found. Please ensure LINE MANAGER column is in your imported data.
          </p>
        )}

        {!isLoading && managers.length > 0 && (
          <div style={{ 
            overflowY: 'auto', 
            flex: 1,
            WebkitOverflowScrolling: 'touch',
          }}>
            {managers.map((manager) => (
              <button
                key={manager}
                onClick={() => handleManagerSelect(manager)}
                data-testid={`manager-${manager}`}
                style={{
                  width: '100%',
                  padding: '16px',
                  backgroundColor: '#F8FAFC',
                  color: '#003B71',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '16px',
                  fontWeight: 500,
                  marginBottom: '8px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#003B71';
                  e.currentTarget.style.color = '#FFFFFF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                  e.currentTarget.style.color = '#003B71';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Users style={{ width: '20px', height: '20px' }} />
                  {manager}
                </div>
                <ChevronRight style={{ width: '18px', height: '18px', opacity: 0.5 }} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ paddingBottom: '20px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: 0, textAlign: 'center' }}>
            Powered by
          </p>
          <img 
            src={meridianNexusLogo} 
            alt="Meridian Nexus" 
            style={{ height: '80px', display: 'block' }}
          />
        </div>
      </div>
    </div>
  );
}
