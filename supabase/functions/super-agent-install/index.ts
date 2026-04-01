// Public installer script for Linux Super Agents (curl | bash)
// Installs masscan, nmap, httpx instead of PowerShell/M365/Amass.
// NOTE: keep this endpoint public (verify_jwt = false) and avoid exposing secrets.

import { getCorsHeaders } from '../_shared/cors.ts';

const PROJECT_REF = "akbosdbyheezghieiefz";
const API_BASE_URL = `https://${PROJECT_REF}.supabase.co/functions/v1`;
const RELEASE_BASE_URL = `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/agent-releases`;
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrYm9zZGJ5aGVlemdoaWVpZWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTEyODAsImV4cCI6MjA4NTE4NzI4MH0.9n-nUenSCwYIGztsfgVAbgis9wEakQDKX3Oe2xBiNvo";

function script(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL}"
RELEASE_BASE_URL="${RELEASE_BASE_URL}"
SUPABASE_URL="${SUPABASE_URL}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}"

ACTIVATION_CODE=""
AGENT_VERSION="latest"
POLL_INTERVAL="60"

PYTHON_BIN=""

INSTALL_DIR="/opt/iscope-agent"
CONFIG_DIR="/etc/iscope-agent"
STATE_DIR="/var/lib/iscope-agent"

SERVICE_NAME="iscope-supervisor"
LEGACY_SERVICE_NAME="iscope-agent"
SERVICE_USER="iscope"

UPDATE="0"
UNINSTALL="0"
LOCAL_AGENT=""
LOCAL_SUPERVISOR=""

mask_code() {
  local code="$1"
  if [[ "\${#code}" -le 8 ]]; then
    echo "****"
    return
  fi
  echo "\${code:0:4}-****-****-\${code: -4}"
}

usage() {
  cat <<EOF
Uso:
  sudo bash -s -- --activation-code "XXXX-XXXX-XXXX-XXXX" [opções]

Opções:
  --activation-code   (obrigatório)
  --version           (default: latest)
  --poll-interval     (default: 60)
  --install-dir       (default: /opt/iscope-agent)
  --config-dir        (default: /etc/iscope-agent)
  --state-dir         (default: /var/lib/iscope-agent)
  --update            (reinstala/atualiza)
  --uninstall         (remove serviço e diretórios)
  --local-agent       caminho local do .tar.gz do agent (modo offline)
  --local-supervisor  caminho local do .tar.gz do supervisor (modo offline)
EOF
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Erro: execute como root (use sudo)."
    exit 1
  fi
}

require_systemd() {
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "Erro: este instalador requer systemd (systemctl não encontrado)."
    exit 1
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --activation-code)
        ACTIVATION_CODE="\${2:-}"; shift 2 ;;
      --version)
        AGENT_VERSION="\${2:-}"; shift 2 ;;
      --poll-interval)
        POLL_INTERVAL="\${2:-}"; shift 2 ;;
      --install-dir)
        INSTALL_DIR="\${2:-}"; shift 2 ;;
      --config-dir)
        CONFIG_DIR="\${2:-}"; shift 2 ;;
      --state-dir)
        STATE_DIR="\${2:-}"; shift 2 ;;
      --update)
        UPDATE="1"; shift 1 ;;
      --uninstall)
        UNINSTALL="1"; shift 1 ;;
      --local-agent)
        LOCAL_AGENT="\${2:-}"; shift 2 ;;
      --local-supervisor)
        LOCAL_SUPERVISOR="\${2:-}"; shift 2 ;;
      -h|--help)
        usage; exit 0 ;;
      *)
        echo "Argumento desconhecido: $1"; usage; exit 1 ;;
    esac
  done

  if [[ "$UNINSTALL" -eq 0 ]] && [[ "$UPDATE" -eq 0 ]] && [[ -z "$ACTIVATION_CODE" ]]; then
    echo "Erro: --activation-code é obrigatório para instalação nova."
    exit 1
  fi
}

detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "\${ID:-unknown}"
  else
    echo "unknown"
  fi
}

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
      echo "[!] \$bin_path é Python \$ver — ignorado (mínimo \$MIN_MAJOR.\$MIN_MINOR)"
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
    echo "[✓] Python selecionado: \$best_bin (\$best_maj.\$best_min)"
    return 0
  fi

  return 1
}

require_python_min_version() {
  if [[ -z "\${PYTHON_BIN:-}" ]]; then
    echo "Erro: não consegui localizar Python >= 3.8 no sistema."
    echo "CentOS 7: sudo yum install -y centos-release-scl && sudo yum install -y rh-python38 rh-python38-python-pip"
    echo "RHEL/Oracle 8+: sudo dnf install -y python39 python39-pip"
    exit 1
  fi
}

