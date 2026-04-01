
-- =============================================
-- Domínio Externo (23 regras)
-- =============================================

UPDATE compliance_rules SET description = 'Verifica a presença de pelo menos um registro DKIM (DomainKeys Identified Mail) configurado no DNS do domínio.' WHERE id = '7ea1bbbb-191d-4207-b8cf-d81c67f24873';

UPDATE compliance_rules SET description = 'Verifica se as chaves DKIM utilizam pelo menos 1024 bits, conforme recomendação mínima de segurança (ideal: 2048 bits).' WHERE id = '0290d7bc-2969-47ae-9e5b-eecb79f2b00b';

UPDATE compliance_rules SET description = 'Verifica se o domínio possui mais de um seletor DKIM configurado, permitindo rotação segura de chaves.' WHERE id = 'a7716707-a1a2-49c2-b8fc-bc5eeb981d49';

UPDATE compliance_rules SET description = 'Verifica a presença de um registro DMARC (_dmarc) no DNS do domínio.' WHERE id = '58a442b3-0865-423e-8cda-b5896269f210';

UPDATE compliance_rules SET description = 'Verifica se a política DMARC (p=) está configurada como "quarantine" ou "reject" em vez de "none".' WHERE id = '8233fab1-9ceb-4690-83a7-4c5bd3c3322d';

UPDATE compliance_rules SET description = 'Verifica se o registro DMARC inclui a tag rua= com endereço para recebimento de relatórios agregados.' WHERE id = '6d7a8bb1-93e7-4f86-aeba-68af4a413024';

UPDATE compliance_rules SET description = 'Verifica se a tag pct= do DMARC está definida como 100 ou ausente, aplicando a política a todos os emails.' WHERE id = 'c3ead07a-3e85-4e47-9e2c-c2ab692eec5a';

UPDATE compliance_rules SET description = 'Verifica se a tag aspf= do DMARC está definida como "s" (strict), exigindo correspondência exata de domínio no SPF.' WHERE id = '0202fe18-0eb9-42c8-a5e6-3d7498601134';

UPDATE compliance_rules SET description = 'Verifica se a tag adkim= do DMARC está definida como "s" (strict), exigindo correspondência exata de domínio no DKIM.' WHERE id = 'bdc0b48b-e473-4f2b-8d1d-3f8f6149550b';

UPDATE compliance_rules SET description = 'Verifica a presença de um registro SPF (v=spf1) no DNS do domínio.' WHERE id = '9931ae1c-1dc4-4d04-bffe-803747319678';

UPDATE compliance_rules SET description = 'Verifica se o mecanismo final do registro SPF é "-all" (hard fail) ou "~all" (soft fail), rejeitando servidores não autorizados.' WHERE id = '09b609dc-2f4e-4c9c-8e6a-db41b73b7699';

UPDATE compliance_rules SET description = 'Verifica se o registro SPF não ultrapassa o limite de 10 lookups DNS (include, a, mx, ptr, exists, redirect).' WHERE id = '07380a15-7853-47cc-bf48-5a7f8332a58f';

UPDATE compliance_rules SET description = 'Verifica a presença de pelo menos um registro MX no DNS do domínio.' WHERE id = 'b13901b3-e3ac-4af2-bcca-8f69f00bdb0e';

UPDATE compliance_rules SET description = 'Verifica se o domínio possui pelo menos dois registros MX distintos para garantir redundância.' WHERE id = 'c4fc1e90-6c39-4254-afe8-6381a0cc1883';

UPDATE compliance_rules SET description = 'Verifica se os registros MX utilizam valores de prioridade distintos para ordenação correta de failover.' WHERE id = '42c73a39-4bd7-4653-bb03-0acb051db7f9';

UPDATE compliance_rules SET description = 'Verifica se todos os registros MX apontam para hostnames (FQDN) e não para endereços IP, conforme RFC 2181.' WHERE id = 'c5fff6e8-772e-4575-bee2-7f99a38780e7';

UPDATE compliance_rules SET description = 'Verifica se o campo RNAME do registro SOA contém um email de contato administrativo válido.' WHERE id = '870b6d7d-b1de-4efc-a6fc-92c181992164';

UPDATE compliance_rules SET description = 'Verifica se o domínio possui DNSSEC habilitado com registros RRSIG válidos.' WHERE id = '25ebcbd2-2b6c-428c-9779-6434bc5a6169';

UPDATE compliance_rules SET description = 'Verifica se o registro DS (Delegation Signer) está publicado na zona pai, completando a cadeia de confiança DNSSEC.' WHERE id = 'd8da829f-432b-41d0-a858-8b067d8f44a7';

