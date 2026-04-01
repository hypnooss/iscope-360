INSERT INTO cve_sources (module_code, source_type, source_label, config, is_active) VALUES
  ('external_domain', 'nist_nvd_web', 'PHP', '{"product_filter": "php"}', true),
  ('external_domain', 'nist_nvd_web', 'OpenSSL', '{"product_filter": "openssl"}', true),
  ('external_domain', 'nist_nvd_web', 'jQuery', '{"product_filter": "jquery"}', true),
  ('external_domain', 'nist_nvd_web', 'Node.js', '{"product_filter": "node.js"}', true);