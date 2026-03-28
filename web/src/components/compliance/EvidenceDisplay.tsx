import { EvidenceItem } from "@/types/compliance";

// Mapear campos técnicos para labels legíveis em português
const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  host: "Nameserver",
  value: "Valor",
  selector: "Seletor",
  key_type: "Tipo de Chave",
  key_size_bits: "Tamanho da Chave (bits)",
  priority: "Prioridade",
  exchange: "Servidor MX",
  txt_raw: "Registro TXT",
  flags: "Flags",
  record: "Registro",
  policy: "Política",
  rua: "Relatórios (rua)",
  ruf: "Relatórios Forenses (ruf)",
  pct: "Percentual",
  sp: "Política de Subdomínio",
  adkim: "Alinhamento DKIM",
  aspf: "Alinhamento SPF",
  ttl: "TTL",
  type: "Tipo",
  ip: "IP",
  ipv4: "IPv4",
  ipv6: "IPv6",
  cname: "CNAME",
  target: "Destino",
  expire: "Expiração",
  minimum: "Mínimo",
  refresh: "Refresh",
  retry: "Retry",
  serial: "Serial",
  mname: "Nameserver Primário",
  rname: "Email do Responsável",
  resolved_ips: "IPs Resolvidos",
  resolved_ip_count: "Quantidade de IPs",
};

// Mapa de labels técnicos para labels amigáveis (do backend)
const LABEL_TRANSLATIONS: Record<string, string> = {
  "data.has_dnskey": "Status",
  "data.has_ds": "Registro DS",
  "data.validated": "Validação DNSSEC",
  "data.mname": "Servidor Primário",
  "data.rname": "Email do Responsável",
  "data.contact_email": "Contato do Administrador",
  "data.refresh": "Tempo de Refresh",
  "data.serial": "Número Serial",
  "data.expire": "Tempo de Expiração",
  "data.minimum": "TTL Mínimo",
  "data.retry": "Tempo de Retry",
  "data.ttl": "TTL",
  "Nameservers encontrados": "Nameservers",
  DNSKEY: "Status DNSKEY",
  DS: "Status DS",
  Validated: "Validação",
  "SOA mname": "Nameserver Primário",
  "SOA contact": "Email do Responsável",
  // SPF translations
  "data.parsed.includes": "Mecanismos Include",
  "data.parsed.all": "Política ALL",
  "data.raw": "Registro SPF",
  // DKIM translations
  "data.found": "Registros DKIM",
  "data.found[]": "Registros DKIM",
  "data.found[0].key_size_bits": "Tamanho da Chave (bits)",
  // DMARC translations
  "data.parsed.aspf": "Alinhamento SPF",
  "data.parsed.adkim": "Alinhamento DKIM",
  "data.parsed.pct": "Cobertura",
  "data.parsed.p": "Política DMARC",
  "data.parsed.sp": "Política de Subdomínio",
  "data.parsed.rua": "Relatórios (RUA)",
  "data.parsed.ruf": "Relatórios Forenses (RUF)",
  // Novos labels para evidências específicas
  "Servidores MX": "Servidores MX",
  "Chaves DKIM Encontradas": "Chaves DKIM Encontradas",
  "Seletores DKIM": "Seletores DKIM",
  "Tamanho das Chaves": "Tamanho das Chaves",
  "Relatórios (RUA)": "Relatórios (RUA)",
  "data.records.simplified": "Servidores MX",
};

// Mapa de valores booleanos/técnicos para valores legíveis
const VALUE_TRANSFORMATIONS: Record<string, Record<string, string>> = {
  "data.has_dnskey": {
    true: "DNSSEC Ativado",
    false: "DNSSEC Desativado",
  },
  "data.has_ds": {
    true: "Presente",
    false: "Ausente",
  },
  DNSKEY: {
    true: "Presente",
    false: "Ausente",
  },
  DS: {
    true: "Presente",
    false: "Ausente",
  },
  "data.validated": {
    true: "Validação OK",
    false: "Não validado",
    unknown: "Não verificado",
    partial: "Parcialmente validado",
  },
  // DMARC alignment values
  "data.parsed.aspf": {
    r: "Relaxado (r)",
    s: "Estrito (s)",
  },
  "data.parsed.adkim": {
    r: "Relaxado (r)",
    s: "Estrito (s)",
  },
  // DMARC policy values
  "data.parsed.p": {
    reject: "Rejeitar (reject)",
    quarantine: "Quarentena (quarantine)",
    none: "Nenhuma (none)",
  },
  "data.parsed.sp": {
    reject: "Rejeitar (reject)",
    quarantine: "Quarentena (quarantine)",
    none: "Nenhuma (none)",
  },
  // DMARC coverage
  "data.parsed.pct": {
    "100": "100% (cobertura total)",
  },
};

