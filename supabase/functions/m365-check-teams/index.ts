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

async function graphFetch(accessToken: string, endpoint: string, options: { beta?: boolean; consistency?: boolean } = {}): Promise<any> {
  const baseUrl = options.beta ? 'https://graph.microsoft.com/beta' : 'https://graph.microsoft.com/v1.0';
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (options.consistency) headers['ConsistencyLevel'] = 'eventual';
  
  const res = await fetch(`${baseUrl}${endpoint}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function graphFetchSafe(accessToken: string, endpoint: string, options: { beta?: boolean; consistency?: boolean } = {}): Promise<{ data: any; error: string | null }> {
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

    console.log('[m365-check-teams] Starting Teams checks (TMS-001 to TMS-004)...');

    // TMS-001: Teams with guest members
    try {
      // Get Microsoft 365 Groups (Teams-enabled)
      const { data, error } = await graphFetchSafe(
        access_token,
        '/groups?$filter=resourceProvisioningOptions/any(x:x eq \'Team\')&$select=id,displayName,description,visibility,membershipRule&$top=100',
        { consistency: true }
      );
      
      if (data) {
        const teams = data.value || [];
        const teamsWithGuests: any[] = [];

        // Check each team for guest members
        for (const team of teams.slice(0, 30)) {
          try {
            const { data: membersData } = await graphFetchSafe(
              access_token,
              `/groups/${team.id}/members?$select=id,displayName,userType&$top=100`
            );
            
            if (membersData) {
              const guests = (membersData.value || []).filter((m: any) => m.userType === 'Guest');
              if (guests.length > 0) {
                teamsWithGuests.push({
                  id: team.id,
                  displayName: team.displayName,
                  details: { guestCount: guests.length, visibility: team.visibility }
                });
              }
            }
          } catch {
            // Continue with other teams
          }
        }

        insights.push({
          id: 'TMS-001', code: 'TMS-001', category: 'teams_collaboration', product: 'sharepoint',
          severity: teamsWithGuests.length > 20 ? 'medium' : teamsWithGuests.length > 10 ? 'low' : 'info',
          titulo: 'Teams com Membros Convidados',
          descricaoExecutiva: teamsWithGuests.length > 0
            ? `${teamsWithGuests.length} de ${teams.length} team(s) possui(em) membros convidados (guests).`
            : 'Nenhum team com membros convidados encontrado.',
          riscoTecnico: 'Guests podem ter acesso a informações internas através do Teams.',
          impactoNegocio: 'Potencial exposição de dados a parceiros externos.',
          scoreImpacto: teamsWithGuests.length > 20 ? 3 : 0,
          status: teamsWithGuests.length > 20 ? 'fail' : 'pass',
          affectedCount: teamsWithGuests.length,
          affectedEntities: teamsWithGuests.slice(0, 15),
          remediacao: {
            productAfetado: 'sharepoint',
            portalUrl: 'https://admin.teams.microsoft.com',
            caminhoPortal: ['Teams', 'Manage teams', 'Guest access'],
            passosDetalhados: ['Revise teams com muitos guests', 'Configure políticas de acesso de guest', 'Considere access reviews para guests'],
          },
          detectedAt: now,
          endpointUsado: '/groups/{id}/members',
        });
      } else if (error) {
        errors.push(`TMS-001: ${error}`);
      }
    } catch (e) {
      errors.push(`TMS-001: ${String(e)}`);
    }

    // TMS-002: Public teams
    try {
      const { data, error } = await graphFetchSafe(
        access_token,
        '/groups?$filter=resourceProvisioningOptions/any(x:x eq \'Team\') and visibility eq \'Public\'&$select=id,displayName,visibility&$top=100',
        { consistency: true }
      );
      
      if (data) {
        const publicTeams = data.value || [];
        
        insights.push({
          id: 'TMS-002', code: 'TMS-002', category: 'teams_collaboration', product: 'sharepoint',
          severity: publicTeams.length > 30 ? 'medium' : publicTeams.length > 15 ? 'low' : 'info',
          titulo: 'Teams Públicos',
          descricaoExecutiva: publicTeams.length > 0
            ? `${publicTeams.length} team(s) configurado(s) como público(s) - qualquer usuário pode ingressar.`
            : 'Nenhum team público encontrado.',
          riscoTecnico: 'Teams públicos permitem que qualquer funcionário acesse o conteúdo.',
          impactoNegocio: 'Informações podem ser acessadas sem aprovação.',
          scoreImpacto: publicTeams.length > 30 ? 2 : 0,
          status: publicTeams.length > 30 ? 'fail' : 'pass',
          affectedCount: publicTeams.length,
          affectedEntities: publicTeams.slice(0, 15).map((t: any) => ({
            id: t.id,
            displayName: t.displayName,
            details: { visibility: t.visibility }
          })),
          remediacao: {
            productAfetado: 'sharepoint',
            portalUrl: 'https://admin.teams.microsoft.com',
            caminhoPortal: ['Teams', 'Manage teams', 'Change visibility'],
            passosDetalhados: ['Revise teams públicos com dados sensíveis', 'Altere para privado quando apropriado', 'Configure políticas de criação de teams'],
          },
          detectedAt: now,
          endpointUsado: '/groups?$filter=visibility eq Public',
        });
      } else if (error) {
        errors.push(`TMS-002: ${error}`);
      }
    } catch (e) {
      errors.push(`TMS-002: ${String(e)}`);
    }

    // TMS-003: Teams without owners
    try {
      const { data, error } = await graphFetchSafe(
        access_token,
        '/groups?$filter=resourceProvisioningOptions/any(x:x eq \'Team\')&$select=id,displayName&$top=50',
        { consistency: true }
      );
      
      if (data) {
        const teams = data.value || [];
        const teamsWithoutOwners: any[] = [];

        for (const team of teams.slice(0, 30)) {
          try {
            const { data: ownersData } = await graphFetchSafe(access_token, `/groups/${team.id}/owners`);
            if (ownersData) {
              const owners = ownersData.value || [];
              if (owners.length === 0) {
                teamsWithoutOwners.push({
                  id: team.id,
                  displayName: team.displayName,
                  details: { ownerCount: 0 }
                });
              } else if (owners.length === 1) {
                // Single owner is also a risk
                teamsWithoutOwners.push({
                  id: team.id,
                  displayName: team.displayName,
                  details: { ownerCount: 1, singleOwner: true }
                });
              }
            }
          } catch {
            // Continue
          }
        }

        insights.push({
          id: 'TMS-003', code: 'TMS-003', category: 'teams_collaboration', product: 'sharepoint',
          severity: teamsWithoutOwners.length > 10 ? 'high' : teamsWithoutOwners.length > 5 ? 'medium' : 'info',
          titulo: 'Teams sem Owner ou com Owner Único',
          descricaoExecutiva: teamsWithoutOwners.length > 0
            ? `${teamsWithoutOwners.length} team(s) sem owner ou com apenas 1 owner.`
            : 'Todos os teams têm múltiplos owners configurados.',
          riscoTecnico: 'Teams sem owner podem ficar órfãos e sem gestão.',
          impactoNegocio: 'Dificuldade em gerenciar acesso e conteúdo.',
          scoreImpacto: teamsWithoutOwners.length > 10 ? 4 : teamsWithoutOwners.length > 5 ? 2 : 0,
          status: teamsWithoutOwners.length > 10 ? 'fail' : 'pass',
          affectedCount: teamsWithoutOwners.length,
          affectedEntities: teamsWithoutOwners.slice(0, 15),
          remediacao: {
            productAfetado: 'sharepoint',
            portalUrl: 'https://admin.teams.microsoft.com',
            caminhoPortal: ['Teams', 'Manage teams', 'Add owners'],
            passosDetalhados: ['Identifique teams sem owner', 'Atribua pelo menos 2 owners por team', 'Configure alertas para teams órfãos'],
          },
          detectedAt: now,
          endpointUsado: '/groups/{id}/owners',
        });
      } else if (error) {
        errors.push(`TMS-003: ${error}`);
      }
    } catch (e) {
      errors.push(`TMS-003: ${String(e)}`);
    }

    // TMS-004: Private channels overview
    try {
      const { data, error } = await graphFetchSafe(
        access_token,
        '/groups?$filter=resourceProvisioningOptions/any(x:x eq \'Team\')&$select=id,displayName&$top=30',
        { consistency: true }
      );
      
      if (data) {
        const teams = data.value || [];
        let totalPrivateChannels = 0;
        const teamsWithPrivateChannels: any[] = [];

        for (const team of teams.slice(0, 20)) {
          try {
            const { data: channelsData } = await graphFetchSafe(
              access_token,
              `/teams/${team.id}/channels?$filter=membershipType eq 'private'`,
              { beta: true }
            );
            
            if (channelsData) {
              const privateChannels = channelsData.value || [];
              if (privateChannels.length > 0) {
                totalPrivateChannels += privateChannels.length;
                teamsWithPrivateChannels.push({
                  id: team.id,
                  displayName: team.displayName,
                  details: { privateChannelCount: privateChannels.length }
                });
              }
            }
          } catch {
            // Continue
          }
        }

        insights.push({
          id: 'TMS-004', code: 'TMS-004', category: 'teams_collaboration', product: 'sharepoint',
          severity: 'info',
          titulo: 'Canais Privados no Teams',
          descricaoExecutiva: totalPrivateChannels > 0
            ? `${totalPrivateChannels} canal(is) privado(s) em ${teamsWithPrivateChannels.length} team(s).`
            : 'Nenhum canal privado detectado nos teams verificados.',
          riscoTecnico: 'Canais privados podem conter dados sensíveis com acesso restrito.',
          impactoNegocio: 'Visibilidade de governança sobre canais privados.',
          scoreImpacto: 0, // Informational
          status: 'pass',
          affectedCount: totalPrivateChannels,
          affectedEntities: teamsWithPrivateChannels.slice(0, 15),
          remediacao: {
            productAfetado: 'sharepoint',
            portalUrl: 'https://admin.teams.microsoft.com',
            caminhoPortal: ['Teams', 'Teams policies', 'Private channels'],
            passosDetalhados: ['Revise políticas de canais privados', 'Monitore criação de canais privados', 'Implemente governança para canais sensíveis'],
          },
          detectedAt: now,
          endpointUsado: '/teams/{id}/channels',
        });
      } else if (error) {
        errors.push(`TMS-004: ${error}`);
      }
    } catch (e) {
      errors.push(`TMS-004: ${String(e)}`);
    }

    console.log(`[m365-check-teams] Completed with ${insights.length} insights, ${errors.length} errors`);

    return new Response(JSON.stringify({ insights, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error(`[m365-check-teams] Fatal error: ${String(e)}`);
    return new Response(JSON.stringify({ insights: [], errors: [String(e)] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
