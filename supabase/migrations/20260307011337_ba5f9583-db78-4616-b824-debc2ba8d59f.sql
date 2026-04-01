
-- Add unique constraint on permission_name
ALTER TABLE public.m365_required_permissions ADD CONSTRAINT m365_required_permissions_permission_name_key UNIQUE (permission_name);

-- Insert missing permissions
INSERT INTO public.m365_required_permissions (permission_name, submodule, permission_type, description, is_required)
VALUES
  ('User.Read.All', 'entra_id', 'Application', 'Leitura de todos os usuários do diretório', true),
  ('Directory.Read.All', 'entra_id', 'Application', 'Leitura de dados do diretório (grupos, roles, dispositivos)', true),
  ('Group.Read.All', 'entra_id', 'Application', 'Leitura de todos os grupos do diretório', true),
  ('Application.Read.All', 'entra_id', 'Application', 'Leitura de registros de aplicativos', true),
  ('Organization.Read.All', 'entra_id', 'Application', 'Leitura de dados da organização', true),
  ('Policy.Read.All', 'entra_id', 'Application', 'Leitura de políticas do diretório (Conditional Access, MFA)', true),
  ('IdentityRiskyUser.Read.All', 'entra_id', 'Application', 'Leitura de usuários com risco de identidade', true),
  ('IdentityRiskEvent.Read.All', 'entra_id', 'Application', 'Leitura de eventos de risco de identidade', true),
  ('MailboxSettings.Read', 'exchange', 'Application', 'Leitura de configurações de caixa de correio', true),
  ('Mail.Read', 'exchange', 'Application', 'Leitura de e-mails (regras de transporte)', true),
  ('Sites.Read.All', 'sharepoint', 'Application', 'Leitura de sites SharePoint', true),
  ('Reports.Read.All', 'entra_id', 'Application', 'Leitura de relatórios de uso do Microsoft 365', true),
  ('ServiceHealth.Read.All', 'entra_id', 'Application', 'Leitura do status de saúde dos serviços Microsoft 365', true),
  ('Application.ReadWrite.All', 'entra_id', 'Application', 'Leitura e escrita de registros de aplicativos (certificados)', false),
  ('Exchange.ManageAsApp', 'exchange', 'Application', 'Gerenciamento do Exchange Online via API', true),
  ('Sites.FullControl.All', 'sharepoint', 'Application', 'Controle total de sites SharePoint', false)
ON CONFLICT (permission_name) DO NOTHING;
