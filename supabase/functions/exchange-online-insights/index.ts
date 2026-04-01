import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from '../_shared/cors.ts';

// Types
interface InboxRule {
  id: string;
  displayName: string;
  isEnabled: boolean;
  actions?: {
    forwardTo?: Array<{ emailAddress: { address: string; name?: string } }>;
    redirectTo?: Array<{ emailAddress: { address: string; name?: string } }>;
    delete?: boolean;
    moveToFolder?: string;
  };
}

interface UserMailbox {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail: string;
  rules?: InboxRule[];
  mailboxSettings?: {
    automaticRepliesSetting?: {
      status: string;
      externalAudience?: string;
    };
    timeZone?: string;
  };
}

interface AffectedMailbox {
  id: string;
  displayName: string;
  userPrincipalName: string;
  details?: Record<string, unknown>;
}

interface ExchangeInsight {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  affectedCount: number;
  affectedMailboxes: AffectedMailbox[];
  criteria: string;
  recommendation: string;
  detectedAt: string;
}

// Encryption utilities
function fromHex(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array();
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyHex = Deno.env.get('M365_ENCRYPTION_KEY');
  if (!keyHex) {
    throw new Error('M365_ENCRYPTION_KEY não está configurada');
  }
  
  const keyBytes = fromHex(keyHex);
  return await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
}

async function decryptSecret(encrypted: string): Promise<string> {
  if (!encrypted.includes(':')) {
    try {
      return atob(encrypted);
    } catch {
      return encrypted;
    }
  }
  
  try {
    const [ivHex, ciphertextHex] = encrypted.split(':');
    const iv = fromHex(ivHex);
    const ciphertext = fromHex(ciphertextHex);
    const key = await getEncryptionKey();
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Falha ao decriptar secret');
  }
}
async function getAccessToken(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Token error:", error);
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch users with mailbox
async function fetchUsersWithMailbox(
  accessToken: string
): Promise<UserMailbox[]> {
  const users: UserMailbox[] = [];
  let nextLink: string | null =
    "https://graph.microsoft.com/v1.0/users?$filter=mail ne null&$select=id,displayName,userPrincipalName,mail&$top=100&$count=true";

  while (nextLink) {
    const fetchResponse: Response = await fetch(nextLink, {
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        ConsistencyLevel: 'eventual'
      },
    });

    if (!fetchResponse.ok) {
      if (fetchResponse.status === 403) {
        console.warn("Insufficient permissions to list users");
        return [];
      }
      throw new Error(`Failed to fetch users: ${fetchResponse.status}`);
    }

    const responseData: { value: UserMailbox[]; "@odata.nextLink"?: string } = await fetchResponse.json();
    users.push(...responseData.value);
    nextLink = responseData["@odata.nextLink"] || null;

    // Limit to 200 users for performance
    if (users.length >= 200) break;
  }

  return users;
}

// Fetch inbox rules for a user
async function fetchInboxRules(
  accessToken: string,
  userId: string
): Promise<InboxRule[]> {
  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userId}/mailFolders/inbox/messageRules`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      if (response.status === 403 || response.status === 404) {
        return [];
      }
      console.warn(`Failed to fetch rules for ${userId}: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return data.value || [];
  } catch (error) {
    console.warn(`Error fetching rules for ${userId}:`, error);
    return [];
  }
}