install_deps() {
  local os_id
  os_id="$(detect_os)"
  echo "Instalando dependências (OS: \${os_id})..."

  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y tar curl python3 python3-venv python3-pip build-essential libssl-dev libffi-dev

    # Tentar instalar Python 3.9+ se o python3 padrao for < 3.9 (ex: Ubuntu 20.04)
    local py3_ver
    py3_ver="\$(python3 -c 'import sys; print(sys.version_info[1])' 2>/dev/null || echo 0)"
    if [[ "\$py3_ver" -lt 9 ]]; then
      echo "Python 3 padrao e 3.\$py3_ver. Tentando instalar Python 3.9+..."
      apt-get install -y software-properties-common || true
      add-apt-repository -y ppa:deadsnakes/ppa 2>/dev/null || true
      apt-get update -y
      apt-get install -y python3.9 python3.9-venv python3.9-distutils || true
    fi
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y tar curl gcc openssl-devel libffi-devel || true
    dnf install -y epel-release 2>/dev/null || true

    if [[ -f /etc/centos-release ]] && grep -q "CentOS Linux.*8" /etc/centos-release 2>/dev/null; then
      echo "Detectado CentOS Linux 8 (EOL) - redirecionando repos para vault..."
      sed -i 's/mirrorlist/#mirrorlist/g' /etc/yum.repos.d/CentOS-*.repo 2>/dev/null || true
      sed -i 's|#baseurl=http://mirror.centos.org|baseurl=http://vault.centos.org|g' /etc/yum.repos.d/CentOS-*.repo 2>/dev/null || true
      dnf clean all 2>/dev/null || true
    fi

    dnf config-manager --set-enabled appstream 2>/dev/null || true
    dnf config-manager --set-enabled powertools 2>/dev/null || true

    dnf module reset python39 -y 2>/dev/null || true
    dnf module enable python39:3.9 -y 2>/dev/null || dnf module enable python39 -y 2>/dev/null || true

    dnf install -y python39 python39-pip python39-devel 2>/dev/null || \\
    dnf install -y python3.9 python3.9-pip python3.9-devel 2>/dev/null || \\
    dnf install -y python3 python3-pip python3-devel 2>/dev/null || true

    return
  fi

  if command -v yum >/dev/null 2>&1; then
    yum install -y tar curl gcc openssl-devel libffi-devel || true
    yum install -y python39 python39-pip python39-devel || true
    yum install -y python3 python3-pip python3-devel || true
    return
  fi

  echo "Erro: gerenciador de pacotes não suportado. Instale python3, venv e pip manualmente."
  exit 1
}

install_scanner_tools() {
  echo "Instalando ferramentas de scan (masscan, nmap, httpx)..."

  # --- masscan ---
  if command -v masscan >/dev/null 2>&1; then
    echo "masscan já instalado: \$(masscan --version 2>&1 | head -1)"
  else
    echo "Instalando masscan..."
    if command -v apt-get >/dev/null 2>&1; then
      apt-get install -y masscan || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y masscan || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y masscan || true
    fi
    if command -v masscan >/dev/null 2>&1; then
      echo "masscan instalado: \$(masscan --version 2>&1 | head -1)"
    else
      echo "Aviso: falha ao instalar masscan via pacote. Tentando compilar..."
      install_masscan_from_source
    fi
  fi

  # Conceder CAP_NET_RAW ao masscan (necessário para raw sockets sem root)
  local masscan_path
  masscan_path="\$(command -v masscan 2>/dev/null || echo '/usr/local/bin/masscan')"
  if [[ -x "\$masscan_path" ]]; then
    echo "Configurando CAP_NET_RAW para masscan em \$masscan_path..."
    setcap cap_net_raw+ep "\$masscan_path" 2>/dev/null || {
      echo "Aviso: falha ao configurar CAP_NET_RAW. masscan pode precisar de root para funcionar."
    }
  fi

  # --- nmap ---
  if command -v nmap >/dev/null 2>&1; then
    echo "nmap já instalado: \$(nmap --version 2>&1 | head -1)"
  else
    echo "Instalando nmap..."
    if command -v apt-get >/dev/null 2>&1; then
      apt-get install -y nmap || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y nmap || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y nmap || true
    fi
    if command -v nmap >/dev/null 2>&1; then
      echo "nmap instalado: \$(nmap --version 2>&1 | head -1)"
    else
      echo "Aviso: falha ao instalar nmap."
    fi
  fi

  # Conceder CAP_NET_RAW ao nmap (necessario para SYN scan e OS detection sem root)
  local nmap_path
  nmap_path="\$(command -v nmap 2>/dev/null || echo '/usr/bin/nmap')"
  if [[ -x "\$nmap_path" ]]; then
    echo "Configurando CAP_NET_RAW para nmap em \$nmap_path..."
    setcap cap_net_raw+ep "\$nmap_path" 2>/dev/null || {
      echo "Aviso: falha ao configurar CAP_NET_RAW para nmap."
    }
  fi

  # --- httpx (projectdiscovery) ---
  if command -v httpx >/dev/null 2>&1 || [[ -x /usr/local/bin/httpx ]]; then
    echo "httpx já instalado"
  else
    install_httpx
  fi
}

