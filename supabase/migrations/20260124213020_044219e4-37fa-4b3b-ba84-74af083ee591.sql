-- Inserir regras de compliance para SonicWall TZ
INSERT INTO compliance_rules (device_type_id, code, name, category, severity, weight, description, recommendation, pass_description, fail_description, evaluation_logic, is_active)
VALUES
  -- Regra 1: Deep Packet Inspection
  (
    '22d07d7d-7b53-4ad4-8061-f1c6ad81da48',
    'SW_DPI_ENABLED',
    'Deep Packet Inspection Ativo',
    'Segurança de Rede',
    'high',
    3,
    'Verifica se a inspeção profunda de pacotes (DPI) está habilitada nas regras de acesso do firewall.',
    'Habilite o DPI nas regras de acesso para detectar e bloquear ameaças ocultas no tráfego de rede.',
    'DPI está ativo nas regras de acesso, permitindo detecção avançada de ameaças.',
    'DPI está desativado. O firewall não consegue inspecionar o conteúdo dos pacotes para detectar malware e intrusões.',
    '{"source_key": "access_rules", "field_path": "access_rules.0.ipv4.dpi", "conditions": [{"operator": "equals", "value": true, "result": "pass"}, {"operator": "equals", "value": false, "result": "fail"}], "default_result": "unknown"}'::jsonb,
    true
  ),
  
  -- Regra 2: Filtro Botnet
  (
    '22d07d7d-7b53-4ad4-8061-f1c6ad81da48',
    'SW_BOTNET_FILTER',
    'Filtro de Botnet Ativo',
    'Proteção Avançada',
    'high',
    3,
    'Verifica se a proteção contra botnets está habilitada para bloquear comunicações com redes de comando e controle.',
    'Ative o filtro de botnet para impedir que dispositivos comprometidos se comuniquem com servidores maliciosos.',
    'Proteção contra botnet está ativa, bloqueando comunicações C&C.',
    'Proteção contra botnet está desativada. Dispositivos infectados podem se comunicar com servidores de comando e controle.',
    '{"source_key": "access_rules", "field_path": "access_rules.0.ipv4.botnet_filter", "conditions": [{"operator": "equals", "value": true, "result": "pass"}, {"operator": "equals", "value": false, "result": "fail"}], "default_result": "unknown"}'::jsonb,
    true
  ),
  
  -- Regra 3: Filtro GeoIP
  (
    '22d07d7d-7b53-4ad4-8061-f1c6ad81da48',
    'SW_GEOIP_FILTER',
    'Filtro GeoIP Habilitado',
    'Proteção Avançada',
    'medium',
    2,
    'Verifica se a filtragem geográfica de IPs está habilitada para bloquear tráfego de países de alto risco.',
    'Configure o filtro GeoIP para bloquear tráfego de regiões conhecidas por atividades maliciosas.',
    'Filtro GeoIP está ativo, permitindo bloqueio por localização geográfica.',
    'Filtro GeoIP está desativado. Não há proteção baseada em localização geográfica.',
    '{"source_key": "access_rules", "field_path": "access_rules.0.ipv4.geo_ip_filter", "conditions": [{"operator": "equals", "value": true, "result": "pass"}, {"operator": "equals", "value": false, "result": "fail"}], "default_result": "unknown"}'::jsonb,
    true
  ),
  
  -- Regra 4: DPI SSL Client
  (
    '22d07d7d-7b53-4ad4-8061-f1c6ad81da48',
    'SW_DPI_SSL_CLIENT',
    'Inspeção SSL de Cliente',
    'Inspeção SSL',
    'medium',
    2,
    'Verifica se a inspeção SSL de tráfego de saída está habilitada para detectar ameaças em conexões criptografadas.',
    'Habilite a inspeção SSL de cliente para analisar tráfego HTTPS de saída.',
    'Inspeção SSL de cliente está ativa, permitindo análise de tráfego criptografado de saída.',
    'Inspeção SSL de cliente está desativada. Tráfego HTTPS de saída não é inspecionado.',
    '{"source_key": "access_rules", "field_path": "access_rules.0.ipv4.dpi_ssl_client", "conditions": [{"operator": "equals", "value": true, "result": "pass"}, {"operator": "equals", "value": false, "result": "fail"}], "default_result": "unknown"}'::jsonb,
    true
  ),
  
  -- Regra 5: DPI SSL Server
  (
    '22d07d7d-7b53-4ad4-8061-f1c6ad81da48',
    'SW_DPI_SSL_SERVER',
    'Inspeção SSL de Servidor',
    'Inspeção SSL',
    'medium',
    2,
    'Verifica se a inspeção SSL de tráfego de entrada está habilitada para detectar ameaças em conexões criptografadas.',
    'Habilite a inspeção SSL de servidor para analisar tráfego HTTPS de entrada.',
    'Inspeção SSL de servidor está ativa, permitindo análise de tráfego criptografado de entrada.',
    'Inspeção SSL de servidor está desativada. Tráfego HTTPS de entrada não é inspecionado.',
    '{"source_key": "access_rules", "field_path": "access_rules.0.ipv4.dpi_ssl_server", "conditions": [{"operator": "equals", "value": true, "result": "pass"}, {"operator": "equals", "value": false, "result": "fail"}], "default_result": "unknown"}'::jsonb,
    true
  ),
  
  -- Regra 6: Logging Habilitado
  (
    '22d07d7d-7b53-4ad4-8061-f1c6ad81da48',
    'SW_LOGGING_ENABLED',
    'Logging de Regras Ativo',
    'Auditoria',
    'medium',
    2,
    'Verifica se o registro de logs está habilitado nas regras de acesso para fins de auditoria e investigação.',
    'Habilite o logging em todas as regras de acesso para manter registro de atividades de rede.',
    'Logging está ativo nas regras de acesso, permitindo auditoria completa.',
    'Logging está desativado. Não há registro de atividades para análise forense.',
    '{"source_key": "access_rules", "field_path": "access_rules.0.ipv4.logging", "conditions": [{"operator": "equals", "value": true, "result": "pass"}, {"operator": "equals", "value": false, "result": "fail"}], "default_result": "unknown"}'::jsonb,
    true
  );