-- FortiGate: Interfaces adicionais
UPDATE compliance_rules SET 
  technical_risk = 'SSH exposto em interfaces externas permite ataques de força bruta contra a autenticação do firewall.',
  business_impact = 'Atacantes podem tentar comprometer o acesso administrativo via SSH exposto à internet.',
  api_endpoint = '/api/v2/cmdb/system/interface'
WHERE code = 'int-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'SNMP em interfaces externas pode expor informações de configuração e permitir ataques de enumeração.',
  business_impact = 'Informações sensíveis sobre a infraestrutura podem ser obtidas por atacantes externos.',
  api_endpoint = '/api/v2/cmdb/system/interface'
WHERE code = 'int-004' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

UPDATE compliance_rules SET 
  technical_risk = 'ICMP Ping habilitado em interfaces externas permite descoberta e fingerprinting do firewall.',
  business_impact = 'Atacantes podem identificar a presença e tipo do firewall para planejar ataques direcionados.',
  api_endpoint = '/api/v2/cmdb/system/interface'
WHERE code = 'int-005' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';

-- SonicWall: Interfaces adicionais
UPDATE compliance_rules SET 
  technical_risk = 'SSH exposto em interfaces externas permite ataques de força bruta contra a autenticação.',
  business_impact = 'Atacantes podem tentar comprometer o acesso administrativo via SSH.',
  api_endpoint = '/api/sonicos/interfaces/ipv4'
WHERE code = 'int-003' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'SNMP em interfaces externas pode expor informações de configuração da rede.',
  business_impact = 'Informações sensíveis sobre a infraestrutura podem ser obtidas externamente.',
  api_endpoint = '/api/sonicos/interfaces/ipv4'
WHERE code = 'int-004' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';

UPDATE compliance_rules SET 
  technical_risk = 'ICMP Ping habilitado permite descoberta e fingerprinting do firewall por atacantes.',
  business_impact = 'Facilita o reconhecimento de rede por potenciais atacantes.',
  api_endpoint = '/api/sonicos/interfaces/ipv4'
WHERE code = 'int-005' AND device_type_id = '5fca6b8b-f8a5-4c20-8992-c09f023e7634';