import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FirewallCVE {
  id: string;
  description: string;
  affectedVersions?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  score: number;
  publishedDate: string;
  lastModifiedDate: string;
  references: string[];
  firmwareVersion: string;
  vendor: string;
}

export interface VersionInfo {
  version: string;
  vendor: string;
}

const VENDOR_OS_LABELS: Record<string, string> = {
  fortinet: 'FortiOS',
  sonicwall: 'SonicOS',
};

export function getOsLabel(vendor: string): string {
  return VENDOR_OS_LABELS[vendor] || vendor;
}

export function useFirewallCVEs() {
  return useQuery({
    queryKey: ['firewall-cves-cache'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cve_cache')
        .select('*')
        .eq('module_code', 'firewall')
        .order('score', { ascending: false, nullsFirst: false });

      if (error) throw error;

      const cves: FirewallCVE[] = (data || []).map((row: any) => {
        const raw = row.raw_data || {};
        const products = Array.isArray(row.products) ? row.products : [];
        // Extract vendor and version from products like "FortiOS 7.2.3"
        let vendor = 'fortinet';
        let firmwareVersion = '';
        if (products.length > 0) {
          const productStr = String(products[0]);
          if (productStr.toLowerCase().includes('sonicos')) vendor = 'sonicwall';
          const vMatch = productStr.match(/(\d+\.\d+\.?\d*)/);
          if (vMatch) firmwareVersion = vMatch[1];
        }

        return {
          id: row.cve_id,
          description: row.description || '',
          affectedVersions: row.title || '',
          severity: (row.severity || 'UNKNOWN') as FirewallCVE['severity'],
          score: Number(row.score) || 0,
          publishedDate: row.published_date || '',
          lastModifiedDate: row.updated_at || '',
          references: raw.references || [],
          firmwareVersion,
          vendor,
        };
      });

      // Extract unique version infos
      const versionMap = new Map<string, VersionInfo>();
      for (const cve of cves) {
        if (cve.firmwareVersion) {
          const key = `${cve.vendor}:${cve.firmwareVersion}`;
          if (!versionMap.has(key)) {
            versionMap.set(key, { version: cve.firmwareVersion, vendor: cve.vendor });
          }
        }
      }

      return {
        cves,
        versions: [...versionMap.values()].map(v => v.version),
        versionInfos: [...versionMap.values()],
        vendors: [...new Set(cves.map(c => c.vendor))],
      };
    },
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}
