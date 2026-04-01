import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { getCorsHeaders } from '../_shared/cors.ts';

interface M365Insight {
  id: string;
  code: string;
  category: string;
  product: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  titulo: string;
  descricaoExecutiva: string;
  riscoTecnico: string;
  impactoNegocio: string;
  scoreImpacto: number;
  status: 'pass' | 'fail';
  affectedCount: number;
  affectedEntities: Array<{ id: string; displayName: string; details?: Record<string, unknown> }>;
  remediacao: {
    productAfetado: string;
    portalUrl: string;
    caminhoPortal: string[];
    passosDetalhados: string[];
  };
  detectedAt: string;
  endpointUsado?: string;
}

async function graphFetch(accessToken: string, endpoint: string, options: { beta?: boolean } = {}): Promise<any> {
  const baseUrl = options.beta ? 'https://graph.microsoft.com/beta' : 'https://graph.microsoft.com/v1.0';
  const res = await fetch(`${baseUrl}${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function graphFetchSafe(accessToken: string, endpoint: string, options: { beta?: boolean } = {}): Promise<{ data: any; error: string | null }> {
  try {
    const data = await graphFetch(accessToken, endpoint, options);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: String(e) };
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { access_token, now } = await req.json();
    
    if (!access_token) {
      return new Response(JSON.stringify({ insights: [], errors: ['No access token'] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const insights: M365Insight[] = [];
    const errors: string[] = [];

    console.log('[m365-check-intune] Starting Intune checks (INT-001 to INT-006)...');

    // INT-001: Non-compliant devices
    try {
      const { data, error } = await graphFetchSafe(accessToken, '/deviceManagement/managedDevices?$select=id,deviceName,complianceState,userDisplayName,operatingSystem,lastSyncDateTime&$top=500');
      
      if (data) {
        const devices = data.value || [];
        const nonCompliant = devices.filter((d: any) => d.complianceState === 'noncompliant');
        
        insights.push({
          id: 'INT-001', code: 'INT-001', category: 'intune_devices', product: 'intune',
          severity: nonCompliant.length > 20 ? 'critical' : nonCompliant.length > 10 ? 'high' : nonCompliant.length > 0 ? 'medium' : 'info',
          titulo: 'Dispositivos Não-Compliance',
          descricaoExecutiva: nonCompliant.length > 0
            ? `${nonCompliant.length} de ${devices.length} dispositivo(s) não está(ão) em compliance.`
            : `Todos os ${devices.length} dispositivos estão em compliance.`,
          riscoTecnico: 'Dispositivos fora de compliance podem estar sem criptografia, antivírus ou atualizações.',
          impactoNegocio: 'Dados corporativos podem estar expostos em dispositivos inseguros.',
          scoreImpacto: nonCompliant.length > 10 ? 7 : nonCompliant.length > 0 ? 4 : 0,
          status: nonCompliant.length > 10 ? 'fail' : 'pass',
          affectedCount: nonCompliant.length,
          affectedEntities: nonCompliant.slice(0, 20).map((d: any) => ({
            id: d.id,
            displayName: d.deviceName || 'Dispositivo sem nome',
            details: { user: d.userDisplayName, os: d.operatingSystem, lastSync: d.lastSyncDateTime }
          })),
          remediacao: {
            productAfetado: 'intune',
            portalUrl: 'https://intune.microsoft.com',
            caminhoPortal: ['Devices', 'All devices', 'Filter by Compliance'],
            passosDetalhados: ['Acesse o Intune Portal', 'Filtre dispositivos por compliance status', 'Investigue cada dispositivo não-compliance', 'Force sincronização ou aplique políticas corretivas'],
          },
          detectedAt: now,
          endpointUsado: '/deviceManagement/managedDevices',
        });
      } else if (error) {
        errors.push(`INT-001: ${error}`);
      }
    } catch (e) {
      errors.push(`INT-001: ${String(e)}`);
    }

    // INT-002: Devices without encryption
    try {
      const { data, error } = await graphFetchSafe(accessToken, '/deviceManagement/managedDevices?$select=id,deviceName,isEncrypted,userDisplayName,operatingSystem&$top=500');
      
      if (data) {
        const devices = data.value || [];
        const notEncrypted = devices.filter((d: any) => d.isEncrypted === false);
        
        insights.push({
          id: 'INT-002', code: 'INT-002', category: 'intune_devices', product: 'intune',
          severity: notEncrypted.length > 10 ? 'critical' : notEncrypted.length > 5 ? 'high' : notEncrypted.length > 0 ? 'medium' : 'info',
          titulo: 'Dispositivos Sem Criptografia',
          descricaoExecutiva: notEncrypted.length > 0
            ? `${notEncrypted.length} dispositivo(s) sem criptografia de disco ativada.`
            : 'Todos os dispositivos possuem criptografia ativada.',
          riscoTecnico: 'Dispositivos sem criptografia expõem dados em caso de perda ou roubo.',
          impactoNegocio: 'Vazamento de dados sensíveis pode gerar multas e danos reputacionais.',
          scoreImpacto: notEncrypted.length > 5 ? 8 : notEncrypted.length > 0 ? 5 : 0,
          status: notEncrypted.length > 5 ? 'fail' : 'pass',
          affectedCount: notEncrypted.length,
          affectedEntities: notEncrypted.slice(0, 20).map((d: any) => ({
            id: d.id,
            displayName: d.deviceName || 'Dispositivo sem nome',
            details: { user: d.userDisplayName, os: d.operatingSystem }
          })),
          remediacao: {
            productAfetado: 'intune',
            portalUrl: 'https://intune.microsoft.com',
            caminhoPortal: ['Devices', 'Configuration profiles', 'Disk Encryption'],
            passosDetalhados: ['Crie política de criptografia obrigatória (BitLocker/FileVault)', 'Aplique a todos os dispositivos corporativos', 'Monitore o status de criptografia'],
          },
          detectedAt: now,
          endpointUsado: '/deviceManagement/managedDevices?$select=isEncrypted',
        });
      } else if (error) {
        errors.push(`INT-002: ${error}`);
      }
    } catch (e) {
      errors.push(`INT-002: ${String(e)}`);
    }

    // INT-003: Jailbroken/Rooted devices
    try {
      const { data, error } = await graphFetchSafe(accessToken, '/deviceManagement/managedDevices?$select=id,deviceName,jailBroken,userDisplayName,operatingSystem&$top=500');
      
      if (data) {
        const devices = data.value || [];
        const jailbroken = devices.filter((d: any) => d.jailBroken === 'True' || d.jailBroken === true);
        
        insights.push({
          id: 'INT-003', code: 'INT-003', category: 'intune_devices', product: 'intune',
          severity: jailbroken.length > 0 ? 'critical' : 'info',
          titulo: 'Dispositivos com Jailbreak/Root',
          descricaoExecutiva: jailbroken.length > 0
            ? `${jailbroken.length} dispositivo(s) com jailbreak/root detectado(s).`
            : 'Nenhum dispositivo com jailbreak/root detectado.',
          riscoTecnico: 'Dispositivos modificados podem executar malware e ignorar controles de segurança.',
          impactoNegocio: 'Risco severo de comprometimento de dados corporativos.',
          scoreImpacto: jailbroken.length > 0 ? 10 : 0,
          status: jailbroken.length > 0 ? 'fail' : 'pass',
          affectedCount: jailbroken.length,
          affectedEntities: jailbroken.slice(0, 20).map((d: any) => ({
            id: d.id,
            displayName: d.deviceName || 'Dispositivo',
            details: { user: d.userDisplayName, os: d.operatingSystem }
          })),
          remediacao: {
            productAfetado: 'intune',
            portalUrl: 'https://intune.microsoft.com',
            caminhoPortal: ['Devices', 'Compliance policies'],
            passosDetalhados: ['Crie política que bloqueia dispositivos com jailbreak', 'Configure ação de bloqueio imediato', 'Notifique o usuário e revogue acesso'],
          },
          detectedAt: now,
          endpointUsado: '/deviceManagement/managedDevices?$select=jailBroken',
        });
      } else if (error) {
        errors.push(`INT-003: ${error}`);
      }
    } catch (e) {
      errors.push(`INT-003: ${String(e)}`);
    }

    // INT-004: Devices with outdated OS
    try {
      const { data, error } = await graphFetchSafe(accessToken, '/deviceManagement/managedDevices?$select=id,deviceName,osVersion,operatingSystem,userDisplayName&$top=500');
      
      if (data) {
        const devices = data.value || [];
        // Simple heuristic for outdated OS - this would need refinement per OS type
        const outdated = devices.filter((d: any) => {
          const os = d.operatingSystem?.toLowerCase() || '';
          const ver = d.osVersion || '';
          // Windows 10 < 22H2, iOS < 16, Android < 13
          if (os.includes('windows') && ver.startsWith('10.0.1') && parseInt(ver.split('.')[2]) < 19045) return true;
          if (os.includes('ios') && parseInt(ver.split('.')[0]) < 16) return true;
          if (os.includes('android') && parseInt(ver.split('.')[0]) < 13) return true;
          return false;
        });
        
        insights.push({
          id: 'INT-004', code: 'INT-004', category: 'intune_devices', product: 'intune',
          severity: outdated.length > 20 ? 'high' : outdated.length > 10 ? 'medium' : outdated.length > 0 ? 'low' : 'info',
          titulo: 'Dispositivos com SO Desatualizado',
          descricaoExecutiva: outdated.length > 0
            ? `${outdated.length} dispositivo(s) com sistema operacional desatualizado.`
            : 'Todos os dispositivos estão com SO atualizado.',
          riscoTecnico: 'SOs desatualizados contêm vulnerabilidades conhecidas sem patches.',
          impactoNegocio: 'Maior exposição a exploits e malware.',
          scoreImpacto: outdated.length > 10 ? 4 : outdated.length > 0 ? 2 : 0,
          status: outdated.length > 10 ? 'fail' : 'pass',
          affectedCount: outdated.length,
          affectedEntities: outdated.slice(0, 20).map((d: any) => ({
            id: d.id,
            displayName: d.deviceName || 'Dispositivo',
            details: { user: d.userDisplayName, os: d.operatingSystem, version: d.osVersion }
          })),
          remediacao: {
            productAfetado: 'intune',
            portalUrl: 'https://intune.microsoft.com',
            caminhoPortal: ['Devices', 'Update rings for Windows 10/11'],
            passosDetalhados: ['Configure update rings para atualizações automáticas', 'Defina prazos para feature updates', 'Monitore compliance de versão'],
          },
          detectedAt: now,
          endpointUsado: '/deviceManagement/managedDevices?$select=osVersion',
        });
      } else if (error) {
        errors.push(`INT-004: ${error}`);
      }
    } catch (e) {
      errors.push(`INT-004: ${String(e)}`);
    }

    // INT-005: Compliance policies check
    try {
      const { data, error } = await graphFetchSafe(accessToken, '/deviceManagement/deviceCompliancePolicies');
      
      if (data) {
        const policies = data.value || [];
        const hasPolicies = policies.length > 0;
        
        insights.push({
          id: 'INT-005', code: 'INT-005', category: 'intune_devices', product: 'intune',
          severity: !hasPolicies ? 'critical' : policies.length < 3 ? 'medium' : 'info',
          titulo: 'Políticas de Compliance Configuradas',
          descricaoExecutiva: hasPolicies
            ? `${policies.length} política(s) de compliance configurada(s).`
            : 'Nenhuma política de compliance configurada!',
          riscoTecnico: 'Sem políticas de compliance, dispositivos não são avaliados quanto à segurança.',
          impactoNegocio: 'Dispositivos inseguros podem acessar dados corporativos.',
          scoreImpacto: !hasPolicies ? 9 : policies.length < 3 ? 3 : 0,
          status: !hasPolicies ? 'fail' : 'pass',
          affectedCount: hasPolicies ? 0 : 1,
          affectedEntities: policies.slice(0, 10).map((p: any) => ({
            id: p.id,
            displayName: p.displayName || 'Política',
            details: { createdDateTime: p.createdDateTime }
          })),
          remediacao: {
            productAfetado: 'intune',
            portalUrl: 'https://intune.microsoft.com',
            caminhoPortal: ['Devices', 'Compliance policies', 'Create policy'],
            passosDetalhados: ['Crie políticas para cada plataforma (Windows, iOS, Android)', 'Inclua requisitos de criptografia, senha e antivírus', 'Configure ações de não-compliance'],
          },
          detectedAt: now,
          endpointUsado: '/deviceManagement/deviceCompliancePolicies',
        });
      } else if (error) {
        errors.push(`INT-005: ${error}`);
      }
    } catch (e) {
      errors.push(`INT-005: ${String(e)}`);
    }

    // INT-006: Detected apps (unmanaged)
    try {
      const { data, error } = await graphFetchSafe(accessToken, '/deviceManagement/detectedApps?$top=100');
      
      if (data) {
        const apps = data.value || [];
        // Count potentially risky apps (this is a simplified heuristic)
        const riskyApps = apps.filter((a: any) => {
          const name = (a.displayName || '').toLowerCase();
          return name.includes('torrent') || name.includes('vpn') || name.includes('proxy') || 
                 name.includes('crack') || name.includes('hack');
        });
        
        insights.push({
          id: 'INT-006', code: 'INT-006', category: 'intune_devices', product: 'intune',
          severity: riskyApps.length > 0 ? 'medium' : 'info',
          titulo: 'Aplicativos Detectados em Dispositivos',
          descricaoExecutiva: riskyApps.length > 0
            ? `${riskyApps.length} aplicativo(s) potencialmente arriscado(s) detectado(s) em dispositivos.`
            : `${apps.length} aplicativos inventariados - nenhum classificado como arriscado.`,
          riscoTecnico: 'Aplicativos não gerenciados podem conter malware ou violar políticas.',
          impactoNegocio: 'Shadow IT e possível vazamento de dados.',
          scoreImpacto: riskyApps.length > 0 ? 3 : 0,
          status: riskyApps.length > 0 ? 'fail' : 'pass',
          affectedCount: riskyApps.length,
          affectedEntities: riskyApps.slice(0, 10).map((a: any) => ({
            id: a.id,
            displayName: a.displayName || 'App desconhecido',
            details: { deviceCount: a.deviceCount, version: a.version }
          })),
          remediacao: {
            productAfetado: 'intune',
            portalUrl: 'https://intune.microsoft.com',
            caminhoPortal: ['Apps', 'App protection policies'],
            passosDetalhados: ['Revise a lista de apps detectados', 'Crie políticas de proteção de app', 'Bloqueie apps não autorizados via compliance policy'],
          },
          detectedAt: now,
          endpointUsado: '/deviceManagement/detectedApps',
        });
      } else if (error) {
        errors.push(`INT-006: ${error}`);
      }
    } catch (e) {
      errors.push(`INT-006: ${String(e)}`);
    }

    console.log(`[m365-check-intune] Completed with ${insights.length} insights, ${errors.length} errors`);

    return new Response(JSON.stringify({ insights, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error(`[m365-check-intune] Fatal error: ${String(e)}`);
    return new Response(JSON.stringify({ insights: [], errors: [String(e)] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