// Labels que devem ser completamente ocultos (não aparecem na UI)
const HIDDEN_LABELS: string[] = [];

// Campos de tempo SOA que devem ser formatados
const SOA_TIME_FIELDS = ["data.refresh", "data.retry", "data.expire", "data.minimum", "data.ttl"];

// Formata valores de tempo SOA (segundos) para formato legível
function formatSOAValue(label: string, value: string): string {
  if (SOA_TIME_FIELDS.includes(label)) {
    const seconds = parseInt(value, 10);
    if (!isNaN(seconds)) {
      if (seconds >= 86400) {
        return `${Math.floor(seconds / 86400)} dia(s) (${seconds}s)`;
      } else if (seconds >= 3600) {
        return `${Math.floor(seconds / 3600)} hora(s) (${seconds}s)`;
      } else if (seconds >= 60) {
        return `${Math.floor(seconds / 60)} minuto(s) (${seconds}s)`;
      }
      return `${seconds} segundos`;
    }
  }
  return value;
}

// Campos que devem ser ocultados dentro de records (muito técnicos ou longos)
const HIDDEN_FIELDS = ["p_length", "p", "txt_raw", "flags", "name"];

interface RecordDisplayProps {
  record: Record<string, unknown>;
  labelOverrides?: Record<string, string>;
}

