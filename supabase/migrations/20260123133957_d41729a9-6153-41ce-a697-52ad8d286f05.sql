-- Populate modules table with the 4 initial modules
INSERT INTO modules (code, name, description, icon, is_active) VALUES
  ('scope_firewall', 'Firewall', 'Análise e gestão de firewalls FortiGate', 'Shield', true),
  ('scope_m365', 'Microsoft 365', 'Gestão e monitoramento de tenants Microsoft 365', 'Cloud', true),
  ('scope_network', 'Network', 'Monitoramento e análise de rede', 'Network', true),
  ('scope_cloud', 'Cloud', 'Gestão de infraestrutura cloud', 'Server', true)
ON CONFLICT (code) DO NOTHING;

-- Add permission column to user_modules table
ALTER TABLE user_modules 
ADD COLUMN IF NOT EXISTS permission TEXT NOT NULL DEFAULT 'view' 
CHECK (permission IN ('view', 'edit'));