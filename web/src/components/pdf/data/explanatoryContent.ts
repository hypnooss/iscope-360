// ═══════════════════════════════════════════════════════════════
// EXPLANATORY CONTENT FOR PDF REPORT
// User-friendly explanations for each compliance rule
// ═══════════════════════════════════════════════════════════════

export type Priority = 'critical' | 'recommended' | 'ok';
export type Difficulty = 'low' | 'medium' | 'high';

export interface ExplanatoryContent {
  friendlyTitle: string;
  whatIs: string;
  whyMatters: string;
  impacts: string[];
  howToFix: string[];
  difficulty: Difficulty;
  timeEstimate: string;
  providerExamples?: string[];
}

// Priority mapping based on severity
export const severityToPriority = (severity?: string): Priority => {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'critical';
    case 'medium':
    case 'low':
      return 'recommended';
    default:
      return 'ok';
  }
};

export const priorityLabels: Record<Priority, { label: string; color: string; icon: string }> = {
  critical: {
    label: 'Corrigir Agora',
    color: '#DC2626', // red-600
    icon: '●',
  },
  recommended: {
    label: 'Planejar Correção',
    color: '#D97706', // amber-600
    icon: '●',
  },
  ok: {
    label: 'OK',
    color: '#16A34A', // green-600
    icon: '●',
  },
};

export const difficultyLabels: Record<Difficulty, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
};

// ═══════════════════════════════════════════════════════════════
// EXPLANATORY CONTENT DATABASE
// Maps rule IDs to user-friendly explanations
// ═══════════════════════════════════════════════════════════════