install_masscan_from_source() {
  echo "Tentando instalar masscan via binário ou compilação..."

  # --- Tentativa 1: Download de binário pré-compilado ---
  local arch
  arch="\$(uname -m)"
  local bin_arch=""
  case "\$arch" in
    x86_64)  bin_arch="amd64" ;;
    aarch64) bin_arch="arm64" ;;
  esac

  if [[ -n "\$bin_arch" ]]; then
    echo "Tentando baixar binário masscan para \$bin_arch..."
    local masscan_url="https://github.com/robertdavidgraham/masscan/releases/latest/download/masscan-linux-\${bin_arch}"
    local tmp_bin
    tmp_bin="\$(mktemp)"
    if curl -fsSL "\$masscan_url" -o "\$tmp_bin" 2>/dev/null && file "\$tmp_bin" | grep -qi "elf"; then
      chmod +x "\$tmp_bin"
      mv "\$tmp_bin" /usr/local/bin/masscan
      echo "masscan binário instalado em /usr/local/bin/masscan"
      return
    fi
    rm -f "\$tmp_bin"
    echo "Binário pré-compilado não disponível. Tentando compilar do fonte..."
  fi

  # --- Tentativa 2: Compilação do fonte ---
  echo "Compilando masscan a partir do código-fonte..."
  local tmp_dir
  tmp_dir="\$(mktemp -d)"

  if command -v apt-get >/dev/null 2>&1; then
    apt-get install -y git make gcc libpcap-dev || true
  elif command -v dnf >/dev/null 2>&1; then
    # Habilitar repositórios CRB/CodeReady Builder (necessário para libpcap-devel no OL/RHEL 9)
    echo "Habilitando repositórios adicionais para dependências de compilação..."
    dnf config-manager --set-enabled crb 2>/dev/null || true
    dnf config-manager --set-enabled ol9_codeready_builder 2>/dev/null || true
    dnf config-manager --set-enabled ol9_developer_EPEL 2>/dev/null || true

    # Instalar git separadamente (vem do appstream, geralmente disponível)
    echo "Instalando git..."
    dnf install -y git 2>/dev/null || true

    # Instalar dependências de compilação
    echo "Instalando dependências de compilação (make, gcc, libpcap-devel)..."
    dnf install -y make gcc libpcap-devel 2>/dev/null || {
      echo "Tentando instalar libpcap-devel com --enablerepo=* ..."
      dnf install -y --enablerepo='*' libpcap-devel 2>/dev/null || true
    }
  fi

  if ! command -v git >/dev/null 2>&1; then
    echo "Aviso: git não disponível após tentativas de instalação. Não foi possível compilar masscan."
    rm -rf "\$tmp_dir"
    return
  fi

  # Verificar se libpcap-devel foi instalado (necessário para compilação)
  if ! rpm -q libpcap-devel >/dev/null 2>&1 && ! dpkg -s libpcap-dev >/dev/null 2>&1; then
    echo "Aviso: libpcap-devel não instalado. Tentando compilar mesmo assim..."
  fi

  git clone --depth 1 https://github.com/robertdavidgraham/masscan.git "\$tmp_dir/masscan" 2>/dev/null || {
    echo "Aviso: falha ao clonar masscan."
    rm -rf "\$tmp_dir"
    return
  }

  cd "\$tmp_dir/masscan" && make -j"\$(nproc)" 2>/dev/null && cp bin/masscan /usr/local/bin/masscan && chmod +x /usr/local/bin/masscan
  cd /
  rm -rf "\$tmp_dir"

  if command -v masscan >/dev/null 2>&1 || [[ -x /usr/local/bin/masscan ]]; then
    echo "masscan compilado e instalado em /usr/local/bin/masscan"
  else
    echo "Aviso: falha ao compilar masscan. Verifique se libpcap-devel está disponível."
  fi
}

install_httpx() {
  echo "Instalando httpx (projectdiscovery)..."

  local arch
  arch="\$(uname -m)"
  case "\$arch" in
    x86_64)  arch="amd64" ;;
    aarch64) arch="arm64" ;;
    *)
      echo "Aviso: arquitetura \$arch não suportada para httpx. Pulando."
      return
      ;;
  esac

  local version="1.6.9"
  local filename="httpx_\${version}_linux_\${arch}.zip"
  local url="https://github.com/projectdiscovery/httpx/releases/download/v\${version}/\${filename}"
  local tmp_dir
  tmp_dir="\$(mktemp -d)"

  echo "Baixando httpx v\${version} (\${arch})..."

  if ! curl -fsSL "\$url" -o "\${tmp_dir}/httpx.zip"; then
    echo "Aviso: falha ao baixar httpx. Continuando sem ele."
    rm -rf "\$tmp_dir"
    return
  fi

  # Instalar unzip se necessário
  if ! command -v unzip >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      apt-get install -y unzip || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y unzip || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y unzip || true
    fi
  fi

  unzip -q "\${tmp_dir}/httpx.zip" -d "\$tmp_dir"

  local bin_path
  bin_path="\$(find "\$tmp_dir" -name 'httpx' -type f 2>/dev/null | head -1)"

  if [[ -n "\$bin_path" ]]; then
    mv "\$bin_path" /usr/local/bin/httpx
    chmod +x /usr/local/bin/httpx
    echo "httpx instalado: /usr/local/bin/httpx"
  else
    echo "Aviso: binário httpx não encontrado no pacote."
  fi

  rm -rf "\$tmp_dir"
}

