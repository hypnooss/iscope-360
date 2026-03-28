import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface M365CVE {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  score: number | null;
  products: string[];
  publishedDate: string;
  advisoryUrl: string;
  description: string;
  customerActionRequired: boolean;
}

interface M365CVEsResponse {
  success: boolean;
  totalCVEs: number;
  cves: M365CVE[];
  months: string[];
  source: string;
  error?: string;
}

export function useM365CVEs(months: number = 3, products?: string[]) {
  return useQuery<M365CVEsResponse>({
    queryKey: ['m365-cves-cache', months, products],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cve_cache')
        .select('*')
        .eq('module_code', 'm365')
        .order('score', { ascending: false, nullsFirst: false });

      if (error) throw error;

      // Filter by months
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);

      const cves: M365CVE[] = (data || [])
        .filter((row: any) => {
          if (!row.published_date) return true;
          return new Date(row.published_date) >= cutoff;
        })
        .filter((row: any) => {
          if (!products || products.length === 0) return true;
          const rowProducts = Array.isArray(row.products) ? row.products : [];
          return rowProducts.some((p: string) => products.includes(p));
        })
        .map((row: any) => {
          const raw = row.raw_data || {};
          return {
            id: row.cve_id,
            title: row.title || row.cve_id,
            severity: (row.severity || 'UNKNOWN') as M365CVE['severity'],
            score: row.score != null ? Number(row.score) : null,
            products: Array.isArray(row.products) ? row.products.map(String) : [],
            publishedDate: row.published_date || '',
            advisoryUrl: row.advisory_url || `https://msrc.microsoft.com/update-guide/vulnerability/${row.cve_id}`,
            description: row.description || '',
            customerActionRequired: raw.customerActionRequired || false,
          };
        });

      return {
        success: true,
        totalCVEs: cves.length,
        cves,
        months: [],
        source: 'CVE Cache (MSRC)',
      };
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}