export const EXPLANATORY_CONTENT: Record<string, ExplanatoryContent> = {
  // ─────────────────────────────────────────────────────────────
  // DMARC Rules
  // ─────────────────────────────────────────────────────────────
  'DMARC-001': {
    friendlyTitle: 'Proteção contra emails falsos (DMARC)',
    whatIs: 'Sistema que protege seu domínio contra envio de emails falsos por terceiros.',
    whyMatters: 'Sem DMARC, qualquer pessoa pode enviar emails fingindo ser sua empresa, o que pode levar a fraudes e perda de confiança.',
    impacts: [
      'Clientes podem receber emails fraudulentos em seu nome',
      'Perda de confiança e danos à reputação da empresa',
      'Emails legítimos podem ir para a pasta de spam',
      'Risco de golpes financeiros usando sua marca',
    ],
    howToFix: [
      'Acesse o painel DNS do seu domínio (Cloudflare, Registro.br, GoDaddy)',
      'Adicione um novo registro do tipo TXT',
      'Nome: _dmarc.seudominio.com.br',
      'Valor: v=DMARC1; p=none; rua=mailto:admin@seudominio.com.br',
      'Após 30 dias monitorando os relatórios, mude p=none para p=quarantine',
      'Após mais 30 dias sem problemas, mude para p=reject',
    ],
    difficulty: 'low',
    timeEstimate: '15 min',
    providerExamples: ['Cloudflare', 'Registro.br', 'GoDaddy', 'Microsoft 365'],
  },
  'DMARC-002': {
    friendlyTitle: 'Política DMARC muito permissiva',
    whatIs: 'O DMARC está configurado, mas não está bloqueando emails falsos automaticamente.',
    whyMatters: 'Com política "none" ou "quarantine", emails fraudulentos ainda podem chegar aos destinatários, apenas com avisos.',
    impacts: [
      'Emails falsos ainda podem ser entregues',
      'Proteção parcial contra fraudes',
      'Menor eficácia na prevenção de phishing',
    ],
    howToFix: [
      'Acesse o painel DNS do seu domínio',
      'Localize o registro TXT para _dmarc.seudominio.com.br',
      'Altere a política de p=none ou p=quarantine para p=reject',
      'Certifique-se de que SPF e DKIM estão funcionando antes de fazer essa mudança',
    ],
    difficulty: 'low',
    timeEstimate: '10 min',
    providerExamples: ['Cloudflare', 'Registro.br', 'GoDaddy'],
  },
  'DMARC-003': {
    friendlyTitle: 'Relatórios DMARC não configurados',
    whatIs: 'O DMARC não está enviando relatórios sobre tentativas de uso indevido do seu domínio.',
    whyMatters: 'Sem relatórios, você não sabe se alguém está tentando falsificar emails em nome da sua empresa.',
    impacts: [
      'Impossibilidade de detectar ataques de phishing',
      'Falta de visibilidade sobre uso do domínio',
      'Dificuldade em diagnosticar problemas de entrega de email',
    ],
    howToFix: [
      'Edite o registro DMARC no seu DNS',
      'Adicione rua=mailto:dmarc-reports@seudominio.com.br ao valor',
      'Crie uma caixa de email para receber os relatórios',
      'Use ferramentas como DMARC Analyzer ou Postmark para visualizar relatórios',
    ],
    difficulty: 'low',
    timeEstimate: '20 min',
    providerExamples: ['DMARC Analyzer', 'Postmark', 'Valimail'],
  },

  // ─────────────────────────────────────────────────────────────
  // SPF Rules
  // ─────────────────────────────────────────────────────────────
  'SPF-001': {
    friendlyTitle: 'Lista de servidores autorizados (SPF)',
    whatIs: 'Registro que define quais servidores podem enviar emails em nome do seu domínio.',
    whyMatters: 'Sem SPF, qualquer servidor pode enviar emails fingindo ser do seu domínio, facilitando golpes.',
    impacts: [
      'Emails podem ser falsificados facilmente',
      'Maior risco de phishing usando seu domínio',
      'Emails legítimos podem ser rejeitados por outros servidores',
    ],
    howToFix: [
      'Acesse o painel DNS do seu domínio',
      'Adicione um registro TXT para @ (raiz do domínio)',
      'Valor básico: v=spf1 include:_spf.google.com ~all (para Google Workspace)',
      'Ou: v=spf1 include:spf.protection.outlook.com ~all (para Microsoft 365)',
      'Adapte incluindo todos os serviços que enviam email em seu nome',
    ],
    difficulty: 'low',
    timeEstimate: '15 min',
    providerExamples: ['Google Workspace', 'Microsoft 365', 'SendGrid', 'Mailchimp'],
  },
  'SPF-002': {
    friendlyTitle: 'SPF com muitas consultas',
    whatIs: 'O registro SPF está complexo demais e pode falhar durante a verificação.',
    whyMatters: 'SPF permite no máximo 10 consultas. Se ultrapassar, a verificação falha e emails podem ser rejeitados.',
    impacts: [
      'Emails legítimos podem ser rejeitados',
      'Proteção SPF pode ser ignorada',
      'Problemas intermitentes de entrega de email',
    ],
    howToFix: [
      'Liste todos os serviços incluídos no seu SPF atual',
      'Remova serviços que não usa mais',
      'Use serviços de "flattening" SPF como SPF Macro ou Cloudflare Email Routing',
      'Considere consolidar serviços de email em menos provedores',
    ],
    difficulty: 'medium',
    timeEstimate: '30 min',
    providerExamples: ['SPF Surveyor', 'MXToolbox', 'Cloudflare'],
  },
  'SPF-003': {
    friendlyTitle: 'Política SPF muito permissiva',
    whatIs: 'O SPF está configurado com +all ou ?all, que aceita emails de qualquer servidor.',
    whyMatters: 'Uma política permissiva anula o propósito do SPF, permitindo que qualquer servidor envie emails.',
    impacts: [
      'SPF efetivamente desabilitado',
      'Nenhuma proteção contra falsificação',
      'DMARC não funcionará corretamente',
    ],
    howToFix: [
      'Edite o registro SPF no seu DNS',
      'Substitua +all ou ?all por ~all (soft fail) ou -all (hard fail)',
      'Teste com ~all primeiro, depois mude para -all após confirmar que tudo funciona',
    ],
    difficulty: 'low',
    timeEstimate: '10 min',
    providerExamples: ['Cloudflare', 'Registro.br', 'GoDaddy'],
  },

  // ─────────────────────────────────────────────────────────────
  // DKIM Rules
  // ─────────────────────────────────────────────────────────────
  'DKIM-001': {
    friendlyTitle: 'Assinatura digital de emails (DKIM)',
    whatIs: 'Sistema que adiciona uma assinatura digital aos emails para provar que são autênticos.',
    whyMatters: 'DKIM permite que servidores de destino verifiquem que o email realmente veio do seu domínio e não foi alterado.',
    impacts: [
      'Emails podem ser falsificados mais facilmente',
      'DMARC não funciona corretamente sem DKIM',
      'Menor taxa de entrega de emails legítimos',
      'Perda de credibilidade do domínio',
    ],
    howToFix: [
      'Acesse o painel do seu provedor de email (Google Workspace, Microsoft 365)',
      'Gere as chaves DKIM no painel de administração',
      'Copie o registro CNAME ou TXT fornecido',
      'Adicione o registro no DNS do seu domínio',
      'Ative o DKIM no painel do provedor de email',
    ],
    difficulty: 'medium',
    timeEstimate: '30 min',
    providerExamples: ['Google Workspace', 'Microsoft 365', 'Zoho Mail'],
  },
  'DKIM-002': {
    friendlyTitle: 'Chave DKIM fraca',
    whatIs: 'A chave de assinatura DKIM tem menos de 1024 bits, o que a torna vulnerável.',
    whyMatters: 'Chaves fracas podem ser quebradas por atacantes, permitindo que falsifiquem assinaturas.',
    impacts: [
      'Assinaturas podem ser forjadas',
      'Proteção DKIM comprometida',
      'Risco de falsificação de emails',
    ],
    howToFix: [
      'Acesse o painel do seu provedor de email',
      'Gere uma nova chave DKIM com 2048 bits',
      'Atualize o registro DNS com a nova chave',
      'Remova a chave antiga após 48 horas',
    ],
    difficulty: 'medium',
    timeEstimate: '30 min',
    providerExamples: ['Google Workspace', 'Microsoft 365'],
  },

  // ─────────────────────────────────────────────────────────────
  // DNS / Nameserver Rules
  // ─────────────────────────────────────────────────────────────
  'DNS-001': {
    friendlyTitle: 'Proteção contra falsificação de DNS (DNSSEC)',
    whatIs: 'Sistema de segurança que protege o DNS contra ataques de envenenamento de cache.',
    whyMatters: 'Sem DNSSEC, atacantes podem redirecionar visitantes do seu site para páginas falsas sem você saber.',
    impacts: [
      'Visitantes podem ser redirecionados para sites falsos',
      'Risco de roubo de credenciais',
      'Emails podem ser interceptados',
    ],
    howToFix: [
      'Acesse o painel do seu provedor DNS (Cloudflare, AWS, etc.)',
      'Ative o DNSSEC nas configurações do domínio',
      'Copie os registros DS gerados',
      'Adicione os registros DS no registrador do domínio (Registro.br, etc.)',
    ],
    difficulty: 'medium',
    timeEstimate: '30 min',
    providerExamples: ['Cloudflare', 'Registro.br', 'AWS Route 53'],
  },
  'DNS-002': {
    friendlyTitle: 'Registro DS na Zona Pai',
    whatIs: 'Registro que conecta o DNSSEC do seu domínio com a zona pai (.com.br, .com, etc.).',
    whyMatters: 'Sem o registro DS, o DNSSEC não funciona pois falta o elo de confiança com a hierarquia DNS.',
    impacts: [
      'DNSSEC não funciona mesmo se ativado',
      'Proteção contra falsificação fica inativa',
      'Possíveis falhas de resolução DNS',
    ],
    howToFix: [
      'Acesse o painel do seu provedor DNS e copie os registros DS',
      'Vá ao registrador do domínio (Registro.br, GoDaddy, etc.)',
      'Adicione os registros DS na configuração DNSSEC',
      'Aguarde até 48 horas para propagação',
    ],
    difficulty: 'medium',
    timeEstimate: '30 min',
    providerExamples: ['Registro.br', 'GoDaddy', 'Cloudflare'],
  },
  'DNS-003': {
    friendlyTitle: 'Redundância de Nameservers',
    whatIs: 'Ter múltiplos servidores DNS para garantir disponibilidade mesmo se um falhar.',
    whyMatters: 'Com apenas um servidor DNS, qualquer falha deixa todo o domínio inacessível.',
    impacts: [
      'Ponto único de falha',
      'Risco de indisponibilidade total',
      'Menor resiliência a ataques DDoS',
    ],
    howToFix: [
      'Acesse o painel do registrador do seu domínio',
      'Adicione pelo menos um servidor DNS secundário',
      'Use provedores diferentes para máxima resiliência (ex: Cloudflare + AWS)',
      'Verifique que ambos os servidores respondem corretamente',
    ],
    difficulty: 'medium',
    timeEstimate: '30 min',
    providerExamples: ['Cloudflare', 'AWS Route 53', 'Google Cloud DNS'],
  },
  'DNS-004': {
    friendlyTitle: 'Diversidade de Infraestrutura DNS',
    whatIs: 'Usar servidores DNS em redes diferentes para maior proteção contra falhas.',
    whyMatters: 'Se todos os servidores DNS estão na mesma rede, uma falha nessa rede derruba tudo.',
    impacts: [
      'Vulnerável a falhas de rede',
      'Menor proteção contra ataques',
      'Risco de indisponibilidade regional',
    ],
    howToFix: [
      'Verifique os IPs dos seus nameservers atuais',
      'Configure nameservers em redes diferentes (diferentes prefixos IP)',
      'Considere usar um provedor DNS secundário de outra empresa',
    ],
    difficulty: 'medium',
    timeEstimate: '1h',
    providerExamples: ['Cloudflare + AWS', 'Registro.br + Google'],
  },
  'DNS-005': {
    friendlyTitle: 'Atualização do SOA Serial',
    whatIs: 'Número de série do registro SOA que indica quando a zona foi atualizada.',
    whyMatters: 'Servidores DNS usam o serial para saber quando sincronizar alterações.',
    impacts: [
      'Alterações DNS podem não propagar corretamente',
      'Servidores secundários podem ter dados desatualizados',
    ],
    howToFix: [
      'Verifique o formato do serial (recomendado: YYYYMMDDNN)',
      'Atualize o serial sempre que fizer alterações na zona',
      'A maioria dos provedores faz isso automaticamente',
    ],
    difficulty: 'low',
    timeEstimate: '10 min',
  },
  'DNS-006': {
    friendlyTitle: 'Intervalo de Refresh do SOA',
    whatIs: 'Tempo que servidores secundários esperam antes de verificar atualizações.',
    whyMatters: 'Valor muito alto atrasa propagação; muito baixo sobrecarrega os servidores.',
    impacts: [
      'Alterações DNS podem demorar a propagar',
      'Possível sobrecarga de consultas DNS',
    ],
    howToFix: [
      'Valor recomendado: 3600 a 86400 segundos (1 a 24 horas)',
      'Ajuste no registro SOA da zona DNS',
      'Provedores gerenciados geralmente usam valores otimizados',
    ],
    difficulty: 'low',
    timeEstimate: '10 min',
  },

  // ─────────────────────────────────────────────────────────────
  // DNSSEC Rules
  // ─────────────────────────────────────────────────────────────
  'DNSSEC-001': {
    friendlyTitle: 'Proteção contra falsificação de DNS (DNSSEC)',
    whatIs: 'Sistema de segurança que protege o DNS contra ataques de envenenamento de cache.',
    whyMatters: 'Sem DNSSEC, atacantes podem redirecionar visitantes do seu site para páginas falsas sem você saber.',
    impacts: [
      'Visitantes podem ser redirecionados para sites falsos',
      'Risco de roubo de credenciais',
      'Emails podem ser interceptados',
      'Perda de confiança dos usuários',
    ],
    howToFix: [
      'Acesse o painel do seu provedor DNS (Cloudflare, AWS, etc.)',
      'Ative o DNSSEC nas configurações do domínio',
      'Copie os registros DS gerados',
      'Adicione os registros DS no registrador do domínio (Registro.br, etc.)',
      'Aguarde até 48 horas para ativação completa',
    ],
    difficulty: 'medium',
    timeEstimate: '30 min',
    providerExamples: ['Cloudflare', 'Registro.br', 'AWS Route 53'],
  },
  'DNSSEC-002': {
    friendlyTitle: 'Assinatura DNSSEC incompleta',
    whatIs: 'O DNSSEC está parcialmente configurado - faltam registros no DNS ou no registrador.',
    whyMatters: 'Uma configuração incompleta pode causar falhas de resolução, deixando o site inacessível.',
    impacts: [
      'Site pode ficar inacessível para alguns usuários',
      'Proteção DNSSEC não funciona',
      'Possíveis erros de validação',
    ],
    howToFix: [
      'Verifique se o registro DS está no registrador do domínio',
      'Verifique se os registros DNSKEY estão no provedor DNS',
      'Use ferramentas como DNSViz para diagnosticar problemas',
      'Se houver erros, desative o DNSSEC e reconfigure do zero',
    ],
    difficulty: 'medium',
    timeEstimate: '45 min',
    providerExamples: ['DNSViz', 'Verisign DNSSEC Debugger'],
  },

  // ─────────────────────────────────────────────────────────────
  // MX (Mail Server) Rules
  // ─────────────────────────────────────────────────────────────
  'MX-001': {
    friendlyTitle: 'Servidores de email (MX)',
    whatIs: 'Registros que definem quais servidores recebem emails para o seu domínio.',
    whyMatters: 'Sem registros MX, ninguém consegue enviar emails para endereços @seudominio.com.br.',
    impacts: [
      'Impossibilidade de receber emails',
      'Perda de comunicação com clientes',
      'Falha em cadastros e recuperação de senhas',
    ],
    howToFix: [
      'Acesse o painel DNS do seu domínio',
      'Adicione registros MX apontando para seu provedor de email',
      'Para Google Workspace: ASPMX.L.GOOGLE.COM (prioridade 1)',
      'Para Microsoft 365: seudominio-com-br.mail.protection.outlook.com (prioridade 0)',
    ],
    difficulty: 'low',
    timeEstimate: '15 min',
    providerExamples: ['Google Workspace', 'Microsoft 365', 'Zoho Mail'],
  },
  'MX-002': {
    friendlyTitle: 'Redundância de servidores de email',
    whatIs: 'Ter múltiplos servidores MX para garantir entrega mesmo se um falhar.',
    whyMatters: 'Com apenas um servidor MX, qualquer falha impede a recepção de todos os emails.',
    impacts: [
      'Ponto único de falha para emails',
      'Perda de emails durante manutenções',
      'Menor confiabilidade de comunicação',
    ],
    howToFix: [
      'A maioria dos provedores já fornece múltiplos servidores MX',
      'Verifique se todos os registros MX recomendados estão configurados',
      'Para Google: adicione ALT1, ALT2, ALT3, ALT4.ASPMX.L.GOOGLE.COM',
      'Configure prioridades diferentes (10, 20, 30, etc.)',
    ],
    difficulty: 'low',
    timeEstimate: '15 min',
    providerExamples: ['Google Workspace', 'Microsoft 365'],
  },
};

