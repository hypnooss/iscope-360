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

    console.log('[m365-check-defender] Starting Defender checks (DEF-001 to DEF-005)...');

    // DEF-001: Security alerts (active)
    try {
      const { data, error } = await graphFetchSafe(
        access_token,
        '/security/alerts_v2?$filter=status ne \'resolved\'&$top=50&$orderby=createdDateTime desc',
        { beta: true }
      );
      
      if (data) {
        const alerts = data.value || [];
        const highSeverityAlerts = alerts.filter((a: any) => 
          a.severity === 'high' || a.severity === 'critical' || a.severity === 'medium'
        );
        
        insights.push({
          id: 'DEF-001', code: 'DEF-001', category: 'defender_security', product: 'defender',
          severity: highSeverityAlerts.length > 10 ? 'critical' : highSeverityAlerts.length > 5 ? 'high' : highSeverityAlerts.length > 0 ? 'medium' : 'info',
          titulo: 'Alertas de Segurança Ativos',
          descricaoExecutiva: alerts.length > 0
            ? `${alerts.length} alerta(s) ativo(s), sendo ${highSeverityAlerts.length} de alta/média severidade.`
            : 'Nenhum alerta de segurança ativo.',
          riscoTecnico: 'Alertas não resolvidos indicam potenciais ameaças em andamento.',
          impactoNegocio: 'Comprometimento de segurança pode levar a vazamento de dados.',
          scoreImpacto: highSeverityAlerts.length > 5 ? 8 : highSeverityAlerts.length > 0 ? 5 : 0,
          status: highSeverityAlerts.length > 5 ? 'fail' : 'pass',
          affectedCount: alerts.length,
          affectedEntities: alerts.slice(0, 15).map((a: any) => ({
            id: a.id,
            displayName: a.title || 'Alerta',
            details: { severity: a.severity, status: a.status, createdDateTime: a.createdDateTime }
          })),
          remediacao: {
            productAfetado: 'defender',
            portalUrl: 'https://security.microsoft.com',
            caminhoPortal: ['Incidents & alerts', 'Alerts'],
            passosDetalhados: ['Investigue alertas de alta severidade primeiro', 'Tome ações de remediação recomendadas', 'Documente e feche alertas resolvidos'],
          },
          detectedAt: now,
          endpointUsado: '/security/alerts_v2',
        });
      } else if (error) {
        errors.push(`DEF-001: ${error}`);
      }
    } catch (e) {
      errors.push(`DEF-001: ${String(e)}`);
    }

    // DEF-002: Security incidents
    try {
      const { data, error } = await graphFetchSafe(
        access_token,
        '/security/incidents?$filter=status ne \'resolved\'&$top=30&$orderby=createdDateTime desc',
        { beta: true }
      );
      
      if (data) {
        const incidents = data.value || [];
        const activeIncidents = incidents.filter((i: any) => i.status === 'active' || i.status === 'inProgress');
        
        insights.push({
          id: 'DEF-002', code: 'DEF-002', category: 'defender_security', product: 'defender',
          severity: activeIncidents.length > 5 ? 'critical' : activeIncidents.length > 2 ? 'high' : activeIncidents.length > 0 ? 'medium' : 'info',
          titulo: 'Incidentes de Segurança Ativos',
          descricaoExecutiva: incidents.length > 0
            ? `${incidents.length} incidente(s) não resolvido(s), ${activeIncidents.length} em investigação ativa.`
            : 'Nenhum incidente de segurança ativo.',
          riscoTecnico: 'Incidentes representam ameaças confirmadas ao ambiente.',
          impactoNegocio: 'Incidentes não tratados podem escalar para brechas de segurança.',
          scoreImpacto: activeIncidents.length > 2 ? 9 : activeIncidents.length > 0 ? 6 : 0,
          status: activeIncidents.length > 2 ? 'fail' : 'pass',
          affectedCount: incidents.length,
          affectedEntities: incidents.slice(0, 10).map((i: any) => ({
            id: i.id,
            displayName: i.displayName || `Incidente ${i.incidentId}`,
            details: { severity: i.severity, status: i.status, alertCount: i.alerts?.length }
          })),
          remediacao: {
            productAfetado: 'defender',
            portalUrl: 'https://security.microsoft.com',
            caminhoPortal: ['Incidents & alerts', 'Incidents'],
            passosDetalhados: ['Priorize incidentes por severidade', 'Siga playbook de resposta a incidentes', 'Documente lições aprendidas'],
          },
          detectedAt: now,
          endpointUsado: '/security/incidents',
        });
      } else if (error) {
        errors.push(`DEF-002: ${error}`);
      }
    } catch (e) {
      errors.push(`DEF-002: ${String(e)}`);
    }

    // DEF-003: Attack simulation training results
    try {
      const { data, error } = await graphFetchSafe(
        access_token,
        '/security/attackSimulation/simulations?$top=10&$orderby=createdDateTime desc',
        { beta: true }
      );
      
      if (data) {
        const simulations = data.value || [];
        const completedSimulations = simulations.filter((s: any) => s.status === 'succeeded' || s.status === 'completed');
        
        let totalCompromised = 0;
        let totalTargeted = 0;
        
        for (const sim of completedSimulations) {
          if (sim.report) {
            totalCompromised += sim.report.compromisedUsersCount || 0;
            totalTargeted += sim.report.targetedUsersCount || 0;
          }
        }

        const compromiseRate = totalTargeted > 0 ? (totalCompromised / totalTargeted) * 100 : 0;

        insights.push({
          id: 'DEF-003', code: 'DEF-003', category: 'defender_security', product: 'defender',
          severity: simulations.length === 0 ? 'medium' : compromiseRate > 30 ? 'high' : compromiseRate > 15 ? 'medium' : 'info',
          titulo: 'Simulações de Phishing',
          descricaoExecutiva: simulations.length > 0
            ? `${simulations.length} simulação(ões) executada(s). Taxa de comprometimento: ${compromiseRate.toFixed(1)}%.`
            : 'Nenhuma simulação de phishing foi executada recentemente.',
          riscoTecnico: simulations.length === 0 
            ? 'Sem treinamento, usuários são mais vulneráveis a phishing real.'
            : 'Usuários que caíram em simulações precisam de treinamento adicional.',
          impactoNegocio: 'Phishing é o principal vetor de ataques cibernéticos.',
          scoreImpacto: simulations.length === 0 ? 4 : compromiseRate > 30 ? 5 : 0,
          status: simulations.length === 0 || compromiseRate > 30 ? 'fail' : 'pass',
          affectedCount: totalCompromised,
          affectedEntities: completedSimulations.slice(0, 10).map((s: any) => ({
            id: s.id,
            displayName: s.displayName || 'Simulação',
            details: { 
              status: s.status, 
              compromised: s.report?.compromisedUsersCount,
              targeted: s.report?.targetedUsersCount
            }
          })),
          remediacao: {
            productAfetado: 'defender',
            portalUrl: 'https://security.microsoft.com',
            caminhoPortal: ['Email & collaboration', 'Attack simulation training'],
            passosDetalhados: ['Execute simulações de phishing regularmente', 'Atribua treinamento a usuários comprometidos', 'Monitore evolução da taxa de cliques'],
          },
          detectedAt: now,
          endpointUsado: '/security/attackSimulation/simulations',
        });
      } else if (error) {
        errors.push(`DEF-003: ${error}`);
      }
    } catch (e) {
      errors.push(`DEF-003: ${String(e)}`);
    }

    // DEF-004: Secure score
    try {
      const { data, error } = await graphFetchSafe(
        access_token,
        '/security/secureScores?$top=1',
        { beta: true }
      );
      
      if (data) {
        const scores = data.value || [];
        const latestScore = scores[0];
        
        if (latestScore) {
          const currentScore = latestScore.currentScore || 0;
          const maxScore = latestScore.maxScore || 100;
          const percentage = maxScore > 0 ? (currentScore / maxScore) * 100 : 0;

          insights.push({
            id: 'DEF-004', code: 'DEF-004', category: 'defender_security', product: 'defender',
            severity: percentage < 40 ? 'critical' : percentage < 60 ? 'high' : percentage < 80 ? 'medium' : 'info',
            titulo: 'Microsoft Secure Score',
            descricaoExecutiva: `Score atual: ${currentScore.toFixed(0)} de ${maxScore.toFixed(0)} (${percentage.toFixed(1)}%).`,
            riscoTecnico: 'Secure Score baixo indica muitas recomendações de segurança não implementadas.',
            impactoNegocio: 'Postura de segurança abaixo das melhores práticas Microsoft.',
            scoreImpacto: percentage < 40 ? 7 : percentage < 60 ? 4 : 0,
            status: percentage < 60 ? 'fail' : 'pass',
            affectedCount: Math.round(maxScore - currentScore),
            affectedEntities: [{
              id: 'secure-score',
              displayName: 'Microsoft Secure Score',
              details: { current: currentScore, max: maxScore, percentage: percentage.toFixed(1) }
            }],
            remediacao: {
              productAfetado: 'defender',
              portalUrl: 'https://security.microsoft.com',
              caminhoPortal: ['Secure Score', 'Recommended actions'],
              passosDetalhados: ['Revise as ações recomendadas', 'Priorize por impacto no score', 'Implemente melhorias gradualmente'],
            },
            detectedAt: now,
            endpointUsado: '/security/secureScores',
          });
        }
      } else if (error) {
        errors.push(`DEF-004: ${error}`);
      }
    } catch (e) {
      errors.push(`DEF-004: ${String(e)}`);
    }

    // DEF-005: Information Protection Labels (DLP)
    try {
      const { data, error } = await graphFetchSafe(
        access_token,
        '/informationProtection/policy/labels',
        { beta: true }
      );
      
      if (data) {
        const labels = data.value || [];
        const activeLabels = labels.filter((l: any) => l.isActive !== false);
        
        insights.push({
          id: 'DEF-005', code: 'DEF-005', category: 'defender_security', product: 'defender',
          severity: labels.length === 0 ? 'high' : labels.length < 3 ? 'medium' : 'info',
          titulo: 'Labels de Proteção de Informação',
          descricaoExecutiva: labels.length > 0
            ? `${activeLabels.length} label(s) de sensibilidade configurado(s).`
            : 'Nenhum label de sensibilidade configurado.',
          riscoTecnico: 'Sem labels, dados sensíveis não são classificados nem protegidos automaticamente.',
          impactoNegocio: 'Dificuldade em aplicar DLP e proteger dados críticos.',
          scoreImpacto: labels.length === 0 ? 5 : labels.length < 3 ? 2 : 0,
          status: labels.length === 0 ? 'fail' : 'pass',
          affectedCount: labels.length,
          affectedEntities: labels.slice(0, 10).map((l: any) => ({
            id: l.id,
            displayName: l.name || l.displayName || 'Label',
            details: { description: l.description, isActive: l.isActive }
          })),
          remediacao: {
            productAfetado: 'defender',
            portalUrl: 'https://compliance.microsoft.com',
            caminhoPortal: ['Information protection', 'Labels', 'Create label'],
            passosDetalhados: ['Defina taxonomia de classificação', 'Crie labels (Público, Interno, Confidencial, Restrito)', 'Configure proteção automática por label'],
          },
          detectedAt: now,
          endpointUsado: '/informationProtection/policy/labels',
        });
      } else if (error) {
        errors.push(`DEF-005: ${error}`);
      }
    } catch (e) {
      errors.push(`DEF-005: ${String(e)}`);
    }

    console.log(`[m365-check-defender] Completed with ${insights.length} insights, ${errors.length} errors`);

    return new Response(JSON.stringify({ insights, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e) {
    console.error(`[m365-check-defender] Fatal error: ${String(e)}`);
    return new Response(JSON.stringify({ insights: [], errors: [String(e)] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
