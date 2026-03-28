import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'iscope_selected_domain';

export function useDomainSelector(
  domains: { id: string; name: string }[] | undefined
) {
  const [selectedDomainId, setSelectedDomainIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || '';
    }
    return '';
  });

  useEffect(() => {
    if (!domains?.length) {
      if (selectedDomainId) setSelectedDomainIdState('');
      return;
    }
    const stillExists = domains.some(d => d.id === selectedDomainId);
    if (!stillExists) {
      const firstId = domains[0].id;
      setSelectedDomainIdState(firstId);
      localStorage.setItem(STORAGE_KEY, firstId);
    }
  }, [domains]);

  const setSelectedDomainId = useCallback((id: string) => {
    setSelectedDomainIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return { selectedDomainId, setSelectedDomainId };
}
