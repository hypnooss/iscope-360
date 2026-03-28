import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'iscope_selected_workspace';

export function useWorkspaceSelector(
  workspaces: { id: string; name: string }[] | undefined,
  isSuperRole: boolean
) {
  const [selectedWorkspaceId, setSelectedWorkspaceIdState] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY) || null;
    }
    return null;
  });

  useEffect(() => {
    if (!isSuperRole || !workspaces?.length) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    const stillExists = saved && workspaces.some(w => w.id === saved);
    if (!stillExists) {
      const firstId = workspaces[0].id;
      setSelectedWorkspaceIdState(firstId);
      localStorage.setItem(STORAGE_KEY, firstId);
    }
    // If saved still exists, useState already loaded it — do nothing
  }, [workspaces, isSuperRole]);

  const setSelectedWorkspaceId = useCallback((id: string) => {
    setSelectedWorkspaceIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return { selectedWorkspaceId, setSelectedWorkspaceId };
}
