import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveAuth } from '@/hooks/useEffectiveAuth';
import { useWorkspaceSelector } from '@/hooks/useWorkspaceSelector';
import { usePreview } from '@/contexts/PreviewContext';

// ====== TYPES ======

export interface FirewallLicense {
  firewallId: string;
  firewallName: string;
  workspaceName: string;
  model: string | null;
  forticare: { status: string; expiresAt: string | null; daysLeft: number | null };
  services: Array<{
    name: string;
    status: string;
    expiresAt: string | null;
    daysLeft: number | null;
  }>;
}

export interface TlsCertificate {
  ip: string;
  port: number;
  subjectCn: string;
  issuer: string;
  expiresAt: string | null;
  daysLeft: number | null;
  clientName: string;
}

export interface M365License {
  tenantDomain: string;
  tenantDisplayName: string;
  skuPartNumber: string;
  displayName: string;
  capabilityStatus: string;
  totalUnits: number;
  consumedUnits: number;
  expiresAt: string | null;
  daysLeft: number | null;
  collectedAt: string;
}

export interface DomainWhois {
  domainId: string;
  domain: string;
  name: string;
  registrar: string | null;
  expiresAt: string | null;
  daysLeft: number | null;
  whoisCreatedAt: string | null;
  whoisCheckedAt: string | null;
  clientName: string;
}

export type LicenseStatus = 'expired' | 'expiring' | 'active' | 'unknown';

export function getLicenseStatus(daysLeft: number | null): LicenseStatus {
  if (daysLeft === null) return 'unknown';
  if (daysLeft <= 0) return 'expired';
  if (daysLeft <= 30) return 'expiring';
  return 'active';
}

export function getDaysLeft(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  if (isNaN(expiry.getTime())) return null;
  const now = new Date();
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ====== HELPERS ======

function unixToIso(ts: number | null | undefined): string | null {
  if (!ts || typeof ts !== 'number') return null;
  // Detect if seconds or milliseconds
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  antivirus: 'Antivirus',
  appctrl: 'App Control',
  ips: 'IPS',
  industrial_db: 'Industrial DB',
  webfilter: 'Web Filter',
  forticloud_sandbox: 'Cloud Sandbox',
  botnet_domain: 'Botnet Domain',
  botnet_ip: 'Botnet IP',
  mobile_malware: 'Mobile Malware',
  forticlient_outbreak_prevention_ems_threat_feed: 'Outbreak Prevention',
};

function extractFirewallFromRawData(rawData: any): { forticare: FirewallLicense['forticare']; services: FirewallLicense['services'] } | null {
  const results = rawData?.license_status?.results;
  if (!results) return null;

  // FortiCare
  const fcExpires = results.forticare?.support?.enhanced?.expires
    || results.forticare?.support?.hardware?.expires
    || results.forticare?.expires;
  const fcIso = unixToIso(fcExpires);
  const forticare = {
    status: results.forticare?.status === 'licensed' ? 'pass' : (results.forticare?.status || 'unknown'),
    expiresAt: fcIso,
    daysLeft: getDaysLeft(fcIso),
  };

  // Services
  const services: FirewallLicense['services'] = [];
  for (const [key, val] of Object.entries(results)) {
    if (key === 'forticare') continue;
    const svc = val as any;
    if (!svc || typeof svc !== 'object') continue;
    if (svc.expires) {
      const iso = unixToIso(svc.expires);
      services.push({
        name: SERVICE_DISPLAY_NAMES[key] || key.replace(/_/g, ' '),
        status: svc.status === 'licensed' ? 'pass' : (svc.status || 'unknown'),
        expiresAt: iso,
        daysLeft: getDaysLeft(iso),
      });
    }
  }

  return { forticare, services };
}

function extractExpiryFromCheck(check: any): string | null {
  if (!check) return null;
  const evidence = check.evidence || check.details || {};
  for (const key of Object.keys(evidence)) {
    const lower = key.toLowerCase();
    if (lower.includes('expir') || lower.includes('validade') || lower.includes('vencimento') || lower.includes('end_date')) {
      const val = evidence[key];
      if (typeof val === 'string' && val.match(/\d{4}/)) return val;
    }
  }
  const desc = check.description || check.fail_description || '';
  const dateMatch = desc.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];
  return null;
}

