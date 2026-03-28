import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to load full affectedEntities on demand for a specific insight.
 * Uses the get_insight_affected_entities RPC to avoid loading all entities upfront.
 */
export function useAffectedEntities() {
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadEntities = useCallback(async (historyId: string, insightCode: string) => {
    if (!historyId || !insightCode) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_insight_affected_entities', {
        p_history_id: historyId,
        p_insight_code: insightCode,
      });

      if (error) throw error;
      setEntities(Array.isArray(data) ? data : []);
      setLoaded(true);
    } catch (err) {
      console.error('Error loading affected entities:', err);
      setEntities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setEntities([]);
    setLoaded(false);
  }, []);

  return { entities, loading, loaded, loadEntities, reset };
}