tune_conntrack() {
  echo "Configurando kernel conntrack para suportar scans de alta taxa..."

  # Verificar se o módulo nf_conntrack está carregado
  if ! lsmod | grep -q nf_conntrack 2>/dev/null; then
    echo "Módulo nf_conntrack não carregado. Tentando carregar..."
    modprobe nf_conntrack 2>/dev/null || {
      echo "Aviso: nf_conntrack não disponível neste kernel. Pulando tuning."
      return
    }
  fi

  local conf_file="/etc/sysctl.d/99-iscope-conntrack.conf"

  cat > "\$conf_file" <<CONNTRACK
net.netfilter.nf_conntrack_max=262144
net.netfilter.nf_conntrack_tcp_timeout_syn_sent=30
net.netfilter.nf_conntrack_tcp_timeout_time_wait=30
CONNTRACK

  sysctl -p "\$conf_file" 2>/dev/null || {
    echo "Aviso: falha ao aplicar configurações conntrack."
    return
  }

  local current_max
  current_max="\$(sysctl -n net.netfilter.nf_conntrack_max 2>/dev/null || echo 'desconhecido')"
  echo "Conntrack configurado: max=\$current_max, syn_sent_timeout=30s, time_wait_timeout=30s"
  echo "Arquivo persistido: \$conf_file"
}

ensure_user() {
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    local user_home
    user_home="\\$(eval echo ~$SERVICE_USER)"
    if [[ -n "\\$user_home" ]] && [[ ! -d "\\$user_home" ]]; then
      mkdir -p "\\$user_home"
      chown "$SERVICE_USER":"$SERVICE_USER" "\\$user_home"
    fi
    return
  fi

  if command -v useradd >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER" || true
    mkdir -p /home/$SERVICE_USER
    chown "$SERVICE_USER":"$SERVICE_USER" /home/$SERVICE_USER
  else
    echo "Aviso: useradd não encontrado; continuando sem criar usuário dedicado."
  fi
}

ensure_dirs() {
  mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$STATE_DIR" "/var/log/iscope-agent"

  # Marcar como Super Agent (system agent)
  touch "$STATE_DIR/is_system_agent.flag"
  echo "Flag de Super Agent criada: $STATE_DIR/is_system_agent.flag"
}

stop_service_if_exists() {
  for svc in "$SERVICE_NAME" "$LEGACY_SERVICE_NAME"; do
    echo "Parando serviço \${svc}..."
    systemctl stop "\$svc" 2>/dev/null || true
    systemctl disable "\$svc" 2>/dev/null || true
  done
}

uninstall_all() {
  echo "Removendo serviços iScope..."
  stop_service_if_exists
  rm -f "/etc/systemd/system/\${SERVICE_NAME}.service"
  rm -f "/etc/systemd/system/\${LEGACY_SERVICE_NAME}.service"
  systemctl daemon-reload || true
  rm -rf "$INSTALL_DIR" "$CONFIG_DIR" "$STATE_DIR"
  echo "Uninstall concluído."
}

get_signed_url() {
  local filename="\$1"
  local response
  response="\$(curl -sS "\${API_BASE_URL}/get-release-url?file=\${filename}" \\
    -H "apikey: \${SUPABASE_ANON_KEY}" 2>/dev/null)"
  local signed_url
  signed_url="\$(echo "\$response" | grep -o '"url":"[^"]*"' | sed 's/"url":"//;s/"$//')"
  if [[ -z "\$signed_url" ]]; then
    echo ""
    return 1
  fi
  echo "\$signed_url"
}