function RecordDisplay({ record, labelOverrides }: RecordDisplayProps) {
  const entries = Object.entries(record).filter(
    ([key, value]) => value !== null && value !== undefined && value !== "" && !HIDDEN_FIELDS.includes(key),
  );

  if (entries.length === 0) return null;

  // Helper para obter label traduzido
  const getLabel = (key: string) => labelOverrides?.[key] || FIELD_LABELS[key] || key;

  return (
    <div className="border-l-2 border-primary/30 pl-3 space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-col">
          <span className="text-xs text-muted-foreground">{getLabel(key)}</span>
          <span className="text-sm text-foreground font-mono break-all">
            {Array.isArray(value)
              ? value.join(", ")
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

interface FormattedCodeEvidenceProps {
  item: EvidenceItem;
}

function FormattedCodeEvidence({ item }: FormattedCodeEvidenceProps) {
  // Tentar parsear JSON
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(item.value);
  } catch {
    // Não é JSON válido
  }

  // PRIMEIRO: Detectar tipo pelo conteúdo JSON (antes de verificar labels)
  const isDkimByContent =
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    typeof parsed[0] === "object" &&
    (parsed[0] as Record<string, unknown>).selector !== undefined;

  const isMxByContent =
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    typeof parsed[0] === "object" &&
    (parsed[0] as Record<string, unknown>).exchange !== undefined;

  const isNameserverByContent =
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    (typeof parsed[0] === "string" ||
      (typeof parsed[0] === "object" &&
        (parsed[0] as Record<string, unknown>).host !== undefined &&
        (parsed[0] as Record<string, unknown>).exchange === undefined));

  // ========== TRATAMENTO DKIM ==========
  if (isDkimByContent) {
    const records = parsed as Array<Record<string, unknown>>;

    return (
      <div className="bg-muted/30 rounded-md p-3 border border-border/30 space-y-3">
        {records.map((rec, idx) => {
          const selectorName = rec.selector || rec.name || `Chave ${idx + 1}`;
          return (
            <div key={idx} className="border-l-2 border-primary/30 pl-3 space-y-1">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Seletor</span>
                <span className="text-sm text-foreground font-mono">{String(selectorName)}</span>
              </div>
              {rec.key_type && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Tipo de Chave</span>
                  <span className="text-sm text-foreground font-mono">{String(rec.key_type)}</span>
                </div>
              )}
              {rec.key_size_bits && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Tamanho da Chave</span>
                  <span className="text-sm text-foreground font-mono">{String(rec.key_size_bits)} bits</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ========== TRATAMENTO MX ==========
  if (isMxByContent) {
    const records = parsed as Array<Record<string, unknown>>;

    return (
      <div className="bg-muted/30 rounded-md p-3 border border-border/30 space-y-3">
        {records.map((rec, idx) => {
          const ips = rec.resolved_ips;
          const ipsDisplay = Array.isArray(ips) ? ips.join(", ") : "";

          return (
            <div key={idx} className="border-l-2 border-primary/30 pl-3 space-y-1">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Servidor MX</span>
                <span className="text-sm text-foreground font-mono">{String(rec.exchange)}</span>
              </div>
              {rec.priority !== undefined && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Prioridade</span>
                  <span className="text-sm text-foreground font-mono">{String(rec.priority)}</span>
                </div>
              )}
              {ipsDisplay && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">IPs Resolvidos</span>
                  <span className="text-sm text-foreground font-mono break-all">{ipsDisplay}</span>
                </div>
              )}
              {rec.resolved_ip_count !== undefined && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Quantidade de IPs</span>
                  <span className="text-sm text-foreground font-mono">{String(rec.resolved_ip_count)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ========== TRATAMENTO MX SIMPLIFICADO (MX-003) ==========
  const isMxSimplifiedByLabel = item.label === "data.records.simplified";

  if (isMxSimplifiedByLabel && Array.isArray(parsed)) {
    const records = parsed as Array<Record<string, unknown>>;
    return (
      <div className="bg-muted/30 rounded-md p-3 border border-border/30 space-y-3">
        {records.map((rec, idx) => (
          <div key={idx} className="border-l-2 border-primary/30 pl-3 space-y-1">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Servidor MX</span>
              <span className="text-sm text-foreground font-mono">{String(rec.exchange)}</span>
            </div>
            {rec.priority !== undefined && (
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Prioridade</span>
                <span className="text-sm text-foreground font-mono">{String(rec.priority)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ========== TRATAMENTO NAMESERVERS ==========
  if (
    isNameserverByContent ||
    item.label === "data.records" ||
    item.label === "Nameservers" ||
    item.label === "Nameservers encontrados"
  ) {
    if (Array.isArray(parsed)) {
      const hosts = parsed
        .map((r) => {
          if (typeof r === "string") return r;
          if (r && typeof r === "object") {
            return (
              (r as Record<string, unknown>).host ||
              (r as Record<string, unknown>).name ||
              (r as Record<string, unknown>).value
            );
          }
          return null;
        })
        .filter(Boolean);

      if (hosts.length > 0) {
        return (
          <div className="bg-muted/30 rounded-md p-3 border border-border/30 space-y-3">
            {hosts.map((host, idx) => (
              <div key={idx} className="border-l-2 border-primary/30 pl-3 flex flex-col">
                <span className="text-xs font-medium text-muted-foreground">Nameserver</span>
                <span className="text-sm text-foreground font-mono">{String(host)}</span>
              </div>
            ))}
          </div>
        );
      }
    }
  }

  // Se for array de objetos genérico
  if (Array.isArray(parsed) && parsed.length > 0) {
    // Se for array de strings simples
    if (typeof parsed[0] === "string") {
      return (
        <div className="bg-muted/30 rounded-md p-3 border border-border/30 space-y-3">
          {parsed.map((val, idx) => (
            <div key={idx} className="border-l-2 border-primary/30 pl-3 flex flex-col">
              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
              <span className="text-sm text-foreground font-mono">{String(val)}</span>
            </div>
          ))}
        </div>
      );
    }

    // Se for array de objetos genérico
    if (typeof parsed[0] === "object") {
      return (
        <div className="bg-muted/30 rounded-md p-3 border border-border/30 space-y-3">
          <div className="border-l-2 border-primary/30 pl-3 mb-2">
            <span className="text-xs font-medium text-muted-foreground block">{item.label}</span>
          </div>
          {parsed.map((record, idx) => (
            <RecordDisplay key={idx} record={record as Record<string, unknown>} />
          ))}
        </div>
      );
    }
  }

  // Se for objeto simples
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return (
      <div className="bg-muted/30 rounded-md p-3 border border-border/30 space-y-2">
        <div className="border-l-2 border-primary/30 pl-3">
          <span className="text-xs font-medium text-muted-foreground block">{item.label}</span>
        </div>
        <RecordDisplay record={parsed as Record<string, unknown>} />
      </div>
    );
  }

  // Fallback: exibir como código formatado
  return (
    <div className="bg-muted/30 rounded-md p-3 border border-border/30">
      <div className="border-l-2 border-primary/30 pl-3">
        <span className="text-xs font-medium text-muted-foreground block mb-1">{item.label}</span>
        <code className="text-xs text-primary bg-background/50 px-2 py-1 rounded block overflow-x-auto whitespace-pre-wrap">
          {item.value}
        </code>
      </div>
    </div>
  );
}

interface EvidenceItemDisplayProps {
  item: EvidenceItem;
}

export function EvidenceItemDisplay({ item }: EvidenceItemDisplayProps) {
  // Ocultar labels específicos (não aparecem na UI)
  if (HIDDEN_LABELS.includes(item.label)) {
    return null;
  }

  // Detectar contexto DMARC vs SPF para o label data.raw
  let translatedLabel = LABEL_TRANSLATIONS[item.label] || item.label;
  if (item.label === "data.raw") {
    // Detectar pelo conteúdo se é DMARC ou SPF
    if (item.value.startsWith("v=DMARC1")) {
      translatedLabel = "Registro DMARC";
    } else if (item.value.startsWith("v=spf1")) {
      translatedLabel = "Registro SPF";
    }
  }

  // Traduzir valor se houver transformação definida
  let transformedValue = VALUE_TRANSFORMATIONS[item.label]?.[item.value] || item.value;

  // Aplicar formatação de tempo SOA se aplicável
  transformedValue = formatSOAValue(item.label, transformedValue);

  // ========== TRATAMENTO ESPECIAL PARA STATUS DE INTERFACE ==========
  // Remover ícones ❌/✅ do valor de Status e apenas exibir o texto
  if (item.label === "Status" || translatedLabel === "Status") {
    // Remove emojis de status (❌, ✅, ⚠️, etc.) do início do valor
    const cleanValue = transformedValue.replace(/^[❌✅⚠️🔴🟢🟡⛔✔️]\s*/u, "");
    return (
      <div className="bg-muted/30 rounded-md p-3 border border-border/30">
        <div className="border-l-2 border-primary/30 pl-3">
          <span className="text-xs font-medium text-muted-foreground block mb-1">Status</span>
          <p className="text-sm text-foreground">{cleanValue}</p>
        </div>
      </div>
    );
  }

  // ========== TRATAMENTO ESPECIAL PARA VERSÃO DE FIRMWARE ==========
  // Detectar evidências de versão de firmware e usar formatação padrão (não código)
  const isFirmwareVersion = 
    item.label.toLowerCase().includes("versão") && 
    (item.label.toLowerCase().includes("firmware") || item.label.toLowerCase().includes("version"));
  
  if (isFirmwareVersion) {
    return (
      <div className="bg-muted/30 rounded-md p-3 border border-border/30">
        <div className="border-l-2 border-primary/30 pl-3">
          <span className="text-xs font-medium text-muted-foreground block mb-1">{translatedLabel}</span>
          <p className="text-sm text-foreground">{transformedValue}</p>
        </div>
      </div>
    );
  }

  // ========== TRATAMENTO ESPECIAL PARA INTERFACES DE FIREWALL ==========
  // Detectar evidências de interface (nome da interface com allowaccess)
  const isInterfaceEvidence = item.value && item.value.includes("allowaccess:");
  if (isInterfaceEvidence) {
    return (
      <div className="bg-muted/30 rounded-md p-3 border border-border/30">
        <div className="border-l-2 border-primary/30 pl-3">
          <span className="text-xs font-medium text-muted-foreground block mb-1">Interface</span>
          <p className="text-sm text-foreground font-mono">{item.label}</p>
        </div>
      </div>
    );
  }

  // Criar item transformado para uso nos componentes
  const transformedItem = { ...item, label: translatedLabel, value: transformedValue };

  // Detectar se é uma lista (múltiplos valores separados por vírgula)
  const isList =
    transformedItem.value.includes(",") && transformedItem.type !== "code" && transformedItem.type !== "json";

  // Renderização especial para listas (ex: nameservers, registros MX)
  if (isList) {
    const values = transformedItem.value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    return (
      <div className="bg-muted/30 rounded-md p-3 border border-border/30 space-y-3">
        {values.map((val, idx) => (
          <div key={idx} className="border-l-2 border-primary/30 pl-3 flex flex-col">
            <span className="text-xs font-medium text-muted-foreground">{transformedItem.label}</span>
            <span className="text-sm text-foreground font-mono">{val}</span>
          </div>
        ))}
      </div>
    );
  }

  // Renderização para listas (type === 'list') — cada item em sua própria linha
  if (transformedItem.type === "list") {
    const items = transformedItem.value.split("\n").filter(Boolean);
    return (
      <div className="bg-muted/30 rounded-md p-3 border border-border/30 space-y-3">
        {items.map((val, idx) => (
          <div key={idx} className="border-l-2 border-primary/30 pl-3 flex flex-col">
            <span className="text-sm text-foreground font-mono">{val}</span>
          </div>
        ))}
      </div>
    );
  }

  // Renderização para JSON/código
  if (transformedItem.type === "code" || transformedItem.type === "json") {
    return <FormattedCodeEvidence item={transformedItem} />;
  }

  // Renderização padrão para texto simples
  return (
    <div className="bg-muted/30 rounded-md p-3 border border-border/30">
      <div className="border-l-2 border-primary/30 pl-3">
        <span className="text-xs font-medium text-muted-foreground block mb-1">{transformedItem.label}</span>
        <p className="text-sm text-foreground">{transformedItem.value}</p>
      </div>
    </div>
  );
}