// Fetch mailbox settings for a user
async function fetchMailboxSettings(
  accessToken: string,
  userId: string
): Promise<UserMailbox["mailboxSettings"] | null> {
  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userId}/mailboxSettings`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      if (response.status === 403 || response.status === 404) {
        return null;
      }
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(`Error fetching mailbox settings for ${userId}:`, error);
    return null;
  }
}

// Analyze external forwarding rules
function analyzeExternalForwarding(
  users: UserMailbox[],
  tenantDomains: string[]
): ExchangeInsight | null {
  const affected: AffectedMailbox[] = [];

  for (const user of users) {
    if (!user.rules) continue;

    for (const rule of user.rules) {
      if (!rule.isEnabled) continue;

      const forwardTo = rule.actions?.forwardTo || [];
      const redirectTo = rule.actions?.redirectTo || [];
      const allTargets = [...forwardTo, ...redirectTo];

      const externalTargets = allTargets.filter((target) => {
        const email = target.emailAddress?.address?.toLowerCase() || "";
        return !tenantDomains.some((domain) =>
          email.endsWith(`@${domain.toLowerCase()}`)
        );
      });

      if (externalTargets.length > 0) {
        affected.push({
          id: user.id,
          displayName: user.displayName,
          userPrincipalName: user.userPrincipalName,
          details: {
            ruleName: rule.displayName,
            ruleId: rule.id,
            forwardTo: externalTargets.map(
              (t) => t.emailAddress?.address || ""
            ),
          },
        });
      }
    }
  }

  if (affected.length === 0) return null;

  return {
    id: "EXO-001",
    code: "EXO-001",
    title: "Regras de redirecionamento para domínios externos",
    description: `${affected.length} regra(s) de inbox estão redirecionando ou encaminhando e-mails para endereços externos ao domínio da organização. Isso pode representar vazamento de dados.`,
    category: "mail_flow",
    severity: "critical",
    affectedCount: affected.length,
    affectedMailboxes: affected,
    criteria:
      "Regras de inbox com ações forwardTo ou redirectTo para domínios não pertencentes à organização",
    recommendation:
      "Revise cada regra identificada e confirme se o redirecionamento externo é autorizado. Considere desabilitar regras não justificadas e implementar políticas de DLP.",
    detectedAt: new Date().toISOString(),
  };
}

// Analyze forwarding rules (internal)
function analyzeForwardingRules(users: UserMailbox[]): ExchangeInsight | null {
  const affected: AffectedMailbox[] = [];

  for (const user of users) {
    if (!user.rules) continue;

    for (const rule of user.rules) {
      if (!rule.isEnabled) continue;

      const forwardTo = rule.actions?.forwardTo || [];
      const redirectTo = rule.actions?.redirectTo || [];

      if (forwardTo.length > 0 || redirectTo.length > 0) {
        affected.push({
          id: user.id,
          displayName: user.displayName,
          userPrincipalName: user.userPrincipalName,
          details: {
            ruleName: rule.displayName,
            forwardTo: forwardTo.map((t) => t.emailAddress?.address || ""),
            redirectTo: redirectTo.map((t) => t.emailAddress?.address || ""),
          },
        });
      }
    }
  }

  if (affected.length === 0) return null;

  return {
    id: "EXO-002",
    code: "EXO-002",
    title: "Regras de encaminhamento ativas",
    description: `${affected.length} regra(s) de inbox estão encaminhando e-mails automaticamente. Essas regras podem passar despercebidas e causar compartilhamento não intencional de informações.`,
    category: "mail_flow",
    severity: "high",
    affectedCount: affected.length,
    affectedMailboxes: affected,
    criteria:
      "Regras de inbox com ações forwardTo ou redirectTo habilitadas (internas ou externas)",
    recommendation:
      "Audite periodicamente as regras de encaminhamento e confirme que todas são autorizadas. Implemente políticas para restringir criação de regras de redirecionamento.",
    detectedAt: new Date().toISOString(),
  };
}

// Analyze delete rules
function analyzeDeleteRules(users: UserMailbox[]): ExchangeInsight | null {
  const affected: AffectedMailbox[] = [];

  for (const user of users) {
    if (!user.rules) continue;

    for (const rule of user.rules) {
      if (!rule.isEnabled) continue;

      if (rule.actions?.delete === true) {
        affected.push({
          id: user.id,
          displayName: user.displayName,
          userPrincipalName: user.userPrincipalName,
          details: {
            ruleName: rule.displayName,
            ruleId: rule.id,
          },
        });
      }
    }
  }

  if (affected.length === 0) return null;

  return {
    id: "EXO-003",
    code: "EXO-003",
    title: "Regras de exclusão automática de e-mails",
    description: `${affected.length} regra(s) de inbox estão deletando e-mails automaticamente. Isso pode ocultar comunicações importantes ou ser usado maliciosamente.`,
    category: "mail_flow",
    severity: "medium",
    affectedCount: affected.length,
    affectedMailboxes: affected,
    criteria:
      "Regras de inbox com ação delete=true que removem e-mails automaticamente",
    recommendation:
      "Revise as regras de exclusão automática e confirme que são necessárias. Regras que deletam e-mails podem ocultar atividades suspeitas.",
    detectedAt: new Date().toISOString(),
  };
}

// Analyze excessive rule count
function analyzeRuleCount(users: UserMailbox[]): ExchangeInsight | null {
  const THRESHOLD = 10;
  const affected: AffectedMailbox[] = [];

  for (const user of users) {
    const ruleCount = user.rules?.length || 0;

    if (ruleCount >= THRESHOLD) {
      affected.push({
        id: user.id,
        displayName: user.displayName,
        userPrincipalName: user.userPrincipalName,
        details: {
          ruleCount,
        },
      });
    }
  }

  if (affected.length === 0) return null;

  return {
    id: "EXO-004",
    code: "EXO-004",
    title: "Mailboxes com excesso de regras",
    description: `${affected.length} mailbox(es) possuem ${THRESHOLD} ou mais regras de inbox configuradas. Muitas regras podem indicar má organização ou atividade suspeita.`,
    category: "security_hygiene",
    severity: "low",
    affectedCount: affected.length,
    affectedMailboxes: affected,
    criteria: `Mailboxes com ${THRESHOLD} ou mais regras de inbox configuradas`,
    recommendation:
      "Revise as mailboxes com muitas regras e ajude os usuários a consolidar ou remover regras desnecessárias.",
    detectedAt: new Date().toISOString(),
  };
}

// Analyze auto-replies
function analyzeAutoReplies(users: UserMailbox[]): ExchangeInsight | null {
  const affected: AffectedMailbox[] = [];

  for (const user of users) {
    const autoReply = user.mailboxSettings?.automaticRepliesSetting;

    if (autoReply && autoReply.status !== "disabled") {
      affected.push({
        id: user.id,
        displayName: user.displayName,
        userPrincipalName: user.userPrincipalName,
        details: {
          autoReplyStatus: autoReply.status,
          externalAudience: autoReply.externalAudience,
        },
      });
    }
  }

  if (affected.length === 0) return null;

  return {
    id: "EXO-006",
    code: "EXO-006",
    title: "Respostas automáticas habilitadas",
    description: `${affected.length} usuário(s) possuem respostas automáticas (Out of Office) ativas. Respostas automáticas podem revelar informações sobre ausências e estrutura organizacional.`,
    category: "governance",
    severity: "info",
    affectedCount: affected.length,
    affectedMailboxes: affected,
    criteria:
      "Usuários com automaticRepliesSetting.status diferente de 'disabled'",
    recommendation:
      "Monitore respostas automáticas, especialmente aquelas enviadas para destinatários externos. Considere políticas sobre conteúdo de mensagens automáticas.",
    detectedAt: new Date().toISOString(),
  };
}

// Calculate summary
function calculateSummary(
  insights: ExchangeInsight[]
): Record<string, number> {
  const summary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    total: 0,
  };

  for (const insight of insights) {
    if (insight.severity in summary) {
      summary[insight.severity as keyof typeof summary]++;
    }
    summary.total++;
  }

  return summary;
}

// Extract tenant domains from user list
function extractTenantDomains(users: UserMailbox[]): string[] {
  const domains = new Set<string>();

  for (const user of users) {
    const email = user.mail || user.userPrincipalName;
    if (email && email.includes("@")) {
      const domain = email.split("@")[1];
      domains.add(domain.toLowerCase());
    }
  }

  return Array.from(domains);
}

// Main handler
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_record_id } = await req.json();

    if (!tenant_record_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_record_id is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get tenant and credentials
    const { data: tenant, error: tenantError } = await supabase
      .from("m365_tenants")
      .select("id, tenant_id, tenant_domain, display_name")
      .eq("id", tenant_record_id)
      .single();

    if (tenantError || !tenant) {
      return new Response(
        JSON.stringify({ success: false, error: "Tenant not found", errorCode: "TENANT_NOT_FOUND" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Get global M365 config
    const { data: globalConfig, error: configError } = await supabase
      .from("m365_global_config")
      .select("app_id, client_secret_encrypted")
      .limit(1)
      .single();

    if (configError || !globalConfig) {
      return new Response(
        JSON.stringify({ success: false, error: "M365 global config not found", errorCode: "CONFIG_NOT_FOUND" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    // Decrypt client secret
    const clientSecret = await decryptSecret(globalConfig.client_secret_encrypted);

    // Get access token
    console.log("Getting access token for tenant:", tenant.tenant_id);
    const accessToken = await getAccessToken(
      tenant.tenant_id,
      globalConfig.app_id,
      clientSecret
    );

    // Fetch users with mailbox
    console.log("Fetching users with mailbox...");
    const users = await fetchUsersWithMailbox(accessToken);
    console.log(`Found ${users.length} users with mailbox`);

    if (users.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          insights: [],
          summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
          analyzedAt: new Date().toISOString(),
          tenant: { id: tenant.id, domain: tenant.tenant_domain || tenant.tenant_id },
          message: "No users with mailbox found",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract tenant domains for external detection
    const tenantDomains = extractTenantDomains(users);
    console.log("Tenant domains:", tenantDomains);

    // Fetch inbox rules and mailbox settings for each user (batched)
    console.log("Fetching inbox rules and mailbox settings...");
    const BATCH_SIZE = 10;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (user) => {
          const [rules, settings] = await Promise.all([
            fetchInboxRules(accessToken, user.id),
            fetchMailboxSettings(accessToken, user.id),
          ]);
          user.rules = rules;
          user.mailboxSettings = settings || undefined;
        })
      );
    }

    // ── Fetch compliance correlation data ──────────────────────────────────
    let failedComplianceCodes = new Set<string>();
    try {
      const { data: lastCompliance } = await supabase
        .from('m365_posture_history')
        .select('insights')
        .eq('tenant_record_id', tenant_record_id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single();

      if (lastCompliance?.insights && Array.isArray(lastCompliance.insights)) {
        failedComplianceCodes = new Set(
          (lastCompliance.insights as any[])
            .filter((r: any) => r.status === 'fail')
            .map((r: any) => r.code || r.id)
            .filter(Boolean)
        );
        console.log(`Compliance correlation: ${failedComplianceCodes.size} failed codes found`);
      }
    } catch (e) {
      console.warn('Failed to fetch compliance data for correlation:', e);
    }

    function enrichWithCompliance(insight: ExchangeInsight | null, codes: string[], context: string): ExchangeInsight | null {
      if (!insight) return null;
      const matchedCodes = codes.filter(c => failedComplianceCodes.has(c));
      if (matchedCodes.length > 0) {
        insight.description += `\n\n⚠️ Correlação de Compliance: ${context}`;
        (insight as any).metadata = {
          ...((insight as any).metadata || {}),
          complianceCorrelation: true,
          complianceCodes: matchedCodes,
          complianceContext: context,
        };
      }
      return insight;
    }

    // Generate insights
    console.log("Generating insights...");
    const insights: ExchangeInsight[] = [
      enrichWithCompliance(analyzeExternalForwarding(users, tenantDomains), ['EXO-022'], 'Regras de encaminhamento externo detectadas no Compliance (EXO-022) sem política de DLP para prevenir vazamento.'),
      enrichWithCompliance(analyzeForwardingRules(users), ['EXO-022'], 'Regras de encaminhamento ativas sem controle de compliance (EXO-022).'),
      analyzeDeleteRules(users),
      analyzeRuleCount(users),
      enrichWithCompliance(analyzeAutoReplies(users), ['EXO-025'], 'Respostas automáticas para externos sem política restritiva (EXO-025).'),
    ].filter((insight): insight is ExchangeInsight => insight !== null);

    // Calculate summary
    const summary = calculateSummary(insights);

    console.log(`Generated ${insights.length} insights`);

    return new Response(
      JSON.stringify({
        success: true,
        insights,
        summary,
        analyzedAt: new Date().toISOString(),
        tenant: { id: tenant.id, domain: tenant.tenant_domain || tenant.tenant_id },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Exchange Online Insights error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        errorCode: "INTERNAL_ERROR",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