download_release() {
  # --- Modo offline: usar pacotes locais ---
  if [[ -n "\$LOCAL_AGENT" ]] || [[ -n "\$LOCAL_SUPERVISOR" ]]; then
    if [[ -z "\$LOCAL_AGENT" ]] || [[ -z "\$LOCAL_SUPERVISOR" ]]; then
      echo "Erro: --local-agent e --local-supervisor devem ser fornecidos juntos."
      exit 1
    fi
    if [[ ! -f "\$LOCAL_AGENT" ]]; then
      echo "Erro: arquivo não encontrado: \$LOCAL_AGENT"
      exit 1
    fi
    if [[ ! -f "\$LOCAL_SUPERVISOR" ]]; then
      echo "Erro: arquivo não encontrado: \$LOCAL_SUPERVISOR"
      exit 1
    fi

    echo "Modo offline: usando pacotes locais"
    echo "  Agent:      \$LOCAL_AGENT"
    echo "  Supervisor: \$LOCAL_SUPERVISOR"

    # --- Limpar e extrair (preservando venv, .env, logs) ---
    find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \\
      ! -name 'venv' \\
      ! -name '.env' \\
      ! -name 'storage' \\
      ! -name 'logs' \\
      -exec rm -rf {} + 2>/dev/null || true

    echo "Extraindo pacote do Agent..."
    tar -xzf "\$LOCAL_AGENT" -C "$INSTALL_DIR"

    echo "Extraindo pacote do Supervisor..."
    tar -xzf "\$LOCAL_SUPERVISOR" -C "$INSTALL_DIR"

    echo "Pacotes extraídos com sucesso em $INSTALL_DIR"
    return
  fi

  # --- Determinar nomes dos pacotes ---
  local file_agent file_sup
  if [[ "$AGENT_VERSION" == "latest" ]]; then
    file_agent="iscope-agent-latest.tar.gz"
    file_sup="iscope-supervisor-latest.tar.gz"
  else
    file_agent="iscope-agent-\${AGENT_VERSION}.tar.gz"
    file_sup="iscope-supervisor-latest.tar.gz"
  fi

  echo "Baixando pacote do Agent: \${file_agent}"
  echo "Baixando pacote do Supervisor: \${file_sup}"

  local curl_fail_flag
  if curl --help all 2>/dev/null | grep -q "fail-with-body"; then
    curl_fail_flag="--fail-with-body"
  else
    curl_fail_flag="--fail"
  fi

  # --- Obter URLs assinadas ---
  local url_agent url_sup
  url_agent="\$(get_signed_url "\${file_agent}")"
  if [[ -z "\$url_agent" ]]; then
    echo ""
    echo "Erro: não encontrei o pacote do Agent no Supabase Storage: agent-releases/\${file_agent}"
    echo ""
    echo "Próximos passos:"
    echo "1) Faça upload do arquivo \${file_agent} no bucket 'agent-releases'"
    echo "2) Rode o instalador novamente"
    echo ""
    echo "Storage (dashboard): https://supabase.com/dashboard/project/${PROJECT_REF}/storage/buckets"
    exit 1
  fi

  url_sup="\$(get_signed_url "\${file_sup}")"
  if [[ -z "\$url_sup" ]]; then
    echo ""
    echo "Erro: não encontrei o pacote do Supervisor no Supabase Storage: agent-releases/\${file_sup}"
    echo ""
    echo "Próximos passos:"
    echo "1) Faça upload do arquivo \${file_sup} no bucket 'agent-releases'"
    echo "2) Rode o instalador novamente"
    echo ""
    echo "Storage (dashboard): https://supabase.com/dashboard/project/${PROJECT_REF}/storage/buckets"
    exit 1
  fi

  # --- Baixar pacote do Agent ---
  local tmp_agent
  tmp_agent="$(mktemp)"
  if ! curl -sS "\$curl_fail_flag" -L "\$url_agent" -o "\$tmp_agent"; then
    echo "Erro: falha ao baixar pacote do Agent."
    exit 1
  fi

  if [[ ! -s "\$tmp_agent" ]]; then
    echo "Erro: download do Agent retornou um arquivo vazio."
    exit 1
  fi

  # --- Baixar pacote do Supervisor ---
  local tmp_sup
  tmp_sup="$(mktemp)"
  if ! curl -sS "\$curl_fail_flag" -L "\$url_sup" -o "\$tmp_sup"; then
    echo "Erro: falha ao baixar pacote do Supervisor em: \${url_sup}"
    exit 1
  fi

  if [[ ! -s "\$tmp_sup" ]]; then
    echo "Erro: download do Supervisor retornou um arquivo vazio."
    exit 1
  fi

  # --- Limpar e extrair (preservando venv, .env, logs) ---
  find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 \\
    ! -name 'venv' \\
    ! -name '.env' \\
    ! -name 'storage' \\
    ! -name 'logs' \\
    -exec rm -rf {} + 2>/dev/null || true

  echo "Extraindo pacote do Agent..."
  tar -xzf "\$tmp_agent" -C "$INSTALL_DIR"

  echo "Extraindo pacote do Supervisor..."
  tar -xzf "\$tmp_sup" -C "$INSTALL_DIR"

  rm -f "\$tmp_agent" "\$tmp_sup"
  echo "Pacotes extraídos com sucesso em $INSTALL_DIR"
}

setup_venv() {
  echo "Configurando ambiente Python (venv)..."
  inject_scl_paths
  if ! choose_python; then
    echo "Erro: Python >= 3.8 não encontrado após instalar dependências."
    exit 1
  fi

  require_python_min_version

  "$PYTHON_BIN" -m venv "$INSTALL_DIR/venv"
  "$INSTALL_DIR/venv/bin/pip" install --upgrade pip

  if [[ -d "$INSTALL_DIR/wheels" ]] && compgen -G "$INSTALL_DIR/wheels/*.whl" >/dev/null 2>&1; then
    echo "Instalando dependências (offline wheels bundle)..."
    "$INSTALL_DIR/venv/bin/pip" install --no-index --find-links "$INSTALL_DIR/wheels" -r "$INSTALL_DIR/requirements.txt"
  else
    "$INSTALL_DIR/venv/bin/pip" install --no-cache-dir -r "$INSTALL_DIR/requirements.txt"
  fi

  fix_certifi_bundle
}

