
-- Delete existing CVE cache entries that reference old sources
DELETE FROM cve_cache;

-- Delete old monolithic sources
DELETE FROM cve_sources;

-- Insert granular per-product sources
INSERT INTO cve_sources (module_code, source_type, source_label, config, is_active) VALUES
  ('firewall', 'nist_nvd', 'FortiGate', '{"vendor": "fortinet", "months": 6}', true),
  ('firewall', 'nist_nvd', 'SonicWall', '{"vendor": "sonicwall", "months": 6}', true),
  ('m365', 'msrc', 'Microsoft 365', '{"months": 3}', true),
  ('external_domain', 'nist_nvd_web', 'Nginx', '{"product_filter": "nginx"}', true),
  ('external_domain', 'nist_nvd_web', 'Apache HTTP Server', '{"product_filter": "http_server"}', true),
  ('external_domain', 'nist_nvd_web', 'OpenSSH', '{"product_filter": "openssh"}', true);
