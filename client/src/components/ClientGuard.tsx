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
        setLocation(`/store-overview?store=${encodeURIComponent(selectedStore)}&client=${encodeURIComponent(selectedClient)}`);
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