fix_certifi_bundle() {
  echo "Verificando certificados CA do Python..."

  local certifi_dir
  certifi_dir="\$(find "$INSTALL_DIR/venv" -type d -name certifi 2>/dev/null | head -1)"

  if [[ -z "\$certifi_dir" ]]; then
    echo "Aviso: diretório certifi não encontrado no venv."
    return
  fi

  local cacert_pem="\$certifi_dir/cacert.pem"

  if [[ -f "\$cacert_pem" ]] && [[ -s "\$cacert_pem" ]]; then
    echo "Certificados CA OK: \$cacert_pem"
    return
  fi

  echo "Aviso: cacert.pem ausente ou vazio. Criando link para certificados do sistema..."

  local system_ca=""
  for ca_path in \\
    /etc/ssl/certs/ca-certificates.crt \\
    /etc/pki/tls/certs/ca-bundle.crt \\
    /etc/ssl/ca-bundle.pem \\
    /etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem \\
    /etc/ssl/cert.pem; do
    if [[ -f "\$ca_path" ]]; then
      system_ca="\$ca_path"
      break
    fi
  done

  if [[ -z "\$system_ca" ]]; then
    echo "Erro: Não foi possível encontrar CA bundle do sistema."
    return
  fi

  ln -sf "\$system_ca" "\$cacert_pem"
  echo "Link criado: \$cacert_pem -> \$system_ca"
}

write_env_file() {
  local env_file
  env_file="$CONFIG_DIR/agent.env"

  # Em modo --update, preservar env existente (evita perder ACTIVATION_CODE)
  if [[ "\$UPDATE" -eq 1 ]] && [[ -f "\$env_file" ]]; then
    echo "Modo update: preservando env file existente em \$env_file"
    grep -q "^SUPABASE_URL=" "\$env_file" || \\
      echo "SUPABASE_URL=\${SUPABASE_URL}" >> "\$env_file"
    grep -q "^SUPABASE_ANON_KEY=" "\$env_file" || \\
      echo "SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}" >> "\$env_file"
    grep -q "^SUPERVISOR_HEARTBEAT_INTERVAL=" "\$env_file" || \\
      echo "SUPERVISOR_HEARTBEAT_INTERVAL=120" >> "\$env_file"
    grep -q "^SUPERVISOR_LOG_FILE=" "\$env_file" || \\
      echo "SUPERVISOR_LOG_FILE=/var/log/iscope-agent/supervisor.log" >> "\$env_file"
    chmod 600 "\$env_file"
    return
  fi

  # Instalação nova: criar env completo
  cat > "$env_file" <<EOF
AGENT_API_BASE_URL=\${API_BASE_URL}
AGENT_POLL_INTERVAL=\${POLL_INTERVAL}
AGENT_STATE_FILE=\${STATE_DIR}/state.json
AGENT_LOG_FILE=/var/log/iscope-agent/agent.log
AGENT_ACTIVATION_CODE=\${ACTIVATION_CODE}
SUPERVISOR_HEARTBEAT_INTERVAL=120
SUPERVISOR_LOG_FILE=/var/log/iscope-agent/supervisor.log
SUPABASE_URL=\${SUPABASE_URL}
SUPABASE_ANON_KEY=\${SUPABASE_ANON_KEY}
EOF

  chmod 600 "$env_file"
}

ensure_state_file() {
  local state_file
  state_file="$STATE_DIR/state.json"
  if [[ ! -f "$state_file" ]]; then
    cat > "$state_file" <<EOF
{}
EOF
  fi

  if id "$SERVICE_USER" >/dev/null 2>&1; then
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$STATE_DIR" || true
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR" || true
    chown -R "$SERVICE_USER":"$SERVICE_USER" "/var/log/iscope-agent" || true
  fi
}

