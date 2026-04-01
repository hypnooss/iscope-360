
ALTER TABLE public.external_domains ADD COLUMN IF NOT EXISTS whois_registrar text;
ALTER TABLE public.external_domains ADD COLUMN IF NOT EXISTS whois_expires_at timestamptz;
ALTER TABLE public.external_domains ADD COLUMN IF NOT EXISTS whois_created_at timestamptz;
ALTER TABLE public.external_domains ADD COLUMN IF NOT EXISTS whois_checked_at timestamptz;
