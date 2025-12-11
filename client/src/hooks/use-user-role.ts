import { useState, useEffect } from 'react';

type UserRole = 'manager' | 'rep';

export function useUserRole() {
  // Default to manager so they see the features first
  const [role, setRole] = useState<UserRole>(() => {
    const stored = localStorage.getItem('stockfix-role');
    return (stored === 'manager' || stored === 'rep') ? stored : 'manager';
  });

  useEffect(() => {
    localStorage.setItem('stockfix-role', role);
  }, [role]);

  return { role, setRole };
}