write_check_deps_script() {
  local script_file="$INSTALL_DIR/check-deps.sh"

  echo "Escrevendo script de verificação de componentes (Super Agent)..."

  cat > "$script_file" <<'CHECKDEPS'
#!/usr/bin/env bash
# iScope Super Agent - Scanner Components Pre-Start Check
# Runs as root via ExecStartPre before the agent starts.
set -uo pipefail

FLAG_FILE="/var/lib/iscope-agent/check_components.flag"
SYSTEM_FLAG="/var/lib/iscope-agent/is_system_agent.flag"
LOG_FILE="/var/log/iscope-agent/components.log"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

log_error() {
    log "ERROR: $*"
}

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

# Only run if check_components flag is set
if [[ ! -f "$FLAG_FILE" ]]; then
    exit 0
fi

log "=========================================="
log "Super Agent: Verificação de componentes"
log "=========================================="

rm -f "$FLAG_FILE" 2>/dev/null || true

check_and_install_masscan() {
    if command -v masscan >/dev/null 2>&1 || [[ -x /usr/local/bin/masscan ]]; then
        log "masscan OK"
        return 0
    fi
    log "masscan ausente. Instalando..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get install -y masscan 2>/dev/null || true
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y masscan 2>/dev/null || true
    fi
    if command -v masscan >/dev/null 2>&1 || [[ -x /usr/local/bin/masscan ]]; then
        log "masscan instalado"
        return 0
    fi
    log_error "Falha ao instalar masscan"
    return 1
}

check_and_install_nmap() {
    if command -v nmap >/dev/null 2>&1; then
        log "nmap OK"
        return 0
    fi
    log "nmap ausente. Instalando..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get install -y nmap 2>/dev/null || true
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y nmap 2>/dev/null || true
    fi
    if command -v nmap >/dev/null 2>&1; then
        log "nmap instalado"
        return 0
    fi
    log_error "Falha ao instalar nmap"
    return 1
}

check_and_install_httpx() {
    if command -v httpx >/dev/null 2>&1 || [[ -x /usr/local/bin/httpx ]]; then
        log "httpx OK"
        return 0
    fi
    log "httpx ausente. Instalando..."
    local arch
    arch="\$(uname -m)"
    case "\$arch" in
        x86_64)  arch="amd64" ;;
        aarch64) arch="arm64" ;;
        *)
            log_error "Arquitetura \$arch não suportada para httpx"
            return 1
            ;;
    esac
    local version="1.6.9"
    local url="https://github.com/projectdiscovery/httpx/releases/download/v\${version}/httpx_\${version}_linux_\${arch}.zip"
    local tmp_dir
    tmp_dir="\$(mktemp -d)"
    curl -fsSL "\$url" -o "\${tmp_dir}/httpx.zip" 2>/dev/null || {
        log_error "Falha ao baixar httpx"
        rm -rf "\$tmp_dir"
        return 1
    }
    if ! command -v unzip >/dev/null 2>&1; then
        if command -v apt-get >/dev/null 2>&1; then
            apt-get install -y unzip 2>/dev/null || true
        elif command -v dnf >/dev/null 2>&1; then
            dnf install -y unzip 2>/dev/null || true
        fi
    fi
    unzip -q "\${tmp_dir}/httpx.zip" -d "\$tmp_dir" 2>/dev/null
    local bin_path
    bin_path="\$(find "\$tmp_dir" -name 'httpx' -type f 2>/dev/null | head -1)"
    if [[ -n "\$bin_path" ]]; then
        mv "\$bin_path" /usr/local/bin/httpx
        chmod +x /usr/local/bin/httpx
        log "httpx instalado em /usr/local/bin/httpx"
    else
        log_error "Binário httpx não encontrado no pacote"
        rm -rf "\$tmp_dir"
        return 1
    fi
    rm -rf "\$tmp_dir"
    return 0
}

main() {
    local errors=0
    if ! check_and_install_masscan; then
        ((errors++)) || true
    fi
    if ! check_and_install_nmap; then
        ((errors++)) || true
    fi
    if ! check_and_install_httpx; then
        ((errors++)) || true
    fi
    log "=========================================="
    if [[ $errors -eq 0 ]]; then
        log "Verificação concluída com sucesso"
    else
        log "Verificação concluída com $errors erro(s)"
    fi
    log "=========================================="
    exit 0
}

main
CHECKDEPS

  chmod +x "$script_file"

  if id "$SERVICE_USER" >/dev/null 2>&1; then
    chown "$SERVICE_USER":"$SERVICE_USER" "$script_file" || true
  fi

  sed -i 's/\\r$//' "$script_file"

  echo "Script check-deps.sh (Super Agent) instalado: $script_file"
}