UPDATE compliance_rules SET description = 'Verifica se o domínio possui pelo menos dois nameservers (NS) distintos configurados.' WHERE id = '33751090-f945-4386-9659-4f261765516f';

UPDATE compliance_rules SET description = 'Verifica se o domínio possui três ou mais nameservers para maior resiliência contra falhas.' WHERE id = '182b91be-0b3c-48ef-9be8-ee5d3ee33759';

UPDATE compliance_rules SET description = 'Verifica se o serial number do registro SOA segue formato válido e indica atualização recente da zona DNS.' WHERE id = 'b853e270-e5c3-4059-b78f-1bf332eff459';

UPDATE compliance_rules SET description = 'Verifica se o intervalo de refresh do registro SOA está entre 3600 e 86400 segundos (1h a 24h).' WHERE id = '722d186e-8694-475e-9de3-b74e55af4430';

-- =============================================
-- FortiGate (30 regras — apenas FortiGate IDs)
-- =============================================

UPDATE compliance_rules SET description = 'Verifica se os servidores LDAP utilizam conexão criptografada via LDAPS (porta 636) ou STARTTLS.' WHERE id = '5ebe47d4-33ef-43d0-b5a9-b33d8a4e3c17';

UPDATE compliance_rules SET description = 'Verifica se há servidores RADIUS secundários configurados e se os timeouts estão dentro de valores adequados.' WHERE id = '6917ca51-767d-4ff1-b5fd-53daa56a7aa9';

UPDATE compliance_rules SET description = 'Verifica se há pelo menos um agente FSSO (Fortinet SSO) configurado para autenticação transparente via Active Directory.' WHERE id = '8343ddcb-f19f-436f-8d3d-f64c7ec7fda8';

UPDATE compliance_rules SET description = 'Verifica se há um provedor de identidade SAML configurado para Single Sign-On com IdP corporativo.' WHERE id = 'd767d35d-ea78-40ab-8269-f6bd25c8275b';

UPDATE compliance_rules SET description = 'Verifica se existe um automation stitch configurado para realizar backup automático da configuração do firewall.' WHERE id = '3da2f9fd-44f8-40ae-b9af-6cb7e59fabea';

UPDATE compliance_rules SET description = 'Verifica se a versão do firmware FortiOS instalada corresponde a uma versão estável e recomendada pela Fortinet.' WHERE id = '97b7ec01-8d8f-4f3a-b8e1-5c3d1e7f9a2b';

UPDATE compliance_rules SET description = 'Verifica se o firewall está operando em cluster de alta disponibilidade (ativo-passivo ou ativo-ativo).' WHERE id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

UPDATE compliance_rules SET description = 'Verifica se a opção de sincronização de sessões entre membros do cluster HA está habilitada.' WHERE id = 'b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e';

UPDATE compliance_rules SET description = 'Verifica se o cluster HA possui duas ou mais interfaces de heartbeat configuradas para evitar split-brain.' WHERE id = 'c3d4e5f6-a7b8-6c7d-0e1f-2a3b4c5d6e7f';

UPDATE compliance_rules SET description = 'Verifica se as regras de firewall de entrada (WAN para LAN) possuem restrição de IP de origem definida.' WHERE id = 'd4e5f6a7-b8c9-7d8e-1f2a-3b4c5d6e7f8a';

UPDATE compliance_rules SET description = 'Verifica se nenhuma regra de firewall permite acesso RDP (porta 3389/TCP) a partir da internet.' WHERE id = 'e5f6a7b8-c9d0-8e9f-2a3b-4c5d6e7f8a9b';

UPDATE compliance_rules SET description = 'Verifica se nenhuma regra de firewall permite acesso SMB/CIFS (portas 445 e 139) a partir da internet.' WHERE id = 'f6a7b8c9-d0e1-9f0a-3b4c-5d6e7f8a9b0c';

UPDATE compliance_rules SET description = 'Verifica se o protocolo HTTP (não criptografado) está desabilitado nas interfaces WAN do firewall.' WHERE id = 'a7b8c9d0-e1f2-0a1b-4c5d-6e7f8a9b0c1d';

UPDATE compliance_rules SET description = 'Verifica se o acesso administrativo via HTTPS está desabilitado ou restrito nas interfaces WAN.' WHERE id = 'b8c9d0e1-f2a3-1b2c-5d6e-7f8a9b0c1d2e';

