-- Insert CVE source for React
INSERT INTO public.cve_sources (module_code, source_type, source_label, config, is_active)
VALUES ('external_domain', 'nist_nvd_web', 'React', '{"product_filter": "react", "vendor_filter": "facebook"}', true);

-- Insert CVE source for Next.js
INSERT INTO public.cve_sources (module_code, source_type, source_label, config, is_active)
VALUES ('external_domain', 'nist_nvd_web', 'Next.js', '{"product_filter": "next.js", "vendor_filter": "vercel"}', true);