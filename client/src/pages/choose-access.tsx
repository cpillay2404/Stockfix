import { useLocation, useSearch } from "wouter";
import { useEffect } from "react";
import { User, Building2, Wrench, Users, AlertTriangle } from "lucide-react";
import { useAccess } from "@/context/AccessContext";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import meridianNexusLogo from "@/assets/meridian-nexus-logo.png";

// MAINTENANCE BANNER - Set to false to hide
const SHOW_MAINTENANCE_BANNER = false;

export default function ChooseAccess() {
  const [, setLocation] = useLocation();
  const { accessMode, clientLocked, selectedClient, selectedStore, setAccessMode, setSelectedRep, setSelectedClient, setClientLocked } = useAccess();
  const searchString = useSearch();
  const showQR = new URLSearchParams(searchString).get('qr') === '1';

  useEffect(() => {
    if (accessMode === "client" && clientLocked && selectedClient && selectedStore) {
      setLocation(`/store-overview?store=${encodeURIComponent(selectedStore)}&client=${encodeURIComponent(selectedClient)}`);
    } else if (accessMode === "client" && clientLocked) {
      setLocation("/select-client");
    }
  }, [accessMode, clientLocked, selectedClient, selectedStore, setLocation]);

  const handleRepClick = () => {
    setAccessMode("rep");
    setSelectedClient(null);
    setClientLocked(false);
    setLocation("/select-rep");
  };

  const handleManagerClick = () => {
    setAccessMode("manager");
    setSelectedClient(null);
    setClientLocked(false);
    setLocation("/select-manager");
  };

  const handleClientClick = () => {
    setAccessMode("client");
    setSelectedRep(null);
    setClientLocked(true);
    setLocation("/select-client");
  };

  if (showQR) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#fff' }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33" shapeRendering="crispEdges" width="400" height="400">
          <path fill="#FFFFFF" d="M0 0h33v33H0z"/>
          <path stroke="#003B71" d="M2 2.5h7m2 0h1m1 0h1m2 0h1m4 0h1m2 0h7M2 3.5h1m5 0h1m1 0h1m3 0h2m3 0h4m1 0h1m5 0h1M2 4.5h1m1 0h3m1 0h1m4 0h2m2 0h1m2 0h1m1 0h1m1 0h1m1 0h3m1 0h1M2 5.5h1m1 0h3m1 0h1m3 0h1m1 0h2m2 0h1m5 0h1m1 0h3m1 0h1M2 6.5h1m1 0h3m1 0h1m1 0h1m1 0h4m2 0h4m2 0h1m1 0h3m1 0h1M2 7.5h1m5 0h1m2 0h1m4 0h3m1 0h2m2 0h1m5 0h1M2 8.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M12 9.5h2m3 0h1m1 0h1m1 0h2M2 10.5h1m1 0h1m1 0h1m1 0h1m5 0h1m3 0h2m1 0h2m3 0h1m2 0h1M3 11.5h5m4 0h2m1 0h1m1 0h3m2 0h3m2 0h1m2 0h1M2 12.5h1m2 0h1m2 0h1m5 0h1m1 0h3m1 0h1m1 0h1m2 0h1m2 0h3M2 13.5h4m5 0h1m3 0h2m1 0h4m2 0h2m3 0h1M4 14.5h1m1 0h3m2 0h2m3 0h2m1 0h1m3 0h2m2 0h1m1 0h2M2 15.5h2m3 0h1m5 0h1m2 0h2m1 0h2m1 0h3m2 0h1m2 0h1M8 16.5h1m2 0h1m1 0h1m1 0h1m4 0h1m2 0h3m1 0h1m1 0h2M2 17.5h2m1 0h1m3 0h1m4 0h1m2 0h1m1 0h1m1 0h4m1 0h2m1 0h1M3 18.5h1m1 0h1m1 0h2m4 0h2m3 0h2m2 0h3m2 0h1m1 0h2M3 19.5h1m3 0h1m1 0h1m5 0h1m1 0h4m1 0h3m2 0h2m1 0h1M2 20.5h1m2 0h1m1 0h3m2 0h1m1 0h1m1 0h3m1 0h1m1 0h1m3 0h1m2 0h2M3 21.5h1m2 0h2m2 0h1m2 0h1m1 0h2m1 0h2m7 0h1m1 0h1M2 22.5h1m1 0h7m1 0h1m1 0h1m1 0h2m2 0h1m1 0h5M10 23.5h2m4 0h2m4 0h1m3 0h1m1 0h3M2 24.5h7m3 0h1m2 0h1m3 0h1m1 0h2m1 0h1m1 0h2m1 0h2M2 25.5h1m5 0h1m3 0h2m3 0h1m4 0h1m3 0h2m2 0h1M2 26.5h1m1 0h3m1 0h1m1 0h3m1 0h1m3 0h1m3 0h5M2 27.5h1m1 0h3m1 0h1m2 0h1m2 0h2m1 0h3m1 0h2m3 0h1m1 0h1M2 28.5h1m1 0h3m1 0h1m1 0h1m3 0h1m1 0h3m1 0h2m1 0h1m1 0h3m2 0h1M2 29.5h1m5 0h1m2 0h1m3 0h1m2 0h7m1 0h1m2 0h1M2 30.5h7m1 0h1m1 0h2m1 0h1m1 0h1m2 0h1m1 0h1m1 0h1m1 0h2m1 0h2"/>
        </svg>
      </div>
    );
  }

  return (
    <div 
      className="h-screen flex flex-col items-center overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #003B71 0%, #002F5A 100%)' }}
    >
      {/* Maintenance Banner */}
      {SHOW_MAINTENANCE_BANNER && (
        <div 
          style={{
            width: '100%',
            backgroundColor: '#F97316',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          data-testid="banner-maintenance"
        >
          <AlertTriangle style={{ width: '20px', height: '20px', color: '#FFFFFF', flexShrink: 0 }} />
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF', textAlign: 'center' }}>
            Under maintenance - new tasks loading. Please be patient.
          </span>
        </div>
      )}

      <div style={{ paddingTop: SHOW_MAINTENANCE_BANNER ? '16px' : '32px', paddingBottom: '20px' }}>
        <img 
          src={meridianGroupLogo} 
          alt="Meridian Group" 
          style={{ height: '48px' }}
          data-testid="img-meridian-group-logo"
        />
      </div>

      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Wrench style={{ width: '28px', height: '28px', color: '#F36C21' }} />
          <span style={{ fontSize: '30px', fontWeight: 700, color: '#FFFFFF' }} data-testid="text-title">
            StockFix
          </span>
        </div>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.7)', marginTop: '6px' }} data-testid="text-subtitle">
          Field Inventory Management
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
        }}
      >
        <h2 style={{ 
          fontSize: '18px', 
          fontWeight: 600, 
          color: '#003B71', 
          textAlign: 'center',
          marginBottom: '24px',
        }}>
          Choose Access
        </h2>

        <div style={{ 
          backgroundColor: '#F0F4F8',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '16px',
        }}>
          <div style={{ 
            fontSize: '12px', 
            fontWeight: 600, 
            color: '#6B7280',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
            textAlign: 'center',
          }}>
            Internal
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button
              onClick={handleRepClick}
              data-testid="button-im-a-rep"
              style={{
                width: '100%',
                padding: '20px',
                backgroundColor: '#003B71',
                color: '#FFFFFF',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                fontSize: '16px',
                fontWeight: 600,
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#002F5A'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#003B71'}
            >
              <User style={{ width: '22px', height: '22px' }} />
              I'm a Rep
            </button>

            <button
              onClick={handleManagerClick}
              data-testid="button-im-a-manager"
              style={{
                width: '100%',
                padding: '20px',
                backgroundColor: '#005a9e',
                color: '#FFFFFF',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                fontSize: '16px',
                fontWeight: 600,
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#004a88'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#005a9e'}
            >
              <Users style={{ width: '22px', height: '22px' }} />
              I'm a Manager
            </button>
          </div>
        </div>

        <div style={{ 
          backgroundColor: '#FFF7ED',
          borderRadius: '12px',
          padding: '16px',
        }}>
          <div style={{ 
            fontSize: '12px', 
            fontWeight: 600, 
            color: '#9A6B3A',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
            textAlign: 'center',
          }}>
            External
          </div>
          <button
            onClick={handleClientClick}
            data-testid="button-im-a-client"
            style={{
              width: '100%',
              padding: '20px',
              backgroundColor: '#F36C21',
              color: '#FFFFFF',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              fontSize: '16px',
              fontWeight: 600,
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E05A10'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F36C21'}
          >
            <Building2 style={{ width: '22px', height: '22px' }} />
            I'm a Client
          </button>
        </div>
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