write_systemd_service() {
  # --- Supervisor unit ---
  local sup_unit="/etc/systemd/system/\${SERVICE_NAME}.service"
  cat > "$sup_unit" <<EOF
[Unit]
Description=iScope 360 Supervisor (Super Agent)
After=network-online.target
Wants=network-online.target iscope-agent.service

[Service]
Type=simple
User=root
Group=root
EnvironmentFile=\${CONFIG_DIR}/agent.env
WorkingDirectory=\${INSTALL_DIR}
ExecStartPre=-/bin/bash \${INSTALL_DIR}/check-deps.sh
ExecStart=\${INSTALL_DIR}/venv/bin/python -m supervisor.main
Restart=always
RestartSec=10
AmbientCapabilities=CAP_NET_RAW
StandardOutput=journal
StandardError=journal
SyslogIdentifier=iscope-supervisor
NoNewPrivileges=false
ProtectSystem=false

[Install]
WantedBy=multi-user.target
EOF

  # --- Worker (Agent) unit ---
  local agent_unit="/etc/systemd/system/\${LEGACY_SERVICE_NAME}.service"
  cat > "$agent_unit" <<EOF
[Unit]
Description=iScope 360 Agent (Worker - Super Agent)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
EnvironmentFile=\${CONFIG_DIR}/agent.env
WorkingDirectory=\${INSTALL_DIR}
ExecStart=\${INSTALL_DIR}/venv/bin/python main.py
Restart=on-failure
RestartSec=15
AmbientCapabilities=CAP_NET_RAW
StandardOutput=journal
StandardError=journal
SyslogIdentifier=iscope-agent
NoNewPrivileges=false
ProtectSystem=false

[Install]
WantedBy=multi-user.target
EOF

  # --- Monitor unit (independent service) ---
  local monitor_unit="/etc/systemd/system/iscope-monitor.service"
  cat > "$monitor_unit" <<EOF
[Unit]
Description=iScope 360 Monitor (Super Agent)
After=network-online.target iscope-supervisor.service
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=\${INSTALL_DIR}
EnvironmentFile=-\${CONFIG_DIR}/agent.env
ExecStart=\${INSTALL_DIR}/venv/bin/python -m monitor.main
Restart=always
RestartSec=15
StandardOutput=journal
StandardError=journal
SyslogIdentifier=iscope-monitor
NoNewPrivileges=false
ProtectSystem=false

[Install]
WantedBy=multi-user.target
EOF

  echo "Unit files criados: $sup_unit, $agent_unit e $monitor_unit"
}
}

setup_sudoers() {
  local sudoers_file="/etc/sudoers.d/iscope-agent"
  echo "Configurando permissão sudoers para restart dos serviços..."
  cat > "$sudoers_file" << SUDOERS
$SERVICE_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart $SERVICE_NAME
$SERVICE_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart $LEGACY_SERVICE_NAME
$SERVICE_USER ALL=(ALL) NOPASSWD: /bin/systemctl start $LEGACY_SERVICE_NAME
$SERVICE_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop $LEGACY_SERVICE_NAME
$SERVICE_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart iscope-monitor
$SERVICE_USER ALL=(ALL) NOPASSWD: /bin/systemctl start iscope-monitor
$SERVICE_USER ALL=(ALL) NOPASSWD: /bin/systemctl stop iscope-monitor
$SERVICE_USER ALL=(ALL) NOPASSWD: /usr/bin/nmap
SUDOERS
  chmod 440 "$sudoers_file"
  echo "Sudoers configurado: $sudoers_file"
}

start_service() {
  systemctl daemon-reload

  # Stop all services first to ensure clean state
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl stop "$LEGACY_SERVICE_NAME" 2>/dev/null || true
  systemctl stop "iscope-monitor" 2>/dev/null || true

  # Enable and start all services
  systemctl enable "$SERVICE_NAME" "$LEGACY_SERVICE_NAME" "iscope-monitor"
  systemctl start "$LEGACY_SERVICE_NAME"
  systemctl start "$SERVICE_NAME"
  systemctl start "iscope-monitor"

  echo "Serviços iniciados: $SERVICE_NAME, $LEGACY_SERVICE_NAME e iscope-monitor"
}

main() {
  require_root
  require_systemd
  parse_args "$@"

  if [[ "$UNINSTALL" -eq 1 ]]; then
    uninstall_all
    exit 0
  fi

  echo "Iniciando instalação do Super Agent (code: $(mask_code "$ACTIVATION_CODE"))"

  if [[ "$UPDATE" -eq 1 ]]; then
    stop_service_if_exists
  fi

  install_deps
  install_scanner_tools
  tune_conntrack
  ensure_user
  ensure_dirs
  download_release
  setup_venv
  write_env_file
  ensure_state_file
  write_check_deps_script
  write_systemd_service
  setup_sudoers
  start_service

  echo ""
  echo "Super Agent: Supervisor + Worker instalados como serviços independentes!"
  echo "  iscope-supervisor: heartbeats, updates, comandos remotos"
  echo "  iscope-agent: execução de tarefas (masscan, nmap, httpx)"
  echo ""
  echo "Verificar status:"
  echo "  systemctl status \${SERVICE_NAME} --no-pager"
  echo "  systemctl status \${LEGACY_SERVICE_NAME} --no-pager"
  echo "Ver logs:"
  echo "  journalctl -u \${SERVICE_NAME} -f --no-pager"
  echo "  journalctl -u \${LEGACY_SERVICE_NAME} -f --no-pager"
  echo ""
  echo "Ferramentas instaladas:"
  (command -v masscan >/dev/null 2>&1 || [[ -x /usr/local/bin/masscan ]]) && echo "  masscan: \$(/usr/local/bin/masscan --version 2>&1 | head -1)" || echo "  masscan: não encontrado"
  command -v nmap >/dev/null 2>&1 && echo "  nmap: \$(nmap --version 2>&1 | head -1)" || echo "  nmap: não encontrado"
  (command -v httpx >/dev/null 2>&1 || [[ -x /usr/local/bin/httpx ]]) && echo "  httpx: instalado" || echo "  httpx: não encontrado"
}

main "$@"
`;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(script(), {
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
});
