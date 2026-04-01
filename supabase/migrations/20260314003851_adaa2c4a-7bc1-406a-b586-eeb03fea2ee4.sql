UPDATE m365_tenants SET spo_domain = CASE
  WHEN tenant_domain = 'TASCHIBRA.mail.onmicrosoft.com' THEN 'TASCHIBRA'
  WHEN tenant_domain = 'aggroupbr.onmicrosoft.com' THEN 'aggroupbr'
  WHEN tenant_domain = 'iedomadeira.onmicrosoft.com' THEN 'iedomadeira'
  WHEN tenant_domain = 'deployitgroup.mail.onmicrosoft.com' THEN 'deployitgroup'
  WHEN tenant_domain = 'brinquedosestrela.onmicrosoft.com' THEN 'brinquedosestrela'
  WHEN tenant_domain = 'localfriologistica.onmicrosoft.com' THEN 'localfriologistica'
  WHEN tenant_domain = 'ourosafra.onmicrosoft.com' THEN 'ourosafra'
END
WHERE spo_domain IS NULL;