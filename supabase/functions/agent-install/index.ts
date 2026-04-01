// Public installer script for Linux agents (curl | bash)
// NOTE: keep this endpoint public (verify_jwt = false) and avoid exposing secrets.

import { getCorsHeaders } from '../_shared/cors.ts';

const PROJECT_REF = "akbosdbyheezghieiefz";
const API_BASE_URL = `https://${PROJECT_REF}.supabase.co/functions/v1`;
// RELEASE_BASE_URL removed — bucket is private, use get_signed_url() instead
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrYm9zZGJ5aGVlemdoaWVpZWZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTEyODAsImV4cCI6MjA4NTE4NzI4MH0.9n-nUenSCwYIGztsfgVAbgis9wEakQDKX3Oe2xBiNvo";

function script(): string {
  // Keep this as a single-file bash script.
  // IMPORTANT: never print activation code in full.
  return `#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL}"
# Downloads use signed URLs via get-release-url — no public storage URL needed
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
  --poll-interval     (default: 120)
  --install-dir       (default: /opt/iscope-agent)
  --config-dir        (default: /etc/iscope)
  --state-dir         (default: /var/lib/iscope)
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
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    # Instalar dependências básicas
    dnf install -y tar curl gcc openssl-devel libffi-devel || true
    
    # Instalar EPEL (útil para algumas distros)
    dnf install -y epel-release 2>/dev/null || true
    
    # Para CentOS 8 EOL (não Stream): apontar repos para vault
    if [[ -f /etc/centos-release ]] && grep -q "CentOS Linux.*8" /etc/centos-release 2>/dev/null; then
      echo "Detectado CentOS Linux 8 (EOL) - redirecionando repos para vault..."
      sed -i 's/mirrorlist/#mirrorlist/g' /etc/yum.repos.d/CentOS-*.repo 2>/dev/null || true
      sed -i 's|#baseurl=http://mirror.centos.org|baseurl=http://vault.centos.org|g' /etc/yum.repos.d/CentOS-*.repo 2>/dev/null || true
      dnf clean all 2>/dev/null || true
    fi
    
    # Habilitar repositório AppStream (contém módulos Python)
    echo "Habilitando repositório AppStream..."
    dnf config-manager --set-enabled appstream 2>/dev/null || true
    dnf config-manager --set-enabled powertools 2>/dev/null || true
    
    # Listar módulos Python disponíveis para debug
    echo "Módulos Python disponíveis:"
    dnf module list python* 2>/dev/null | head -20 || true
    
    # Tentar habilitar módulo python39 (CentOS/RHEL 8/Stream)
    echo "Habilitando módulo python39..."
    dnf module reset python39 -y 2>/dev/null || true
    dnf module enable python39:3.9 -y 2>/dev/null || dnf module enable python39 -y 2>/dev/null || true
    
    # Tentar habilitar módulo python38 como fallback
    dnf module reset python38 -y 2>/dev/null || true
    dnf module enable python38:3.8 -y 2>/dev/null || dnf module enable python38 -y 2>/dev/null || true
    
    # Instalar Python (múltiplos fallbacks com nomes alternativos)
    echo "Instalando Python..."
    dnf install -y python39 python39-pip python39-devel 2>/dev/null || \\
    dnf install -y python3.9 python3.9-pip python3.9-devel 2>/dev/null || \\
    dnf install -y python38 python38-pip python38-devel 2>/dev/null || \\
    dnf install -y python3.8 python3.8-pip python3.8-devel 2>/dev/null || \\
    dnf install -y python3 python3-pip python3-devel 2>/dev/null || \\
    dnf install -y python36 python36-pip python36-devel 2>/dev/null || true
    
    # Verificar se Python foi instalado
    echo "Verificando Python instalado:"
    which python3 python3.9 python3.8 2>/dev/null || true
    
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    yum install -y tar curl gcc openssl-devel libffi-devel || true

    # Detectar versão do OS
    local os_major=""
    if [[ -f /etc/os-release ]]; then
      os_major=\$(. /etc/os-release && echo "\${VERSION_ID%%.*}")
    elif [[ -f /etc/centos-release ]]; then
      os_major=\$(grep -oP '(?<=release )\\d' /etc/centos-release)
    fi

    if [[ "\$os_major" == "7" ]]; then
      echo "CentOS/RHEL 7 detectado — adicionando repositório IUS para Python 3.9..."
      yum install -y https://repo.ius.io/ius-release-el7.rpm 2>/dev/null || true
      yum install -y python39 python39-pip python39-devel 2>/dev/null || \\
      yum install -y python3 python3-pip python3-devel 2>/dev/null || true

      # Fallback: compilar Python 3.9 do source se nenhum >= 3.9 disponível
      if ! command -v python3.9 >/dev/null 2>&1 && ! python3 -c 'import sys; assert sys.version_info >= (3,9)' 2>/dev/null; then
        echo "Compilando Python 3.9 do source (pode levar alguns minutos)..."
        yum install -y gcc make zlib-devel bzip2-devel readline-devel sqlite-devel wget || true
        local py_src="/tmp/Python-3.9.18"
        wget -q "https://www.python.org/ftp/python/3.9.18/Python-3.9.18.tgz" -O /tmp/python3.tgz
        tar xzf /tmp/python3.tgz -C /tmp
        cd "\$py_src" && ./configure --enable-optimizations --prefix=/usr/local 2>&1 | tail -5
        make -j\$(nproc) 2>&1 | tail -5
        make altinstall
        cd /
        rm -rf "\$py_src" /tmp/python3.tgz
        echo "Python 3.9 compilado e instalado em /usr/local/bin/python3.9"
      fi
    else
      yum install -y python39 python39-pip python39-devel || true
      yum install -y python3 python3-pip python3-devel || true
    fi
    return
  fi

  echo "Erro: gerenciador de pacotes não suportado. Instale python3, venv e pip manualmente."
  exit 1
}

install_amass() {
  echo "Instalando Amass para enumeração de subdomínios..."
  
  # Garantir que /usr/local/bin está no PATH
  export PATH="/usr/local/bin:\$PATH"
  
  local arch
  arch="\$(uname -m)"
  case "\$arch" in
    x86_64)  arch="amd64" ;;
    aarch64) arch="arm64" ;;
    *)
      echo "Aviso: arquitetura \$arch não suportada para Amass. Pulando instalação."
      return 0
      ;;
  esac
  
  local version="v4.2.0"
  local filename="amass_Linux_\${arch}.zip"
  local url="https://github.com/owasp-amass/amass/releases/download/\${version}/\${filename}"
  local tmp_dir
  tmp_dir="\$(mktemp -d)"
  
  echo "Baixando Amass \${version} (\${arch})..."
  
  if ! curl -fsSL "\$url" -o "\${tmp_dir}/amass.zip"; then
    echo "Aviso: falha ao baixar Amass. Continuando sem ele."
    rm -rf "\$tmp_dir"
    return 0
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
  
  unzip -q "\${tmp_dir}/amass.zip" -d "\$tmp_dir"
  
  # Buscar binário - primeiro sem -executable (compatibilidade)
  local bin_path
  bin_path="\$(find "\$tmp_dir" -name 'amass' -type f 2>/dev/null | head -1)"
  
  # Fallback: buscar em estrutura conhecida
  if [[ -z "\$bin_path" ]]; then
    bin_path="\$(find "\$tmp_dir" -path '*/amass_Linux_*/amass' -type f 2>/dev/null | head -1)"
  fi
  
  if [[ -n "\$bin_path" ]]; then
    mv "\$bin_path" /usr/local/bin/amass
    chmod +x /usr/local/bin/amass
    
    # Verificar usando caminho absoluto
    if /usr/local/bin/amass -version >/dev/null 2>&1; then
      echo "Amass instalado: \$(/usr/local/bin/amass -version 2>&1 | head -1)"
    else
      echo "Amass instalado em /usr/local/bin/amass"
    fi
  else
    echo "Aviso: binário do Amass não encontrado no pacote."
    echo "Arquivos encontrados:"
    find "\$tmp_dir" -type f 2>/dev/null | head -10
  fi
  
  rm -rf "\$tmp_dir"
}

ensure_user() {
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    # Garantir que o diretório home existe (mesmo para usuário pré-existente)
    local user_home
    user_home="\\$(eval echo ~$SERVICE_USER)"
    if [[ -n "\\$user_home" ]] && [[ ! -d "\\$user_home" ]]; then
      mkdir -p "\\$user_home"
      chown "$SERVICE_USER":"$SERVICE_USER" "\\$user_home"
      echo "Diretório home criado: \\$user_home"
    fi
    return
  fi

  if command -v useradd >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER" || true
    # Criar diretório home para o usuário de serviço
    mkdir -p /home/$SERVICE_USER
    chown "$SERVICE_USER":"$SERVICE_USER" /home/$SERVICE_USER
    echo "Diretório home criado: /home/$SERVICE_USER"
  else
    echo "Aviso: useradd não encontrado; continuando sem criar usuário dedicado."
  fi
}

ensure_dirs() {
  mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$STATE_DIR" "/var/log/iscope-agent"
  mkdir -p "$STATE_DIR/certs"
}

generate_m365_certificate() {
  local cert_dir="$STATE_DIR/certs"
  local cert_file="$cert_dir/m365.crt"
  local key_file="$cert_dir/m365.key"
  local pfx_file="$cert_dir/m365.pfx"
  local thumbprint_file="$cert_dir/thumbprint.txt"
  
  # Caso 1: Todos os arquivos existem - pular
  if [[ -f "$cert_file" ]] && [[ -f "$key_file" ]] && [[ -f "$pfx_file" ]]; then
    echo "Certificado M365 já existe, pulando geração..."
    return
  fi
  
  # Caso 2: Cert e key existem, mas PFX não - gerar apenas o PFX
  if [[ -f "$cert_file" ]] && [[ -f "$key_file" ]] && [[ ! -f "$pfx_file" ]]; then
    echo "Gerando arquivo PFX a partir do certificado existente..."
    
    if ! command -v openssl >/dev/null 2>&1; then
      echo "Aviso: openssl não encontrado. Instalando..."
      if command -v apt-get >/dev/null 2>&1; then
        apt-get install -y openssl || true
      elif command -v dnf >/dev/null 2>&1; then
        dnf install -y openssl || true
      elif command -v yum >/dev/null 2>&1; then
        yum install -y openssl || true
      fi
    fi
    
    openssl pkcs12 \\
      -export \\
      -out "$pfx_file" \\
      -inkey "$key_file" \\
      -in "$cert_file" \\
      -passout pass: \\
      -legacy 2>/dev/null || \\
    openssl pkcs12 \\
      -export \\
      -out "$pfx_file" \\
      -inkey "$key_file" \\
      -in "$cert_file" \\
      -passout pass: 2>/dev/null
    
    if [[ -f "$pfx_file" ]]; then
      chmod 600 "$pfx_file"
      echo "Arquivo PFX gerado: $pfx_file"
      
      # Ajustar permissões para o usuário do serviço
      if id "$SERVICE_USER" >/dev/null 2>&1; then
        chown "$SERVICE_USER":"$SERVICE_USER" "$pfx_file" || true
      fi
    else
      echo "Aviso: Falha ao gerar arquivo PFX."
    fi
    
    return
  fi
  
  # Caso 3: Gerar certificado completo (nova instalação)
  echo "Gerando certificado X.509 para autenticação M365 PowerShell..."
  
  # Verificar se openssl está disponível
  if ! command -v openssl >/dev/null 2>&1; then
    echo "Aviso: openssl não encontrado. Instalando..."
    if command -v apt-get >/dev/null 2>&1; then
      apt-get install -y openssl || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y openssl || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y openssl || true
    fi
  fi
  
  if ! command -v openssl >/dev/null 2>&1; then
    echo "Aviso: openssl não disponível. Pulando geração de certificado M365."
    echo "Para habilitar análises M365 via PowerShell, instale openssl e reinstale o agent."
    return
  fi
  
  # Gerar certificado auto-assinado válido por 2 anos
  local hostname
  hostname="\$(hostname -s 2>/dev/null || echo 'agent')"
  
  openssl req -x509 \\
    -newkey rsa:2048 \\
    -keyout "$key_file" \\
    -out "$cert_file" \\
    -sha256 \\
    -days 730 \\
    -nodes \\
    -subj "/CN=iScope-Agent-\${hostname}/O=iScope 360" 2>/dev/null
  
  if [[ ! -f "$cert_file" ]]; then
    echo "Aviso: Falha ao gerar certificado M365."
    return
  fi
  
  # Permissões restritas na chave privada
  chmod 600 "$key_file"
  chmod 644 "$cert_file"
  
  # Gerar arquivo PFX (PKCS#12) para compatibilidade com PowerShell
  openssl pkcs12 \\
    -export \\
    -out "$pfx_file" \\
    -inkey "$key_file" \\
    -in "$cert_file" \\
    -passout pass: \\
    -legacy 2>/dev/null || \\
  openssl pkcs12 \\
    -export \\
    -out "$pfx_file" \\
    -inkey "$key_file" \\
    -in "$cert_file" \\
    -passout pass: 2>/dev/null
  
  if [[ -f "$pfx_file" ]]; then
    chmod 600 "$pfx_file"
    echo "  Arquivo PFX gerado para PowerShell: $pfx_file"
  else
    echo "Aviso: Falha ao gerar arquivo PFX."
  fi
  
  # Calcular e salvar thumbprint SHA1 (formato Azure)
  local thumbprint
  thumbprint="\$(openssl x509 -in "$cert_file" -noout -fingerprint -sha1 2>/dev/null | \\
    sed 's/SHA1 Fingerprint=//' | sed 's/://g')"
  
  if [[ -n "$thumbprint" ]]; then
    echo "$thumbprint" > "$thumbprint_file"
    echo "Certificado M365 gerado com sucesso!"
    echo "  Thumbprint: $thumbprint"
    echo "  Certificado: $cert_file"
    echo "  Chave privada: $key_file (600)"
    echo "  Arquivo PFX: $pfx_file (600)"
  fi
  
  # Ajustar permissões para o usuário do serviço
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$cert_dir" || true
  fi
}

install_powershell() {
  echo "Instalando PowerShell Core..."
  
  local os_id
  os_id="$(detect_os)"
  
  # Pular se pwsh já estiver instalado
  if command -v pwsh >/dev/null 2>&1; then
    echo "PowerShell já instalado: $(pwsh --version 2>&1 | head -1)"
    install_m365_modules
    return
  fi
  
  case "$os_id" in
    ubuntu)
      # Instalar pré-requisitos
      apt-get install -y wget apt-transport-https software-properties-common || true
      
      # Registrar Microsoft repo
      source /etc/os-release
      local deb_url="https://packages.microsoft.com/config/ubuntu/\${VERSION_ID}/packages-microsoft-prod.deb"
      
      # Fallback para versões mais antigas
      if ! wget -q "\$deb_url" -O /tmp/packages-microsoft-prod.deb 2>/dev/null; then
        deb_url="https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb"
        wget -q "\$deb_url" -O /tmp/packages-microsoft-prod.deb || true
      fi
      
      if [[ -f /tmp/packages-microsoft-prod.deb ]]; then
        dpkg -i /tmp/packages-microsoft-prod.deb || true
        rm -f /tmp/packages-microsoft-prod.deb
        apt-get update || true
        apt-get install -y powershell || true
      fi
      ;;
      
    debian)
      apt-get install -y wget apt-transport-https software-properties-common || true
      
      # Registrar Microsoft repo para Debian
      source /etc/os-release
      wget -q "https://packages.microsoft.com/config/debian/\${VERSION_ID}/packages-microsoft-prod.deb" -O /tmp/packages-microsoft-prod.deb 2>/dev/null || \\
      wget -q "https://packages.microsoft.com/config/debian/11/packages-microsoft-prod.deb" -O /tmp/packages-microsoft-prod.deb || true
      
      if [[ -f /tmp/packages-microsoft-prod.deb ]]; then
        dpkg -i /tmp/packages-microsoft-prod.deb || true
        rm -f /tmp/packages-microsoft-prod.deb
        apt-get update || true
        apt-get install -y powershell || true
      fi
      ;;
      
    rhel|centos|rocky|almalinux|ol)
      # Detectar versão major do RHEL/CentOS
      local rhel_version="8"
      if [[ -f /etc/os-release ]]; then
        source /etc/os-release
        rhel_version="\${VERSION_ID%%.*}"
      fi
      
      # Registrar Microsoft repo
      curl -sSL "https://packages.microsoft.com/config/rhel/\${rhel_version}/prod.repo" | tee /etc/yum.repos.d/microsoft-prod.repo >/dev/null 2>&1 || \\
      curl -sSL "https://packages.microsoft.com/config/rhel/8/prod.repo" | tee /etc/yum.repos.d/microsoft-prod.repo >/dev/null 2>&1 || true
      
      # Instalar PowerShell
      if command -v dnf >/dev/null 2>&1; then
        dnf install -y powershell || true
      else
        yum install -y powershell || true
      fi
      ;;
      
    *)
      echo "Aviso: Distribuição \$os_id não suportada para instalação automática do PowerShell."
      echo "Instale manualmente: https://docs.microsoft.com/en-us/powershell/scripting/install/installing-powershell-on-linux"
      return
      ;;
  esac
  
  if command -v pwsh >/dev/null 2>&1; then
    echo "PowerShell instalado: \$(pwsh --version 2>&1 | head -1)"
    install_m365_modules
  else
    echo "Aviso: Falha ao instalar PowerShell. Funcionalidades M365 via PowerShell não estarão disponíveis."
  fi
}

install_m365_modules() {
  echo "Instalando módulos PowerShell para M365..."
  
  if ! command -v pwsh >/dev/null 2>&1; then
    echo "Aviso: PowerShell não disponível. Pulando instalação de módulos M365."
    return
  fi
  
  # Instalar módulos globalmente
  pwsh -NoProfile -NonInteractive -Command '
    \$ErrorActionPreference = "Continue"
    \$ProgressPreference = "SilentlyContinue"
    
    # Configurar PSGallery como trusted
    try {
      Set-PSRepository -Name PSGallery -InstallationPolicy Trusted -ErrorAction SilentlyContinue
    } catch {
      Write-Host "Aviso: Não foi possível configurar PSGallery como trusted"
    }
    
    # Instalar ExchangeOnlineManagement
    if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement -ErrorAction SilentlyContinue)) {
      Write-Host "Instalando ExchangeOnlineManagement..."
      try {
        Install-Module -Name ExchangeOnlineManagement -Scope AllUsers -Force -AllowClobber -ErrorAction Stop
        Write-Host "ExchangeOnlineManagement instalado com sucesso!"
      } catch {
        Write-Host "Aviso: Falha ao instalar ExchangeOnlineManagement: \$(\$_.Exception.Message)"
      }
    } else {
      Write-Host "ExchangeOnlineManagement já instalado"
    }
    
    # Instalar Microsoft.Graph.Authentication
    if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication -ErrorAction SilentlyContinue)) {
      Write-Host "Instalando Microsoft.Graph.Authentication..."
      try {
        Install-Module -Name Microsoft.Graph.Authentication -Scope AllUsers -Force -AllowClobber -ErrorAction Stop
        Write-Host "Microsoft.Graph.Authentication instalado com sucesso!"
      } catch {
        Write-Host "Aviso: Falha ao instalar Microsoft.Graph.Authentication: \$(\$_.Exception.Message)"
      }
    } else {
      Write-Host "Microsoft.Graph.Authentication já instalado"
    }
    
    Write-Host "Verificação de módulos M365 concluída."
  ' || echo "Aviso: Falha ao instalar módulos PowerShell M365."
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

  # Prefer more explicit curl failures when available.
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
    echo "Storage (dashboard): https://supabase.com/dashboard/project/${PROJECT_REF}/storage/buckets"
    exit 1
  fi

  if [[ ! -s "\$tmp_agent" ]]; then
    echo "Erro: download do Agent retornou um arquivo vazio."
    echo "URL: \${url_agent}"
    exit 1
  fi

  # --- Baixar pacote do Supervisor ---
  local tmp_sup
  tmp_sup="$(mktemp)"
  if ! curl -sS "\$curl_fail_flag" -L "\$url_sup" -o "\$tmp_sup"; then
    echo "Erro: falha ao baixar pacote do Supervisor em: \${url_sup}"
    echo "Verifique se o arquivo existe no bucket agent-releases e se o bucket está público."
    echo "Storage (dashboard): https://supabase.com/dashboard/project/${PROJECT_REF}/storage/buckets"
    exit 1
  fi

  if [[ ! -s "\$tmp_sup" ]]; then
    echo "Erro: download do Supervisor retornou um arquivo vazio."
    echo "URL: \${url_sup}"
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
    echo "CentOS 7: sudo yum install -y centos-release-scl && sudo yum install -y rh-python38 rh-python38-python-pip"
    exit 1
  fi

  require_python_min_version

  "$PYTHON_BIN" -m venv "$INSTALL_DIR/venv"
  "$INSTALL_DIR/venv/bin/pip" install --upgrade pip

  # Offline bundle support: if wheels/ exists, install without hitting PyPI
  if [[ -d "$INSTALL_DIR/wheels" ]] && compgen -G "$INSTALL_DIR/wheels/*.whl" >/dev/null 2>&1; then
    echo "Instalando dependências (offline wheels bundle)..."
    "$INSTALL_DIR/venv/bin/pip" install --no-index --find-links "$INSTALL_DIR/wheels" -r "$INSTALL_DIR/requirements.txt"
  else
    # Use --no-cache-dir to avoid issues with corrupted cached packages (e.g., certifi missing cacert.pem)
    "$INSTALL_DIR/venv/bin/pip" install --no-cache-dir -r "$INSTALL_DIR/requirements.txt"
  fi
  
  # Fix certifi CA bundle if missing (known issue with certifi 2026.x)
  fix_certifi_bundle
}

fix_certifi_bundle() {
  echo "Verificando certificados CA do Python..."
  
  # Find certifi directory in venv
  local certifi_dir
  certifi_dir="\$(find "$INSTALL_DIR/venv" -type d -name certifi 2>/dev/null | head -1)"
  
  if [[ -z "\$certifi_dir" ]]; then
    echo "Aviso: diretório certifi não encontrado no venv."
    return
  fi
  
  local cacert_pem="\$certifi_dir/cacert.pem"
  
  # Check if cacert.pem exists and is a regular file (not a broken symlink)
  if [[ -f "\$cacert_pem" ]] && [[ -s "\$cacert_pem" ]]; then
    echo "Certificados CA OK: \$cacert_pem"
    return
  fi
  
  echo "Aviso: cacert.pem ausente ou vazio. Criando link para certificados do sistema..."
  
  # Common system CA bundle paths
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
    echo "Instale o pacote ca-certificates: dnf install -y ca-certificates"
    return
  fi
  
  # Create symlink
  ln -sf "\$system_ca" "\$cacert_pem"
  echo "Link criado: \$cacert_pem -> \$system_ca"
  
  # Verify TLS connectivity
  verify_tls_connectivity
}

verify_tls_connectivity() {
  echo "Testando conectividade TLS..."
  
  if "$INSTALL_DIR/venv/bin/python" -c "import requests; requests.get('https://httpbin.org/get', timeout=10)" 2>/dev/null; then
    echo "Conectividade TLS OK"
  else
    echo "Aviso: Teste de conectividade TLS falhou."
    echo "Verifique os certificados CA do sistema."
  fi
}

write_env_file() {
  local env_file
  env_file="$CONFIG_DIR/agent.env"

  # Em modo --update, preservar env existente (evita perder ACTIVATION_CODE)
  if [[ "\$UPDATE" -eq 1 ]] && [[ -f "\$env_file" ]]; then
    echo "Modo update: preservando env file existente em \$env_file"
    # Garantir que chaves obrigatórias estejam presentes (adicionadas em versões recentes)
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
  # Do not echo activation code to stdout
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
  
  echo "Escrevendo script de verificação de componentes..."
  
  cat > "$script_file" <<'CHECKDEPS'
#!/usr/bin/env bash
# iScope Agent - System Components Pre-Start Check
# Runs as root via ExecStartPre before the agent starts.
set -uo pipefail

FLAG_FILE="/var/lib/iscope-agent/check_components.flag"
LOG_FILE="/var/log/iscope-agent/components.log"
CERT_DIR="/var/lib/iscope-agent/certs"
STATE_DIR="/var/lib/iscope-agent"
SERVICE_USER="iscope"

log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    echo "$msg"
    echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

log_error() {
    log "ERROR: $*"
}

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

if [[ ! -f "$FLAG_FILE" ]]; then
    exit 0
fi

log "=========================================="
log "Verificação de componentes solicitada"
log "=========================================="

rm -f "$FLAG_FILE" 2>/dev/null || true
log "Flag removida"

detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        echo "\${ID:-unknown}"
    else
        echo "unknown"
    fi
}

get_os_version() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        echo "\${VERSION_ID%%.*}"
    else
        echo "0"
    fi
}

OS_ID="$(detect_os)"
OS_VERSION="$(get_os_version)"
log "OS detectado: $OS_ID $OS_VERSION"

check_powershell() {
    command -v pwsh >/dev/null 2>&1
}

install_powershell_debian() {
    log "Instalando PowerShell no Debian/Ubuntu..."
    apt-get update -y || true
    apt-get install -y wget apt-transport-https software-properties-common || true
    . /etc/os-release
    local deb_url="https://packages.microsoft.com/config/\${ID}/\${VERSION_ID}/packages-microsoft-prod.deb"
    if ! wget -q "$deb_url" -O /tmp/packages-microsoft-prod.deb 2>/dev/null; then
        if [[ "$ID" == "ubuntu" ]]; then
            deb_url="https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb"
        else
            deb_url="https://packages.microsoft.com/config/debian/11/packages-microsoft-prod.deb"
        fi
        wget -q "$deb_url" -O /tmp/packages-microsoft-prod.deb || return 1
    fi
    dpkg -i /tmp/packages-microsoft-prod.deb || true
    rm -f /tmp/packages-microsoft-prod.deb
    apt-get update || true
    apt-get install -y powershell || return 1
    return 0
}

install_powershell_rhel() {
    log "Instalando PowerShell no RHEL/CentOS..."
    local rhel_version="\${OS_VERSION:-8}"
    curl -sSL "https://packages.microsoft.com/config/rhel/\${rhel_version}/prod.repo" \\
        -o /etc/yum.repos.d/microsoft-prod.repo 2>/dev/null || \
    curl -sSL "https://packages.microsoft.com/config/rhel/8/prod.repo" \
        -o /etc/yum.repos.d/microsoft-prod.repo 2>/dev/null || true
    if command -v dnf >/dev/null 2>&1; then
        dnf install -y powershell || return 1
    else
        yum install -y powershell || return 1
    fi
    return 0
}

install_powershell() {
    if check_powershell; then
        local version
        version="$(pwsh --version 2>&1 | head -1)"
        log "PowerShell OK: $version"
        return 0
    fi
    log "PowerShell ausente. Instalando..."
    case "$OS_ID" in
        ubuntu|debian)
            install_powershell_debian
            ;;
        rhel|centos|rocky|almalinux|ol)
            install_powershell_rhel
            ;;
        *)
            log_error "OS não suportado para instalação automática do PowerShell: $OS_ID"
            return 1
            ;;
    esac
    if check_powershell; then
        log "PowerShell instalado: $(pwsh --version 2>&1 | head -1)"
        return 0
    else
        log_error "Falha ao instalar PowerShell"
        return 1
    fi
}

check_m365_modules() {
    if ! check_powershell; then
        return 0
    fi
    pwsh -NoProfile -NonInteractive -Command '
        $eom = Get-Module -ListAvailable -Name ExchangeOnlineManagement -ErrorAction SilentlyContinue
        $mga = Get-Module -ListAvailable -Name Microsoft.Graph.Authentication -ErrorAction SilentlyContinue
        if ($eom -and $mga) { exit 0 } else { exit 1 }
    ' >/dev/null 2>&1
}

install_m365_modules() {
    if ! check_powershell; then
        log "PowerShell não disponível, pulando módulos M365"
        return 0
    fi
    if check_m365_modules; then
        log "Módulos M365 OK"
        return 0
    fi
    log "Instalando módulos M365..."
    pwsh -NoProfile -NonInteractive -Command '
        $ErrorActionPreference = "Continue"
        $ProgressPreference = "SilentlyContinue"
        try {
            Set-PSRepository -Name PSGallery -InstallationPolicy Trusted -ErrorAction SilentlyContinue
        } catch {}
        if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement -ErrorAction SilentlyContinue)) {
            Write-Host "Instalando ExchangeOnlineManagement..."
            try {
                Install-Module -Name ExchangeOnlineManagement -Scope AllUsers -Force -AllowClobber -ErrorAction Stop
                Write-Host "ExchangeOnlineManagement instalado!"
            } catch {
                Write-Host "Aviso: Falha ao instalar ExchangeOnlineManagement: $($_.Exception.Message)"
            }
        }
        if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication -ErrorAction SilentlyContinue)) {
            Write-Host "Instalando Microsoft.Graph.Authentication..."
            try {
                Install-Module -Name Microsoft.Graph.Authentication -Scope AllUsers -Force -AllowClobber -ErrorAction Stop
                Write-Host "Microsoft.Graph.Authentication instalado!"
            } catch {
                Write-Host "Aviso: Falha ao instalar Microsoft.Graph.Authentication: $($_.Exception.Message)"
            }
        }
    ' 2>&1 | while read -r line; do log "  pwsh: $line"; done
    if check_m365_modules; then
        log "Módulos M365 instalados com sucesso"
        return 0
    else
        log_error "Falha ao instalar alguns módulos M365"
        return 1
    fi
}

check_certificate() {
    [[ -f "$CERT_DIR/m365.crt" ]] && [[ -f "$CERT_DIR/m365.key" ]] && [[ -f "$CERT_DIR/m365.pfx" ]]
}

generate_certificate() {
    if check_certificate; then
        if openssl x509 -in "$CERT_DIR/m365.crt" -checkend 86400 >/dev/null 2>&1; then
            log "Certificado M365 OK"
            return 0
        else
            log "Certificado M365 expirando, regenerando..."
        fi
    fi
    
    # Se cert e key existem mas pfx não, gerar apenas o pfx
    if [[ -f "$CERT_DIR/m365.crt" ]] && [[ -f "$CERT_DIR/m365.key" ]] && [[ ! -f "$CERT_DIR/m365.pfx" ]]; then
        log "Gerando apenas arquivo PFX a partir do certificado existente..."
        openssl pkcs12 \
            -export \
            -out "$CERT_DIR/m365.pfx" \
            -inkey "$CERT_DIR/m365.key" \
            -in "$CERT_DIR/m365.crt" \
            -passout pass: \
            -legacy 2>/dev/null || \
        openssl pkcs12 \
            -export \
            -out "$CERT_DIR/m365.pfx" \
            -inkey "$CERT_DIR/m365.key" \
            -in "$CERT_DIR/m365.crt" \
            -passout pass: 2>/dev/null
        if [[ -f "$CERT_DIR/m365.pfx" ]]; then
            chmod 600 "$CERT_DIR/m365.pfx"
            if id "$SERVICE_USER" >/dev/null 2>&1; then
                chown "$SERVICE_USER":"$SERVICE_USER" "$CERT_DIR/m365.pfx" || true
            fi
            log "Arquivo PFX gerado: $CERT_DIR/m365.pfx"
        else
            log_error "Falha ao gerar arquivo PFX"
        fi
        return 0
    fi
    
    log "Gerando certificado M365..."
    if ! command -v openssl >/dev/null 2>&1; then
        log "openssl não encontrado, instalando..."
        if command -v apt-get >/dev/null 2>&1; then
            apt-get install -y openssl || true
        elif command -v dnf >/dev/null 2>&1; then
            dnf install -y openssl || true
        elif command -v yum >/dev/null 2>&1; then
            yum install -y openssl || true
        fi
    fi
    if ! command -v openssl >/dev/null 2>&1; then
        log_error "openssl não disponível"
        return 1
    fi
    mkdir -p "$CERT_DIR"
    local hostname
    hostname="\\$(hostname -s 2>/dev/null || echo 'agent')"
    openssl req -x509 \\
        -newkey rsa:2048 \\
        -keyout "\\$CERT_DIR/m365.key" \\
        -out "\\$CERT_DIR/m365.crt" \\
        -sha256 \\
        -days 365 \\
        -nodes \\
        -subj "/CN=iScope-Agent-\${hostname}/O=iScope 360" 2>/dev/null
    if [[ ! -f "$CERT_DIR/m365.crt" ]]; then
        log_error "Falha ao gerar certificado"
        return 1
    fi
    chmod 600 "$CERT_DIR/m365.key"
    chmod 644 "$CERT_DIR/m365.crt"
    openssl pkcs12 \
        -export \
        -out "$CERT_DIR/m365.pfx" \
        -inkey "$CERT_DIR/m365.key" \
        -in "$CERT_DIR/m365.crt" \
        -passout pass: \
        -legacy 2>/dev/null || \
    openssl pkcs12 \
        -export \
        -out "$CERT_DIR/m365.pfx" \
        -inkey "$CERT_DIR/m365.key" \
        -in "$CERT_DIR/m365.crt" \
        -passout pass: 2>/dev/null
    if [[ -f "$CERT_DIR/m365.pfx" ]]; then
        chmod 600 "$CERT_DIR/m365.pfx"
        log "Arquivo PFX gerado para PowerShell"
    else
        log_error "Falha ao gerar arquivo PFX"
        return 1
    fi
    local thumbprint
    thumbprint="$(openssl x509 -in "$CERT_DIR/m365.crt" -noout -fingerprint -sha1 2>/dev/null | \
        sed 's/.*=//' | tr -d ':')"
    if [[ -n "$thumbprint" ]]; then
        echo "$thumbprint" > "$CERT_DIR/thumbprint.txt"
        chmod 644 "$CERT_DIR/thumbprint.txt"
        log "Certificado gerado com thumbprint: $thumbprint"
    else
        log_error "Falha ao calcular thumbprint"
        return 1
    fi
    if id "$SERVICE_USER" >/dev/null 2>&1; then
        chown -R "$SERVICE_USER":"$SERVICE_USER" "$CERT_DIR" || true
    fi
    return 0
}

main() {
    local errors=0
    if ! install_powershell; then
        ((errors++)) || true
    fi
    if ! install_m365_modules; then
        ((errors++)) || true
    fi
    if ! generate_certificate; then
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
  
  # Garantir line endings Unix (prevenir CRLF)
  sed -i 's/\r$//' "$script_file"
  
  echo "Script check-deps.sh instalado: $script_file"
}

write_systemd_service() {
  # --- Supervisor unit ---
  local sup_unit="/etc/systemd/system/\${SERVICE_NAME}.service"
  cat > "$sup_unit" <<EOF
[Unit]
Description=iScope 360 Supervisor
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
Description=iScope 360 Agent (Worker)
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
Description=iScope 360 Monitor
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

  echo "Iniciando instalação do Agent (code: $(mask_code "$ACTIVATION_CODE"))"

  if [[ "$UPDATE" -eq 1 ]]; then
    stop_service_if_exists
  fi

  install_deps
  install_amass
  install_powershell
  ensure_user
  ensure_dirs
  generate_m365_certificate
  download_release
  setup_venv
  write_env_file
  ensure_state_file
  write_check_deps_script
  write_systemd_service
  setup_sudoers
  start_service

  echo ""
  echo "Supervisor + Worker instalados como serviços independentes!"
  echo "  iscope-supervisor: heartbeats, updates, comandos remotos"
  echo "  iscope-agent: execução de tarefas"
  echo ""
  echo "Verificar status:"
  echo "  systemctl status \${SERVICE_NAME} --no-pager"
  echo "  systemctl status \${LEGACY_SERVICE_NAME} --no-pager"
  echo "Ver logs:"
  echo "  journalctl -u \${SERVICE_NAME} -f --no-pager"
  echo "  journalctl -u \${LEGACY_SERVICE_NAME} -f --no-pager"
  
  # Mostrar informações do certificado M365 se existir
  if [[ -f "$STATE_DIR/certs/thumbprint.txt" ]]; then
    echo ""
    echo "Certificado M365 disponível para análises via PowerShell."
    echo "Thumbprint: \$(cat "$STATE_DIR/certs/thumbprint.txt")"
  fi
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