// ═══════════════════════════════════════════════════════════════
// POSTURE CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

export type PostureLevel = 'good' | 'attention' | 'critical';

export interface PostureClassification {
  level: PostureLevel;
  label: string;
  color: string;
  bgColor: string;
  description: string;
}

export const getPostureClassification = (
  criticalCount: number,
  recommendedCount: number
): PostureClassification => {
  if (criticalCount > 0) {
    return {
      level: 'critical',
      label: 'Crítica',
      color: '#DC2626',
      bgColor: '#FEF2F2',
      description: `${criticalCount} problema${criticalCount > 1 ? 's' : ''} crítico${criticalCount > 1 ? 's' : ''} requer${criticalCount > 1 ? 'em' : ''} ação imediata`,
    };
  }
  if (recommendedCount > 0) {
    return {
      level: 'attention',
      label: 'Atenção',
      color: '#D97706',
      bgColor: '#FFFBEB',
      description: `${recommendedCount} melhoria${recommendedCount > 1 ? 's' : ''} recomendada${recommendedCount > 1 ? 's' : ''}`,
    };
  }
  return {
    level: 'good',
    label: 'Boa',
    color: '#16A34A',
    bgColor: '#F0FDF4',
    description: 'Todas as verificações passaram',
  };
};

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get explanatory content for a rule, with fallback for unknown rules
 */
