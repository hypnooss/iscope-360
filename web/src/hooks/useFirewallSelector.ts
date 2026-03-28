import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'iscope_selected_firewall';

export function useFirewallSelector(
  firewalls: { id: string; name: string }[] | undefined
) {
  const [selectedFirewallId, setSelectedFirewallIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || '';
    }
    return '';
  });

  useEffect(() => {
    if (!firewalls?.length) {
      if (selectedFirewallId) setSelectedFirewallIdState('');
      return;
    }
    const stillExists = firewalls.some(f => f.id === selectedFirewallId);
    if (!stillExists) {
      const firstId = firewalls[0].id;
      setSelectedFirewallIdState(firstId);
      localStorage.setItem(STORAGE_KEY, firstId);
    }
  }, [firewalls]);

  const setSelectedFirewallId = useCallback((id: string) => {
    setSelectedFirewallIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return { selectedFirewallId, setSelectedFirewallId };
}