UPDATE compliance_rules SET description = 'Verifica se o acesso SSH está desabilitado ou restrito nas interfaces WAN do firewall.' WHERE id = 'c9d0e1f2-a3b4-2c3d-6e7f-8a9b0c1d2e3f';

UPDATE compliance_rules SET description = 'Verifica se o serviço SNMP está desabilitado nas interfaces WAN do firewall.' WHERE id = 'd0e1f2a3-b4c5-3d4e-7f8a-9b0c1d2e3f4a';

UPDATE compliance_rules SET description = 'Verifica se respostas a ICMP Ping estão desabilitadas nas interfaces WAN do firewall.' WHERE id = 'e1f2a3b4-c5d6-4e5f-8a9b-0c1d2e3f4a5b';

UPDATE compliance_rules SET description = 'Verifica se o contrato de suporte FortiCare está vigente e com data de expiração futura.' WHERE id = 'f2a3b4c5-d6e7-5f6a-9b0c-1d2e3f4a5b6c';

UPDATE compliance_rules SET description = 'Verifica se todas as licenças de serviços FortiGuard (AV, IPS, Web Filter, etc.) estão ativas e atualizando assinaturas.' WHERE id = 'a3b4c5d6-e7f8-6a7b-0c1d-2e3f4a5b6c7d';

UPDATE compliance_rules SET description = 'Verifica se o logging de tráfego e eventos de segurança está habilitado no firewall.' WHERE id = 'b4c5d6e7-f8a9-7b8c-1d2e-3f4a5b6c7d8e';

UPDATE compliance_rules SET description = 'Verifica se os logs estão sendo enviados para um servidor externo (Syslog, FortiAnalyzer ou SIEM).' WHERE id = 'c5d6e7f8-a9b0-8c9d-2e3f-4a5b6c7d8e9f';

UPDATE compliance_rules SET description = 'Verifica se existem regras de firewall com origem, destino e serviço configurados como "any" (totalmente permissivas).' WHERE id = 'd6e7f8a9-b0c1-9d0e-3f4a-5b6c7d8e9f0a';

UPDATE compliance_rules SET description = 'Verifica se a opção "strong-crypto" está habilitada globalmente, restringindo o uso a cifras e protocolos TLS seguros.' WHERE id = 'e7f8a9b0-c1d2-0e1f-4a5b-6c7d8e9f0a1b';

UPDATE compliance_rules SET description = 'Verifica se as contas de administrador do firewall possuem autenticação de dois fatores (2FA) habilitada.' WHERE id = 'f8a9b0c1-d2e3-1f2a-5b6c-7d8e9f0a1b2c';

UPDATE compliance_rules SET description = 'Verifica se o timeout de inatividade da sessão administrativa está configurado com valor igual ou inferior a 15 minutos.' WHERE id = 'a9b0c1d2-e3f4-2a3b-6c7d-8e9f0a1b2c3d';

UPDATE compliance_rules SET description = 'Verifica se as políticas de entrada (inbound) possuem um perfil IPS/IDS aplicado para detecção de intrusões.' WHERE id = 'b0c1d2e3-f4a5-3b4c-7d8e-9f0a1b2c3d4e';

UPDATE compliance_rules SET description = 'Verifica se as políticas de saída (outbound) possuem um perfil de Web Filter aplicado para filtragem de conteúdo.' WHERE id = 'c1d2e3f4-a5b6-4c5d-8e9f-0a1b2c3d4e5f';

UPDATE compliance_rules SET description = 'Verifica se as políticas de saída (outbound) possuem um perfil de Application Control aplicado.' WHERE id = 'd2e3f4a5-b6c7-5d6e-9f0a-1b2c3d4e5f6a';

UPDATE compliance_rules SET description = 'Verifica se as políticas de tráfego possuem um perfil de antivírus aplicado para inspeção no perímetro.' WHERE id = 'e3f4a5b6-c7d8-6e7f-0a1b-2c3d4e5f6a7b';

UPDATE compliance_rules SET description = 'Verifica se os túneis VPN IPsec utilizam algoritmos de criptografia fortes (AES-256) e hashing seguro (SHA-256 ou superior).' WHERE id = 'f4a5b6c7-d8e9-7f8a-1b2c-3d4e5f6a7b8c';

UPDATE compliance_rules SET description = 'Verifica se a VPN SSL está configurada para aceitar apenas conexões TLS 1.2 ou superior.' WHERE id = 'a5b6c7d8-e9f0-8a9b-2c3d-4e5f6a7b8c9d';
