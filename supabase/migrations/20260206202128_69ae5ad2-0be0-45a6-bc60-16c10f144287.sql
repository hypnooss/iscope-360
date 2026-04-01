UPDATE compliance_rules SET 
  business_impact = 'Split-brain causa queda total da rede: ambos os firewalls respondem pelo mesmo IP, corrompendo tabelas ARP, derrubando sessões ativas e potencialmente causando loops de roteamento. Recuperação exige intervenção manual imediata.'
WHERE code = 'ha-003' AND device_type_id = 'c2d829a3-4f86-49cd-851f-fa3f10c4fcf6';