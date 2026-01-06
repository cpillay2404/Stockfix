import { useLocation } from "wouter";
import { User, Building2, Wrench } from "lucide-react";
import { useAccess } from "@/context/AccessContext";
import meridianGroupLogo from "@/assets/meridian-group-logo.png";
import meridianNexusLogo from "@/assets/meridian-nexus-logo.png";

export default function ChooseAccess() {
  const [, setLocation] = useLocation();
  const { setAccessMode, setSelectedRep, setSelectedClient, setClientLocked } = useAccess();

  const handleRepClick = () => {
    setAccessMode("rep");
    setSelectedClient(null);
    setClientLocked(false);
    setLocation("/select-rep");
  };

  const handleClientClick = () => {
    setAccessMode("client");
    setSelectedRep(null);
    setClientLocked(true);
    setLocation("/select-client");
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <button
            onClick={handleRepClick}
            data-testid="button-im-a-rep"
            style={{
              width: '100%',
              padding: '24px',
              backgroundColor: '#003B71',
              color: '#FFFFFF',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              fontSize: '18px',
              fontWeight: 600,
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#002F5A'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#003B71'}
          >
            <User style={{ width: '24px', height: '24px' }} />
            I'm a Rep
          </button>

          <button
            onClick={handleClientClick}
            data-testid="button-im-a-client"
            style={{
              width: '100%',
              padding: '24px',
              backgroundColor: '#F36C21',
              color: '#FFFFFF',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              fontSize: '18px',
              fontWeight: 600,
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E05A10'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F36C21'}
          >
            <Building2 style={{ width: '24px', height: '24px' }} />
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
