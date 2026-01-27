import { useState, useEffect } from 'react';

export type UserRole = 'manager' | 'rep' | 'client';

interface UserRoleState {
  role: UserRole;
  clientName: string | null;
}

export function useUserRole() {
  const [state, setState] = useState<UserRoleState>(() => {
    const storedRole = localStorage.getItem('stockfix-role');
    const storedClientName = localStorage.getItem('stockfix-client-name');
    
    let role: UserRole = 'manager';
    if (storedRole === 'manager' || storedRole === 'rep' || storedRole === 'client') {
      role = storedRole;
    }
    
    return {
      role,
      clientName: storedClientName
    };
  });

  useEffect(() => {
    localStorage.setItem('stockfix-role', state.role);
    if (state.clientName) {
      localStorage.setItem('stockfix-client-name', state.clientName);
    } else {
      localStorage.removeItem('stockfix-client-name');
    }
  }, [state]);

  const setRole = (role: UserRole) => {
    if (role !== 'client') {
      setState({ role, clientName: null });
    } else {
      setState(prev => ({ ...prev, role }));
    }
  };

  const loginAsClient = (clientName: string) => {
    setState({ role: 'client', clientName });
  };

  const logout = () => {
    setState({ role: 'manager', clientName: null });
    localStorage.removeItem('stockfix-role');
    localStorage.removeItem('stockfix-client-name');
  };

  return { 
    role: state.role, 
    clientName: state.clientName,
    setRole, 
    loginAsClient,
    logout,
    isClient: state.role === 'client'
  };
}
