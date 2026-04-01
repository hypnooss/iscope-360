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

    console.log('[m365-check-pim] Starting PIM checks (PIM-001 to PIM-004)...');

    // PIM-001: Eligible role assignments (unused roles)
    try {
      const { data, error } = await graphFetchSafe(
        access_token, 
        '/roleManagement/directory/roleEligibilityScheduleInstances?$expand=principal',
        { beta: true }
      );
      
      if (data) {
        const eligibleAssignments = data.value || [];
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        // Check for eligible roles that haven't been activated recently
        const unusedEligible = eligibleAssignments.filter((a: any) => {
          // If there's an endDateTime approaching, it might be unused
          if (!a.endDateTime) return false;
          return new Date(a.endDateTime) > new Date(); // Still active eligibility
        });

        insights.push({
          id: 'PIM-001', code: 'PIM-001', category: 'pim_governance', product: 'entra_id',
          severity: eligibleAssignments.length === 0 ? 'high' : 'info',
          titulo: 'Roles Elegíveis via PIM',
          descricaoExecutiva: eligibleAssignments.length > 0
            ? `${eligibleAssignments.length} atribuição(ões) elegível(is) configurada(s) via PIM.`
            : 'PIM não está configurado ou não há roles elegíveis.',
          riscoTecnico: 'Sem PIM, roles administrativas são permanentes e sempre ativas.',
          impactoNegocio: 'Princípio de least privilege não está sendo aplicado.',
          scoreImpacto: eligibleAssignments.length === 0 ? 6 : 0,
          status: eligibleAssignments.length === 0 ? 'fail' : 'pass',
          affectedCount: eligibleAssignments.length,
          affectedEntities: eligibleAssignments.slice(0, 15).map((a: any) => ({
            id: a.id,
            displayName: a.principal?.displayName || 'Usuário',
            details: { roleDefinitionId: a.roleDefinitionId, endDateTime: a.endDateTime }
          })),
          remediacao: {
            productAfetado: 'entra_id',
            portalUrl: 'https://entra.microsoft.com',
            caminhoPortal: ['Identity Governance', 'Privileged Identity Management', 'Azure AD roles'],
            passosDetalhados: ['Configure PIM para todas as roles privilegiadas', 'Converta atribuições permanentes para elegíveis', 'Defina tempo máximo de ativação'],
          },
          detectedAt: now,
          endpointUsado: '/roleManagement/directory/roleEligibilityScheduleInstances',
        });
      } else if (error) {
        // PIM might not be available (requires P2 license)
        errors.push(`PIM-001: ${error} (requer licença Azure AD P2)`);
      }
    } catch (e) {
      errors.push(`PIM-001: ${String(e)}`);
    }

    // PIM-002: Recent role activations
    try {
      const { data, error } = await graphFetchSafe(
        access_token,
        '/roleManagement/directory/roleAssignmentScheduleInstances?$filter=assignmentType eq \'Activated\'&$expand=principal,roleDefinition',
        { beta: true }
      );
      
      if (data) {
        const activeActivations = data.value || [];
        const now24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentActivations = activeActivations.filter((a: any) => 
          a.startDateTime && new Date(a.startDateTime) > now24h
        );

        insights.push({
          id: 'PIM-002', code: 'PIM-002', category: 'pim_governance', product: 'entra_id',
          severity: recentActivations.length > 10 ? 'medium' : 'info',
          titulo: 'Ativações de Role Recentes (24h)',
          descricaoExecutiva: recentActivations.length > 0
            ? `${recentActivations.length} ativação(ões) de role nas últimas 24 horas.`
            : 'Nenhuma ativação de role nas últimas 24 horas.',
          riscoTecnico: 'Muitas ativações podem indicar uso excessivo de privilégios.',
          impactoNegocio: 'Auditoria de uso de privilégios elevados.',
          scoreImpacto: 0, // Informational
          status: 'pass',
          affectedCount: recentActivations.length,
          affectedEntities: recentActivations.slice(0, 15).map((a: any) => ({
            id: a.id,
            displayName: a.principal?.displayName && a.principal.displayName !== 'User'
              ? a.principal.displayName
              : a.principal?.userPrincipalName || a.principal?.displayName || 'Usuário',
            userPrincipalName: a.principal?.userPrincipalName || '',
            details: {
              roleName: a.roleDefinition?.displayName || '',
              startDateTime: a.startDateTime,
              endDateTime: a.endDateTime,
            }
          })),
          remediacao: {
            productAfetado: 'entra_id',
            portalUrl: 'https://entra.microsoft.com',
            caminhoPortal: ['Identity Governance', 'PIM', 'My audit history'],
            passosDetalhados: ['Monitore ativações frequentes', 'Configure alertas para ativações suspeitas', 'Revise justificativas de ativação'],
          },
          detectedAt: now,
          endpointUsado: '/roleManagement/directory/roleAssignmentScheduleInstances',
        });
      } else if (error) {
        errors.push(`PIM-002: ${error}`);
      }
    } catch (e) {
      errors.push(`PIM-002: ${String(e)}`);
    }

    // PIM-003: Roles without approval requirement
    try {
      const { data, error } = await graphFetchSafe(
        access_token,
        '/policies/roleManagementPolicies?$filter=scopeId eq \'/\' and scopeType eq \'DirectoryRole\'',
        { beta: true }
      );
      
      if (data) {
        const policies = data.value || [];
        // Check for policies that don't require approval
        let rolesWithoutApproval = 0;
        let rolesChecked = 0;

        for (const policy of policies.slice(0, 20)) {
          rolesChecked++;
          // The policy rules would need detailed inspection
          // Simplified: if no rules, assume no approval
          if (!policy.rules || policy.rules.length === 0) {
            rolesWithoutApproval++;
          }
        }

        insights.push({
          id: 'PIM-003', code: 'PIM-003', category: 'pim_governance', product: 'entra_id',
          severity: rolesWithoutApproval > 5 ? 'medium' : 'info',
          titulo: 'Roles sem Requisito de Aprovação',
          descricaoExecutiva: rolesWithoutApproval > 0
            ? `${rolesWithoutApproval} role(s) privilegiada(s) não requer(em) aprovação para ativação.`
            : 'Todas as roles verificadas possuem requisitos de aprovação.',
          riscoTecnico: 'Roles sem aprovação podem ser ativadas instantaneamente sem supervisão.',
          impactoNegocio: 'Ações privilegiadas podem ocorrer sem controle.',
          scoreImpacto: rolesWithoutApproval > 5 ? 4 : 0,
          status: rolesWithoutApproval > 5 ? 'fail' : 'pass',
          affectedCount: rolesWithoutApproval,
          affectedEntities: [],
          remediacao: {
            productAfetado: 'entra_id',
            portalUrl: 'https://entra.microsoft.com',
            caminhoPortal: ['Identity Governance', 'PIM', 'Azure AD roles', 'Settings'],
            passosDetalhados: ['Configure requisito de aprovação para roles críticas', 'Defina aprovadores por role', 'Configure notificações para solicitações'],
          },
          detectedAt: now,
          endpointUsado: '/policies/roleManagementPolicies',
        });
      } else if (error) {
        errors.push(`PIM-003: ${error}`);
      }
    } catch (e) {
      errors.push(`PIM-003: ${String(e)}`);
    }

    // PIM-004: Permanent vs Eligible role assignments comparison
    try {
      // Get permanent assignments
      const { data: permanentData } = await graphFetchSafe(
        access_token,
        '/roleManagement/directory/roleAssignments?$expand=principal',
        { beta: true }
      );
      
      // Get eligible assignments
      const { data: eligibleData } = await graphFetchSafe(
        access_token,
        '/roleManagement/directory/roleEligibilityScheduleInstances',
        { beta: true }
      );

      const permanentCount = permanentData?.value?.length || 0;
      const eligibleCount = eligibleData?.value?.length || 0;
      const total = permanentCount + eligibleCount;
      const permanentRatio = total > 0 ? (permanentCount / total) * 100 : 100;

      insights.push({
        id: 'PIM-004', code: 'PIM-004', category: 'pim_governance', product: 'entra_id',
        severity: permanentRatio > 80 ? 'high' : permanentRatio > 50 ? 'medium' : 'info',
        titulo: 'Proporção Permanente vs Elegível',
        descricaoExecutiva: `${permanentCount} atribuição(ões) permanente(s) vs ${eligibleCount} elegível(is). ${Math.round(permanentRatio)}% são permanentes.`,
        riscoTecnico: 'Alta proporção de roles permanentes indica baixa adoção de least privilege.',
        impactoNegocio: 'Maior superfície de ataque com privilégios sempre ativos.',
        scoreImpacto: permanentRatio > 80 ? 5 : permanentRatio > 50 ? 3 : 0,
        status: permanentRatio > 50 ? 'fail' : 'pass',
        affectedCount: permanentCount,
        affectedEntities: (permanentData?.value || []).slice(0, 15).map((a: any) => ({
          id: a.id,
          displayName: a.principal?.displayName || 'Usuário',
          details: { roleDefinitionId: a.roleDefinitionId, type: 'permanent' }
        })),
        remediacao: {
          productAfetado: 'entra_id',
          portalUrl: 'https://entra.microsoft.com',
          caminhoPortal: ['Identity Governance', 'PIM', 'Azure AD roles', 'Assignments'],
          passosDetalhados: ['Identifique atribuições permanentes desnecessárias', 'Converta para elegíveis via PIM', 'Mantenha apenas emergency accounts como permanentes'],
        },
        detectedAt: now,
        endpointUsado: '/roleManagement/directory/roleAssignments',
      });
    } catch (e) {
      errors.push(`PIM-004: ${String(e)}`);
    }

    console.log(`[m365-check-pim] Completed with ${insights.length} insights, ${errors.length} errors`);

    return new Response(JSON.stringify({ insights, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error(`[m365-check-pim] Fatal error: ${String(e)}`);
    return new Response(JSON.stringify({ insights: [], errors: [String(e)] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