export const getExplanatoryContent = (
  ruleId: string,
  fallbackName?: string,
  fallbackDescription?: string,
  fallbackRecommendation?: string
): ExplanatoryContent => {
  const content = EXPLANATORY_CONTENT[ruleId];
  
  if (content) {
    return content;
  }

  // Generate fallback content for unknown rules
  return {
    friendlyTitle: fallbackName || ruleId,
    whatIs: fallbackDescription || 'Verificação de configuração do domínio.',
    whyMatters: 'Esta configuração afeta a segurança ou disponibilidade do seu domínio.',
    impacts: [
      'Possíveis problemas de segurança',
      'Risco de indisponibilidade de serviços',
    ],
    howToFix: fallbackRecommendation
      ? [fallbackRecommendation]
      : ['Consulte a documentação do seu provedor DNS para mais detalhes.'],
    difficulty: 'medium',
    timeEstimate: '30 min',
  };
};

/**
 * Simplify technical terms for lay users
 */
export const simplifyTechnicalTerm = (term: string): string => {
  const translations: Record<string, string> = {
    'Delegation Signer': 'Assinatura de segurança do DNS',
    'DS': 'Assinatura de segurança',
    'DNSKEY': 'Chave de autenticação do domínio',
    'chain of trust': 'Sistema de verificação em camadas',
    'cadeia de confiança': 'Sistema de verificação em camadas',
    'lookups SPF': 'Consultas de verificação SPF',
    'TXT record': 'Configuração de texto no DNS',
    'registro TXT': 'Configuração de texto no DNS',
    'MX records': 'Servidores de email',
    'registros MX': 'Servidores de email',
    'Nameservers': 'Servidores que controlam o domínio',
    'nameservers': 'Servidores DNS',
    'DNSSEC': 'Proteção contra falsificação de DNS',
    'SOA': 'Servidor DNS principal',
    'TTL': 'Tempo de cache',
    'propagation': 'Atualização global',
    'propagação': 'Atualização global',
  };

  let simplified = term;
  Object.entries(translations).forEach(([technical, simple]) => {
    simplified = simplified.replace(new RegExp(technical, 'gi'), simple);
  });
  
  return simplified;
};
