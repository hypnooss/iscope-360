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

    console.log('[m365-check-sharepoint] Starting SharePoint checks (SPO-001 to SPO-004)...');

    // SPO-001: Sites with external sharing enabled
    try {
      const { data, error } = await graphFetchSafe(access_token, '/sites?$select=id,displayName,webUrl,sharingCapability&$top=100', { beta: true });
      
      if (data) {
        const sites = data.value || [];
        // Sites with external sharing (ExternalUserAndGuestSharing or ExternalUserSharingOnly)
        const externalSharingSites = sites.filter((s: any) => 
          s.sharingCapability && s.sharingCapability !== 'Disabled'
        );
        
        insights.push({
          id: 'SPO-001', code: 'SPO-001', category: 'sharepoint_onedrive', product: 'sharepoint',
          severity: externalSharingSites.length > 20 ? 'high' : externalSharingSites.length > 10 ? 'medium' : 'info',
          titulo: 'Sites com Compartilhamento Externo',
          descricaoExecutiva: externalSharingSites.length > 0
            ? `${externalSharingSites.length} de ${sites.length} site(s) permite(m) compartilhamento externo.`
            : 'Nenhum site com compartilhamento externo habilitado.',
          riscoTecnico: 'Compartilhamento externo pode expor dados sensíveis a terceiros.',
          impactoNegocio: 'Risco de vazamento de informações confidenciais.',
          scoreImpacto: externalSharingSites.length > 20 ? 5 : externalSharingSites.length > 10 ? 3 : 0,
          status: externalSharingSites.length > 20 ? 'fail' : 'pass',
          affectedCount: externalSharingSites.length,
          affectedEntities: externalSharingSites.slice(0, 15).map((s: any) => ({
            id: s.id,
            displayName: s.displayName || s.webUrl,
            details: { webUrl: s.webUrl, sharingCapability: s.sharingCapability }
          })),
          remediacao: {
            productAfetado: 'sharepoint',
            portalUrl: 'https://admin.microsoft.com/sharepoint',
            caminhoPortal: ['Sites', 'Active sites', 'Sharing settings'],
            passosDetalhados: ['Revise sites com compartilhamento externo', 'Restrinja compartilhamento para sites sensíveis', 'Configure domínios permitidos para compartilhamento'],
          },
          detectedAt: now,
          endpointUsado: '/sites?$select=sharingCapability',
        });
      } else if (error) {
        errors.push(`SPO-001: ${error}`);
      }
    } catch (e) {
      errors.push(`SPO-001: ${String(e)}`);
    }

    // SPO-002: Check for anonymous sharing links (via root site)
    try {
      // Get the root site first
      const { data: rootSite, error: rootErr } = await graphFetchSafe(access_token, '/sites/root');
      
      if (rootSite) {
        // Get drives (document libraries)
        const { data: drivesData } = await graphFetchSafe(access_token, `/sites/${rootSite.id}/drives?$top=10`);
        
        let anonymousLinksCount = 0;
        const sitesWithAnonLinks: any[] = [];

        if (drivesData) {
          const drives = drivesData.value || [];
          
          for (const drive of drives.slice(0, 5)) {
            try {
              // Check permissions on root folder
              const { data: permsData } = await graphFetchSafe(access_token, `/drives/${drive.id}/root/permissions`);
              if (permsData) {
                const anonPerms = (permsData.value || []).filter((p: any) => 
                  p.link && p.link.scope === 'anonymous'
                );
                if (anonPerms.length > 0) {
                  anonymousLinksCount += anonPerms.length;
                  sitesWithAnonLinks.push({
                    id: drive.id,
                    displayName: drive.name,
                    details: { anonymousLinks: anonPerms.length }
                  });
                }
              }
            } catch {
              // Continue with other drives
            }
          }
        }

        insights.push({
          id: 'SPO-002', code: 'SPO-002', category: 'sharepoint_onedrive', product: 'sharepoint',
          severity: anonymousLinksCount > 10 ? 'high' : anonymousLinksCount > 0 ? 'medium' : 'info',
          titulo: 'Links de Compartilhamento Anônimos',
          descricaoExecutiva: anonymousLinksCount > 0
            ? `${anonymousLinksCount} link(s) anônimo(s) detectado(s) em bibliotecas de documentos.`
            : 'Nenhum link anônimo detectado nas bibliotecas verificadas.',
          riscoTecnico: 'Links anônimos permitem acesso sem autenticação.',
          impactoNegocio: 'Qualquer pessoa com o link pode acessar os arquivos.',
          scoreImpacto: anonymousLinksCount > 10 ? 6 : anonymousLinksCount > 0 ? 3 : 0,
          status: anonymousLinksCount > 10 ? 'fail' : 'pass',
          affectedCount: anonymousLinksCount,
          affectedEntities: sitesWithAnonLinks,
          remediacao: {
            productAfetado: 'sharepoint',
            portalUrl: 'https://admin.microsoft.com/sharepoint',
            caminhoPortal: ['Policies', 'Sharing', 'External sharing'],
            passosDetalhados: ['Desabilite links anônimos para sites sensíveis', 'Configure expiração automática de links', 'Prefira compartilhamento com autenticação'],
          },
          detectedAt: now,
          endpointUsado: '/drives/{id}/root/permissions',
        });
      } else if (rootErr) {
        errors.push(`SPO-002: ${rootErr}`);
      }
    } catch (e) {
      errors.push(`SPO-002: ${String(e)}`);
    }

    // SPO-003: Sites without sensitivity labels
    try {
      const { data, error } = await graphFetchSafe(
        access_token, 
        '/sites?$select=id,displayName,webUrl,sensitivityLabel&$top=100',
        { beta: true }
      );
      
      if (data) {
        const sites = data.value || [];
        const unlabeledSites = sites.filter((s: any) => !s.sensitivityLabel);
        
        insights.push({
          id: 'SPO-003', code: 'SPO-003', category: 'sharepoint_onedrive', product: 'sharepoint',
          severity: unlabeledSites.length > sites.length * 0.8 ? 'medium' : unlabeledSites.length > sites.length * 0.5 ? 'low' : 'info',
          titulo: 'Sites sem Label de Sensibilidade',
          descricaoExecutiva: unlabeledSites.length > 0
            ? `${unlabeledSites.length} de ${sites.length} site(s) não possui(em) label de sensibilidade.`
            : 'Todos os sites possuem labels de sensibilidade configurados.',
          riscoTecnico: 'Sites sem classificação podem conter dados sensíveis sem proteção adequada.',
          impactoNegocio: 'Dificuldade em aplicar políticas de DLP e proteção.',
          scoreImpacto: unlabeledSites.length > sites.length * 0.8 ? 3 : 0,
          status: unlabeledSites.length > sites.length * 0.8 ? 'fail' : 'pass',
          affectedCount: unlabeledSites.length,
          affectedEntities: unlabeledSites.slice(0, 15).map((s: any) => ({
            id: s.id,
            displayName: s.displayName || s.webUrl,
            details: { webUrl: s.webUrl }
          })),
          remediacao: {
            productAfetado: 'sharepoint',
            portalUrl: 'https://compliance.microsoft.com',
            caminhoPortal: ['Information protection', 'Labels', 'Publish labels'],
            passosDetalhados: ['Configure sensitivity labels no Microsoft Purview', 'Publique labels para sites SharePoint', 'Considere labels padrão para novos sites'],
          },
          detectedAt: now,
          endpointUsado: '/sites?$select=sensitivityLabel',
        });
      } else if (error) {
        errors.push(`SPO-003: ${error}`);
      }
    } catch (e) {
      errors.push(`SPO-003: ${String(e)}`);
    }

    // SPO-004: OneDrive sharing settings (sample users)
    try {
      const { data: usersData } = await graphFetchSafe(access_token, '/users?$select=id,displayName,userPrincipalName&$top=20');
      
      if (usersData) {
        const users = usersData.value || [];
        let wideShareCount = 0;
        const wideShareUsers: any[] = [];

        for (const user of users.slice(0, 10)) {
          try {
            const { data: driveData } = await graphFetchSafe(access_token, `/users/${user.id}/drive/root/permissions`);
            if (driveData) {
              const widePerms = (driveData.value || []).filter((p: any) => 
                p.link && (p.link.scope === 'organization' || p.link.scope === 'anonymous')
              );
              if (widePerms.length > 3) {
                wideShareCount++;
                wideShareUsers.push({
                  id: user.id,
                  displayName: user.displayName || user.userPrincipalName,
                  details: { sharedItems: widePerms.length }
                });
              }
            }
          } catch {
            // User might not have OneDrive provisioned
          }
        }

        insights.push({
          id: 'SPO-004', code: 'SPO-004', category: 'sharepoint_onedrive', product: 'sharepoint',
          severity: wideShareCount > 5 ? 'medium' : wideShareCount > 0 ? 'low' : 'info',
          titulo: 'OneDrive com Compartilhamento Amplo',
          descricaoExecutiva: wideShareCount > 0
            ? `${wideShareCount} usuário(s) com muitos arquivos compartilhados amplamente no OneDrive.`
            : 'Padrões de compartilhamento no OneDrive estão adequados.',
          riscoTecnico: 'Compartilhamento amplo no OneDrive pode expor dados pessoais e corporativos.',
          impactoNegocio: 'Potencial vazamento de informações sensíveis.',
          scoreImpacto: wideShareCount > 5 ? 3 : 0,
          status: wideShareCount > 5 ? 'fail' : 'pass',
          affectedCount: wideShareCount,
          affectedEntities: wideShareUsers,
          remediacao: {
            productAfetado: 'sharepoint',
            portalUrl: 'https://admin.microsoft.com/sharepoint',
            caminhoPortal: ['Policies', 'Sharing', 'OneDrive'],
            passosDetalhados: ['Configure restrições de compartilhamento para OneDrive', 'Defina limites de expiração para links', 'Treine usuários sobre práticas seguras'],
          },
          detectedAt: now,
          endpointUsado: '/users/{id}/drive/root/permissions',
        });
      }
    } catch (e) {
      errors.push(`SPO-004: ${String(e)}`);
    }

    console.log(`[m365-check-sharepoint] Completed with ${insights.length} insights, ${errors.length} errors`);

    return new Response(JSON.stringify({ insights, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error(`[m365-check-sharepoint] Fatal error: ${String(e)}`);
    return new Response(JSON.stringify({ insights: [], errors: [String(e)] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
