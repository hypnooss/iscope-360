const PROJECT_REF = "akbosdbyheezghieiefz";
const API_BASE_URL = `https://${PROJECT_REF}.supabase.co/functions/v1`;
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrYm9zZGJ5aGVlemdoaWVpZWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTEyODAsImV4cCI6MjA4NTE4NzI4MH0.9n-nUenSCwYIGztsfgVAbgis9wEakQDKX3Oe2xBiNvo";

function script(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/iscope-agent"
STATE_DIR="/var/lib/iscope-agent"
LEGACY_ENV_PATH="/etc/iscope-agent/.env"
LEGACY_ENV_ALT_PATH="/etc/iscope-agent/agent.env"
SYSTEM_ENV_PATH="/etc/iscope/agent.env"
API_BASE_URL="${API_BASE_URL}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}"

SERVICE_NAME="iscope-supervisor"
LEGACY_SERVICE_NAME="iscope-agent"
PYTHON_BIN=""
ENV_FILE=""

RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
CYAN='\\033[0;36m'
NC='\\033[0m'

log()   { echo -e "\${CYAN}[fix]\${NC} $*"; }
ok()    { echo -e "\${GREEN}[✓]\${NC} $*"; }
warn()  { echo -e "\${YELLOW}[!]\${NC} $*"; }
fail()  { echo -e "\${RED}[✗]\${NC} $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  fail "Execute como root: curl ... | sudo bash"
  exit 1
fi

if [[ ! -d "$INSTALL_DIR" ]]; then
  fail "Diretório $INSTALL_DIR não encontrado. Use o instalador completo:"
  echo "  curl -sS \${API_BASE_URL}/agent-install | sudo bash -s -- --activation-code XXXX"
  exit 1
fi

if [[ -f "$INSTALL_DIR/.env" ]]; then
  ENV_FILE="$INSTALL_DIR/.env"
elif [[ -f "$SYSTEM_ENV_PATH" ]]; then
  ENV_FILE="$SYSTEM_ENV_PATH"
elif [[ -f "$LEGACY_ENV_ALT_PATH" ]]; then
  ENV_FILE="$LEGACY_ENV_ALT_PATH"
elif [[ -f "$LEGACY_ENV_PATH" ]]; then
  ENV_FILE="$LEGACY_ENV_PATH"
else
  fail "Arquivo de ambiente não encontrado. Procurei em $INSTALL_DIR/.env, $SYSTEM_ENV_PATH, $LEGACY_ENV_ALT_PATH e $LEGACY_ENV_PATH."
  echo "Use o instalador completo com --activation-code."
  exit 1
fi

ok "Arquivo de ambiente detectado em $ENV_FILE"

inject_scl_paths() {
  local scl_dirs=(
    "/opt/rh/rh-python311/root/usr/bin"
    "/opt/rh/rh-python39/root/usr/bin"
    "/opt/rh/rh-python38/root/usr/bin"
  )
  local d
  for d in "\${scl_dirs[@]}"; do
    if [[ -d "$d" ]] && [[ ":\$PATH:" != *":$d:"* ]]; then
      export PATH="$d:\$PATH"
    fi
  done
}

choose_python() {
  local MIN_MAJOR=3
  local MIN_MINOR=8
  local candidates=("python3.11" "python3.10" "python3.9" "python3.8" "python3")
  local best_bin="" best_maj=0 best_min=0
  local c bin_path ver maj min

  for c in "\${candidates[@]}"; do
    bin_path="\$(command -v "$c" 2>/dev/null || true)"
    [[ -z "\$bin_path" ]] && continue

    ver="\$("\$bin_path" -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")' 2>/dev/null || true)"
    [[ -z "\$ver" ]] && continue

    maj="\${ver%%.*}"
    min="\${ver#*.}"

    if [[ "\$maj" -lt "\$MIN_MAJOR" ]] || [[ "\$maj" -eq "\$MIN_MAJOR" && "\$min" -lt "\$MIN_MINOR" ]]; then
      warn "\$bin_path é Python \$ver — ignorado (mínimo \$MIN_MAJOR.\$MIN_MINOR)"
      continue
    fi

    if [[ "\$maj" -gt "\$best_maj" ]] || [[ "\$maj" -eq "\$best_maj" && "\$min" -gt "\$best_min" ]]; then
      best_bin="\$bin_path"
      best_maj="\$maj"
      best_min="\$min"
    fi
  done

  if [[ -n "\$best_bin" ]]; then
    PYTHON_BIN="\$best_bin"
    ok "Python selecionado: \$best_bin (\$best_maj.\$best_min)"
    return 0
  fi

  return 1
}

inject_scl_paths

if ! choose_python; then
  fail "Python >= 3.8 não encontrado no sistema."
  echo "  CentOS 7: sudo yum install -y centos-release-scl && sudo yum install -y rh-python38 rh-python38-python-pip"
  exit 1
fi

log "Parando serviços..."
systemctl stop "$SERVICE_NAME" 2>/dev/null || true
systemctl stop "$LEGACY_SERVICE_NAME" 2>/dev/null || true
systemctl stop "iscope-monitor" 2>/dev/null || true
ok "Serviços parados"

get_signed_url() {
  local filename="$1"
  local response
  response="$(curl -sS "\${API_BASE_URL}/get-release-url?file=\${filename}" -H "apikey: \${SUPABASE_ANON_KEY}" 2>/dev/null)"
  local signed_url
  signed_url="$(echo "$response" | grep -o '"url":"[^"]*"' | sed 's/"url":"//;s/"$//')"
  echo "$signed_url"
}

CURL_FAIL="--fail"
if curl --help all 2>/dev/null | grep -q "fail-with-body"; then
  CURL_FAIL="--fail-with-body"
fi

log "Obtendo URLs dos pacotes..."
URL_AGENT="$(get_signed_url "iscope-agent-latest.tar.gz")"
URL_SUP="$(get_signed_url "iscope-supervisor-latest.tar.gz")"
URL_MONITOR="$(get_signed_url "iscope-monitor-latest.tar.gz")"

if [[ -z "$URL_AGENT" ]]; then
  fail "Pacote iscope-agent-latest.tar.gz não encontrado no storage."
  exit 1
fi
if [[ -z "$URL_SUP" ]]; then
  fail "Pacote iscope-supervisor-latest.tar.gz não encontrado no storage."
  exit 1
fi
if [[ -z "$URL_MONITOR" ]]; then
  warn "Pacote iscope-monitor-latest.tar.gz não encontrado no storage. O Supervisor pode continuar falhando se ainda depender do módulo monitor."
fi

ok "URLs obtidas"

TMP_AGENT="$(mktemp)"
TMP_SUP="$(mktemp)"
TMP_MONITOR=""
if [[ -n "$URL_MONITOR" ]]; then
  TMP_MONITOR="$(mktemp)"
fi

log "Baixando pacote do Agent..."
if ! curl -sS "$CURL_FAIL" -L "$URL_AGENT" -o "$TMP_AGENT"; then
  fail "Falha ao baixar pacote do Agent."
  exit 1
fi
ok "Agent baixado ($(du -h "$TMP_AGENT" | cut -f1))"

log "Baixando pacote do Supervisor..."
if ! curl -sS "$CURL_FAIL" -L "$URL_SUP" -o "$TMP_SUP"; then
  fail "Falha ao baixar pacote do Supervisor."
  exit 1
fi
ok "Supervisor baixado ($(du -h "$TMP_SUP" | cut -f1))"

if [[ -n "$URL_MONITOR" ]] && [[ -n "$TMP_MONITOR" ]]; then
  log "Baixando pacote do Monitor..."
  if ! curl -sS "$CURL_FAIL" -L "$URL_MONITOR" -o "$TMP_MONITOR"; then
    warn "Falha ao baixar pacote do Monitor. Vou continuar sem ele."
    rm -f "$TMP_MONITOR"
    TMP_MONITOR=""
  else
    ok "Monitor baixado ($(du -h "$TMP_MONITOR" | cut -f1))"
  fi
fi

log "Criando backup dos módulos atuais..."
BACKUP_TS="$(date +%Y%m%d_%H%M%S)"
BACKUP_PATH="\${STATE_DIR}/fix_backup_\${BACKUP_TS}"
mkdir -p "$BACKUP_PATH"
for mod in agent supervisor monitor; do
  if [[ -d "$INSTALL_DIR/$mod" ]]; then
    cp -a "$INSTALL_DIR/$mod" "$BACKUP_PATH/$mod" 2>/dev/null || true
  fi
done
ok "Backup em $BACKUP_PATH"

log "Limpando módulos antigos..."
find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \
  ! -name 'venv' \
  ! -name '.env' \
  ! -name 'storage' \
  ! -name 'logs' \
  -exec rm -rf {} + 2>/dev/null || true

log "Extraindo pacote do Agent..."
tar -xzf "$TMP_AGENT" -C "$INSTALL_DIR"

log "Extraindo pacote do Supervisor..."
tar -xzf "$TMP_SUP" -C "$INSTALL_DIR"

if [[ -n "$TMP_MONITOR" ]] && [[ -f "$TMP_MONITOR" ]]; then
  log "Extraindo pacote do Monitor..."
  tar -xzf "$TMP_MONITOR" -C "$INSTALL_DIR"
fi

rm -f "$TMP_AGENT" "$TMP_SUP" "$TMP_MONITOR"
ok "Pacotes extraídos em $INSTALL_DIR"

# Always download fresh requirements.txt from storage to avoid stale local copies
log "Baixando requirements.txt atualizado do storage..."
URL_REQ="$(get_signed_url "requirements.txt")"
if [[ -n "$URL_REQ" ]]; then
  if curl -sS "$CURL_FAIL" -L "$URL_REQ" -o "$INSTALL_DIR/requirements.txt"; then
    ok "requirements.txt baixado do storage (sobrescreveu qualquer versão anterior)"
  else
    warn "Falha ao baixar requirements.txt do storage"
    if [[ ! -f "$INSTALL_DIR/requirements.txt" ]]; then
      fail "requirements.txt não disponível (nem no pacote, nem no storage)"
      exit 1
    fi
    warn "Usando requirements.txt extraído do pacote como fallback"
  fi
else
  warn "requirements.txt não encontrado no storage"
  if [[ ! -f "$INSTALL_DIR/requirements.txt" ]]; then
    fail "requirements.txt não disponível (nem no pacote, nem no storage)"
    exit 1
  fi
  warn "Usando requirements.txt extraído do pacote como fallback"
fi

# Validate requirements.txt for known incompatibilities
if grep -qE 'dnspython>=2\\.7' "$INSTALL_DIR/requirements.txt" 2>/dev/null; then
  fail "requirements.txt contém dnspython>=2.7.0 (incompatível com Python 3.8)"
  fail "Atualize o requirements.txt no bucket agent-releases e tente novamente"
  exit 1
fi
ok "requirements.txt validado"

log "Módulos instalados:"
for mod in agent supervisor monitor; do
  if [[ -f "$INSTALL_DIR/$mod/__init__.py" ]]; then
    ver=""
    ver="$(grep -oP '__version__\\s*=\\s*"\\K[^"]+' "$INSTALL_DIR/$mod/version.py" 2>/dev/null || echo "?")"
    ok "  $mod v$ver"
  else
    warn "  $mod — NÃO ENCONTRADO no pacote"
  fi
done

log "Reconstruindo venv..."
if [[ -f "$INSTALL_DIR/requirements.txt" ]]; then
  rm -rf "$INSTALL_DIR/venv"
  "$PYTHON_BIN" -m venv "$INSTALL_DIR/venv"
  "$INSTALL_DIR/venv/bin/pip" install --upgrade pip -q

  if [[ -d "$INSTALL_DIR/wheels" ]] && compgen -G "$INSTALL_DIR/wheels/*.whl" >/dev/null 2>&1; then
    "$INSTALL_DIR/venv/bin/pip" install --no-index --find-links "$INSTALL_DIR/wheels" -r "$INSTALL_DIR/requirements.txt" -q
  else
    "$INSTALL_DIR/venv/bin/pip" install --no-cache-dir -r "$INSTALL_DIR/requirements.txt" -q
  fi
  ok "Venv reconstruído"
else
  warn "requirements.txt não encontrado — venv não foi recriado"
fi

CERTIFI_DIR="$(find "$INSTALL_DIR/venv" -type d -name certifi 2>/dev/null | head -1)"
if [[ -n "$CERTIFI_DIR" ]]; then
  CACERT="$CERTIFI_DIR/cacert.pem"
  if [[ ! -f "$CACERT" ]] || [[ ! -s "$CACERT" ]]; then
    for ca_path in /etc/ssl/certs/ca-certificates.crt /etc/pki/tls/certs/ca-bundle.crt /etc/ssl/ca-bundle.pem /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem /etc/ssl/cert.pem; do
      if [[ -f "$ca_path" ]]; then
        ln -sf "$ca_path" "$CACERT"
        ok "certifi CA bundle linkado para $ca_path"
        break
      fi
    done
  fi
fi

rm -f "\${STATE_DIR}/supervisor_restart.flag" 2>/dev/null || true
rm -f "\${STATE_DIR}/supervisor_rollback.flag" 2>/dev/null || true
rm -f "\${STATE_DIR}/pending_supervisor_update.json" 2>/dev/null || true
ok "Flags de crash limpos"

if id iscope >/dev/null 2>&1; then
  chown -R iscope:iscope "$INSTALL_DIR" 2>/dev/null || true
  chown -R iscope:iscope "$STATE_DIR" 2>/dev/null || true
fi

# ---- Create/update monitor systemd unit if missing ----
MONITOR_SERVICE="iscope-monitor"
MONITOR_UNIT="/etc/systemd/system/\${MONITOR_SERVICE}.service"
if [[ ! -f "$MONITOR_UNIT" ]]; then
  log "Criando unit file do Monitor..."
  CONFIG_DIR=""
  if [[ -f "/etc/iscope/agent.env" ]]; then
    CONFIG_DIR="/etc/iscope"
  elif [[ -f "/etc/iscope-agent/agent.env" ]]; then
    CONFIG_DIR="/etc/iscope-agent"
  else
    CONFIG_DIR="/etc/iscope"
  fi
  cat > "$MONITOR_UNIT" <<MONEOF
[Unit]
Description=iScope 360 Monitor
After=network-online.target iscope-supervisor.service
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=-\${CONFIG_DIR}/agent.env
ExecStart=$INSTALL_DIR/venv/bin/python -m monitor.main
Restart=always
RestartSec=15
StandardOutput=journal
StandardError=journal
SyslogIdentifier=iscope-monitor
NoNewPrivileges=false
ProtectSystem=false

[Install]
WantedBy=multi-user.target
MONEOF
  systemctl enable "$MONITOR_SERVICE" 2>/dev/null || true
  ok "Unit file do Monitor criado"
fi

systemctl daemon-reload 2>/dev/null || true
log "Iniciando serviços..."

systemctl start "$SERVICE_NAME" 2>/dev/null || true
sleep 2

if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "Supervisor rodando!"
else
  fail "Supervisor não iniciou. Verificar: journalctl -u $SERVICE_NAME --no-pager -n 30"
fi

systemctl start "$LEGACY_SERVICE_NAME" 2>/dev/null || true
sleep 1
if systemctl is-active --quiet "$LEGACY_SERVICE_NAME"; then
  ok "Worker rodando!"
else
  warn "Worker não iniciou (pode ser normal — Supervisor gerencia o Worker)"
fi

# Start monitor service
systemctl start "$MONITOR_SERVICE" 2>/dev/null || true
sleep 1
if systemctl is-active --quiet "$MONITOR_SERVICE"; then
  ok "Monitor rodando!"
else
  warn "Monitor não iniciou. Verificar: journalctl -u $MONITOR_SERVICE --no-pager -n 10"
fi

echo ""
echo -e "\${GREEN}========================================\${NC}"
echo -e "\${GREEN}  Fix concluído!\${NC}"
echo -e "\${GREEN}========================================\${NC}"
echo ""
echo "Verificar status:"
echo "  systemctl status $SERVICE_NAME --no-pager"
echo "  systemctl status $MONITOR_SERVICE --no-pager"
echo "  journalctl -u $SERVICE_NAME -f --no-pager"
echo ""
echo "Backup dos módulos antigos em: $BACKUP_PATH"
echo ""
`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
    });
  }

  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  return new Response(script(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});