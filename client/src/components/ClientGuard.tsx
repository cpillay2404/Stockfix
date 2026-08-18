import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAccess } from "@/context/AccessContext";

interface ClientGuardProps {
  children: React.ReactNode;
}

export function ClientGuard({ children }: ClientGuardProps) {
  const [, setLocation] = useLocation();
  const { accessMode, clientLocked, selectedClient, selectedStore } = useAccess();

  useEffect(() => {
    if (accessMode === "client" && clientLocked) {
      if (selectedClient && selectedStore) {
        // Fixed 2026-08-18 (Carin: client back-nav landed on the legacy
        // light-theme Store Overview) - a locked client session must stay
        // on the same new Insights/Fix screens a rep/merchandiser uses, not
        // fall back to the old /store-overview page.
        setLocation(`/store-detail?store=${encodeURIComponent(selectedStore)}&client=${encodeURIComponent(selectedClient)}`);
      } else {
        setLocation("/select-client");
      }
    }
  }, [accessMode, clientLocked, selectedClient, selectedStore, setLocation]);

  if (accessMode === "client" && clientLocked) {
    return null;
  }

  return <>{children}</>;
}
