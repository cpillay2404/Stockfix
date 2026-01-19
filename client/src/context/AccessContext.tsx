import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type AccessMode = "rep" | "client" | "manager" | null;

interface AccessContextType {
  accessMode: AccessMode;
  setAccessMode: (mode: AccessMode) => void;
  selectedRep: string | null;
  setSelectedRep: (rep: string | null) => void;
  selectedClient: string | null;
  setSelectedClient: (client: string | null) => void;
  clientLocked: boolean;
  setClientLocked: (locked: boolean) => void;
  selectedStore: string | null;
  setSelectedStore: (store: string | null) => void;
  selectedManager: string | null;
  setSelectedManager: (manager: string | null) => void;
  clearAll: () => void;
}

const AccessContext = createContext<AccessContextType | undefined>(undefined);

const STORAGE_KEY = "stockfix_access_state";

interface StoredState {
  accessMode: AccessMode;
  selectedRep: string | null;
  selectedClient: string | null;
  clientLocked: boolean;
  selectedStore: string | null;
  selectedManager: string | null;
}

function loadStoredState(): StoredState {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Failed to load access state:", e);
  }
  return {
    accessMode: null,
    selectedRep: null,
    selectedClient: null,
    clientLocked: false,
    selectedStore: null,
    selectedManager: null,
  };
}

function saveState(state: StoredState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save access state:", e);
  }
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [accessMode, setAccessModeState] = useState<AccessMode>(null);
  const [selectedRep, setSelectedRepState] = useState<string | null>(null);
  const [selectedClient, setSelectedClientState] = useState<string | null>(null);
  const [clientLocked, setClientLockedState] = useState(false);
  const [selectedStore, setSelectedStoreState] = useState<string | null>(null);
  const [selectedManager, setSelectedManagerState] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredState();
    setAccessModeState(stored.accessMode);
    setSelectedRepState(stored.selectedRep);
    setSelectedClientState(stored.selectedClient);
    setClientLockedState(stored.clientLocked);
    setSelectedStoreState(stored.selectedStore);
    setSelectedManagerState(stored.selectedManager);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (initialized) {
      saveState({
        accessMode,
        selectedRep,
        selectedClient,
        clientLocked,
        selectedStore,
        selectedManager,
      });
    }
  }, [initialized, accessMode, selectedRep, selectedClient, clientLocked, selectedStore, selectedManager]);

  const setAccessMode = (mode: AccessMode) => {
    setAccessModeState(mode);
  };

  const setSelectedRep = (rep: string | null) => {
    setSelectedRepState(rep);
  };

  const setSelectedClient = (client: string | null) => {
    setSelectedClientState(client);
  };

  const setClientLocked = (locked: boolean) => {
    setClientLockedState(locked);
  };

  const setSelectedStore = (store: string | null) => {
    setSelectedStoreState(store);
  };

  const setSelectedManager = (manager: string | null) => {
    setSelectedManagerState(manager);
  };

  const clearAll = () => {
    setAccessModeState(null);
    setSelectedRepState(null);
    setSelectedClientState(null);
    setClientLockedState(false);
    setSelectedStoreState(null);
    setSelectedManagerState(null);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('visitStartTime');
  };

  return (
    <AccessContext.Provider
      value={{
        accessMode,
        setAccessMode,
        selectedRep,
        setSelectedRep,
        selectedClient,
        setSelectedClient,
        clientLocked,
        setClientLocked,
        selectedStore,
        setSelectedStore,
        selectedManager,
        setSelectedManager,
        clearAll,
      }}
    >
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  const context = useContext(AccessContext);
  if (!context) {
    throw new Error("useAccess must be used within an AccessProvider");
  }
  return context;
}