function extractTlsFromSnapshot(results: any, clientName: string): TlsCertificate[] {
  const certs: TlsCertificate[] = [];
  const seen = new Set<string>();

  for (const [ip, ipData] of Object.entries(results as Record<string, any>)) {
    if (!ipData || typeof ipData !== 'object') continue;

    // 1. web_services[].tls
    const webServices = (ipData as any).web_services || [];
    for (const ws of webServices) {
      const tls = ws?.tls;
      if (!tls?.not_after) continue;
      const cn = tls.subject_cn || tls.common_name || ip;
      const dedup = `${ip}:${cn}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);

      const issuerArr = tls.issuer;
      const issuerStr = Array.isArray(issuerArr) ? issuerArr.join(', ') : (issuerArr || 'Unknown');

      certs.push({
        ip,
        port: ws.port || 443,
        subjectCn: cn,
        issuer: issuerStr,
        expiresAt: tls.not_after,
        daysLeft: getDaysLeft(tls.not_after),
        clientName,
      });
    }

    // 2. services[].scripts["ssl-cert"]
    const services = (ipData as any).services || [];
    for (const svc of services) {
      const sslCert = svc?.scripts?.['ssl-cert'];
      if (!sslCert || typeof sslCert !== 'string') continue;

      const notAfterMatch = sslCert.match(/Not valid after:\s*(\S+)/i);
      if (!notAfterMatch) continue;

      const subjectMatch = sslCert.match(/(?:Subject|commonName)[=:]\s*([^\n,/]+)/i);
      const issuerMatch = sslCert.match(/Issuer[^:]*:\s*commonName[=:]([^\n,/]+)/i);

      const cn = subjectMatch?.[1]?.trim() || ip;
      const dedup = `${ip}:${cn}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);

      const expiresAt = notAfterMatch[1];
      certs.push({
        ip,
        port: svc.port || svc.portid || 443,
        subjectCn: cn,
        issuer: issuerMatch?.[1]?.trim() || 'Unknown',
        expiresAt,
        daysLeft: getDaysLeft(expiresAt),
        clientName,
      });
    }

    // 3. Fallback: old structure ports[].tls.certificate
    const ports = (ipData as any).ports || (ipData as any).scan?.ports || [];
    for (const port of ports) {
      const cert = port?.tls?.certificate || port?.ssl?.certificate;
      if (!cert) continue;
      const cn = cert.subject?.cn || cert.subject?.common_name || cert.subject_cn || ip;
      const dedup = `${ip}:${cn}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);

      const expiresAt = cert.not_after || cert.validity?.not_after || null;
      certs.push({
        ip,
        port: port.port || port.portid || 0,
        subjectCn: cn,
        issuer: cert.issuer?.cn || cert.issuer?.common_name || cert.issuer_cn || 'Unknown',
        expiresAt,
        daysLeft: getDaysLeft(expiresAt),
        clientName,
      });
    }
  }

  return certs;
}

// ====== HOOK ======

export function useLicensingHub() {
  const { role } = useAuth();
  const { effectiveRole } = useEffectiveAuth();
  const { isPreviewMode, previewTarget } = usePreview();
  const displayRole = effectiveRole || role;
  const isSuperRole = displayRole === 'super_admin' || displayRole === 'super_suporte';

  const { data: workspaces } = useQuery({
    queryKey: ['licensing-hub-workspaces'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, name').order('name');
      return data || [];
    },
  });

  const { selectedWorkspaceId, setSelectedWorkspaceId } = useWorkspaceSelector(workspaces, isSuperRole);

  const { data: userWorkspaces } = useQuery({
    queryKey: ['licensing-hub-user-workspaces'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase.from('user_clients').select('client_id').eq('user_id', user.id);
      return data?.map(uc => uc.client_id) || [];
    },
    enabled: !isSuperRole && !isPreviewMode,
  });

  const activeClientIds = useMemo(() => {
    if (isSuperRole && selectedWorkspaceId) return [selectedWorkspaceId];
    if (isPreviewMode && previewTarget?.workspaces?.length) {
      return previewTarget.workspaces.map(w => w.id);
    }
    if (!isSuperRole && userWorkspaces?.length) return userWorkspaces;
    return [];
  }, [isSuperRole, selectedWorkspaceId, isPreviewMode, previewTarget, userWorkspaces]);

  // ====== FIREWALLS ======
  const { data: firewallLicenses = [], isLoading: loadingFirewalls } = useQuery({
    queryKey: ['licensing-hub-firewalls', activeClientIds],
    queryFn: async () => {
      if (!activeClientIds.length) return [];

      const { data: firewalls } = await supabase
        .from('firewalls')
        .select('id, name, client_id')
        .in('client_id', activeClientIds);

      if (!firewalls?.length) return [];

      const clientIds = [...new Set(firewalls.map(f => f.client_id))];
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', clientIds);
      const clientMap = new Map(clients?.map(c => [c.id, c.name]) || []);

      const results: FirewallLicense[] = [];
      for (const fw of firewalls) {
        const { data: history } = await supabase
          .from('analysis_history')
          .select('report_data')
          .eq('firewall_id', fw.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!history?.length) continue;

        const reportData = history[0].report_data as any;
        const model: string | null = reportData?.systemInfo?.model || reportData?.system_info?.model || null;

        // Try rawData from checks[] first (Unix timestamps)
        let rawExtracted: ReturnType<typeof extractFirewallFromRawData> = null;
        
        // Search inside report_data.checks[] for Licenciamento category
        const checks = reportData?.checks || [];
        for (const check of checks) {
          if (check?.rawData?.license_status?.results) {
            rawExtracted = extractFirewallFromRawData(check.rawData);
            if (rawExtracted) break;
          }
        }
        
        // Fallback: try top-level rawData
        if (!rawExtracted) {
          rawExtracted = extractFirewallFromRawData(reportData?.rawData);
        }

        if (rawExtracted) {
          results.push({
            firewallId: fw.id,
            firewallName: fw.name,
            workspaceName: clientMap.get(fw.client_id) || '',
            model,
            ...rawExtracted,
          });
          continue;
        }

        // Fallback: categories text parsing
        const categories = reportData?.categories || {};
        const licensingChecks = categories['Licenciamento'] || [];
        if (!licensingChecks.length) continue;

        const forticareCheck = licensingChecks.find((c: any) =>
          c.name?.toLowerCase().includes('forticare') || c.code?.toLowerCase().includes('forticare')
        );

        const services: FirewallLicense['services'] = [];
        for (const check of licensingChecks) {
          if (check === forticareCheck) continue;
          const expDate = extractExpiryFromCheck(check);
          services.push({
            name: check.name || check.code || 'Unknown',
            status: check.status || 'unknown',
            expiresAt: expDate,
            daysLeft: getDaysLeft(expDate),
          });
        }

        const fcExpDate = extractExpiryFromCheck(forticareCheck);
        results.push({
          firewallId: fw.id,
          firewallName: fw.name,
          workspaceName: clientMap.get(fw.client_id) || '',
          model,
          forticare: {
            status: forticareCheck?.status || 'unknown',
            expiresAt: fcExpDate,
            daysLeft: getDaysLeft(fcExpDate),
          },
          services,
        });
      }

      return results;
    },
    enabled: activeClientIds.length > 0,
  });

  // ====== TLS CERTIFICATES ======
  const { data: tlsCertificates = [], isLoading: loadingTls } = useQuery({
    queryKey: ['licensing-hub-tls', activeClientIds],
    queryFn: async () => {
      if (!activeClientIds.length) return [];

      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', activeClientIds);
      const clientMap = new Map(clients?.map(c => [c.id, c.name]) || []);

      const allCerts: TlsCertificate[] = [];

      for (const clientId of activeClientIds) {
        const { data: snapshots } = await supabase
          .from('attack_surface_snapshots')
          .select('results')
          .eq('client_id', clientId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1);

        if (!snapshots?.length) continue;
        const results = snapshots[0].results as any;
        if (!results) continue;

        const certs = extractTlsFromSnapshot(results, clientMap.get(clientId) || '');
        allCerts.push(...certs);
      }

      return allCerts;
    },
    enabled: activeClientIds.length > 0,
  });

  // ====== M365 LICENSES ======
  const { data: m365Licenses = [], isLoading: loadingM365, refetch: refetchM365 } = useQuery({
    queryKey: ['licensing-hub-m365', activeClientIds],
    queryFn: async () => {
      if (!activeClientIds.length) return [];

      const { data } = await supabase
        .from('m365_tenant_licenses')
        .select('*, m365_tenants!inner(tenant_domain, display_name)')
        .in('client_id', activeClientIds)
        .order('display_name');

      if (!data?.length) return [];

      return data.map((lic: any) => ({
        tenantDomain: lic.m365_tenants?.tenant_domain || '',
        tenantDisplayName: lic.m365_tenants?.display_name || lic.m365_tenants?.tenant_domain || '',
        skuPartNumber: lic.sku_part_number,
        displayName: lic.display_name,
        capabilityStatus: lic.capability_status,
        totalUnits: lic.total_units,
        consumedUnits: lic.consumed_units,
        expiresAt: lic.expires_at,
        daysLeft: getDaysLeft(lic.expires_at),
        collectedAt: lic.collected_at,
      }));
    },
    enabled: activeClientIds.length > 0,
  });

  // ====== EXTERNAL DOMAINS (WHOIS) ======
  const { data: domainWhois = [], isLoading: loadingDomains } = useQuery({
    queryKey: ['licensing-hub-domains', activeClientIds],
    queryFn: async () => {
      if (!activeClientIds.length) return [];

      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', activeClientIds);
      const clientMap = new Map(clients?.map(c => [c.id, c.name]) || []);

      const { data: domains } = await supabase
        .from('external_domains')
        .select('id, domain, name, client_id, whois_registrar, whois_expires_at, whois_created_at, whois_checked_at')
        .in('client_id', activeClientIds)
        .order('domain');

      if (!domains?.length) return [];

      return domains.map((d: any): DomainWhois => ({
        domainId: d.id,
        domain: d.domain,
        name: d.name,
        registrar: d.whois_registrar,
        expiresAt: d.whois_expires_at,
        daysLeft: getDaysLeft(d.whois_expires_at),
        whoisCreatedAt: d.whois_created_at,
        whoisCheckedAt: d.whois_checked_at,
        clientName: clientMap.get(d.client_id) || '',
      }));
    },
    enabled: activeClientIds.length > 0,
  });

  // ====== REFRESH M365 LICENSES ======
  const [refreshingM365, setRefreshingM365] = useState(false);

  const refreshM365Licenses = async () => {
    if (!activeClientIds.length) return;
    setRefreshingM365(true);
    try {
      const { data: tenants } = await supabase
        .from('m365_tenants')
        .select('id')
        .in('client_id', activeClientIds);

      if (tenants?.length) {
        for (const tenant of tenants) {
          await supabase.functions.invoke('m365-tenant-licenses', {
            body: { tenant_record_id: tenant.id },
          });
        }
        await refetchM365();
      }
    } catch (e) {
      console.error('Failed to refresh M365 licenses:', e);
    } finally {
      setRefreshingM365(false);
    }
  };

  // ====== SUMMARY COUNTS ======
  const summary = useMemo(() => {
    let expired = 0;
    let expiring = 0;
    let active = 0;

    const countItem = (daysLeft: number | null) => {
      const status = getLicenseStatus(daysLeft);
      if (status === 'expired') expired++;
      else if (status === 'expiring') expiring++;
      else if (status === 'active') active++;
    };

    for (const fw of firewallLicenses) {
      countItem(fw.forticare.daysLeft);
      for (const svc of fw.services) countItem(svc.daysLeft);
    }
    for (const cert of tlsCertificates) countItem(cert.daysLeft);
    for (const lic of m365Licenses) countItem(lic.daysLeft);
    for (const d of domainWhois) countItem(d.daysLeft);

    return { expired, expiring, active, total: expired + expiring + active };
  }, [firewallLicenses, tlsCertificates, m365Licenses, domainWhois]);

  return {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    isSuperRole,
    firewallLicenses,
    tlsCertificates,
    m365Licenses,
    domainWhois,
    summary,
    loading: loadingFirewalls || loadingTls || loadingM365 || loadingDomains,
    refreshM365Licenses,
    refreshingM365,
  };
}
