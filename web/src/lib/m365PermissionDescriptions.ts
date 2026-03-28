export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  // Entra ID
  'User.Read.All': 'Leitura de perfis de usuários',
  'Directory.Read.All': 'Leitura de diretório e usuários',
  'Group.Read.All': 'Leitura de grupos e membros',
  'Application.Read.All': 'Leitura de aplicativos registrados',
  'AuditLog.Read.All': 'Leitura de logs de auditoria',
  'Organization.Read.All': 'Leitura de dados da organização',
  'Policy.Read.All': 'Leitura de políticas de segurança',
  'IdentityRiskyUser.Read.All': 'Leitura de usuários de risco (Identity Protection)',
  'IdentityRiskEvent.Read.All': 'Leitura de detecções de risco (Identity Protection)',
  'Domain.Read.All': 'Leitura de domínios verificados',
  // Intune / Device Management
  'DeviceManagementManagedDevices.Read.All': 'Leitura de dispositivos gerenciados (Intune)',
  'DeviceManagementConfiguration.Read.All': 'Leitura de políticas de dispositivos (Intune)',
  // Security / Defender
  'SecurityAlert.Read.All': 'Leitura de alertas de segurança (Defender)',
  'SecurityEvents.Read.All': 'Leitura de eventos de segurança',
  'SecurityIncident.Read.All': 'Leitura de incidentes de segurança (Defender)',
  'AttackSimulation.Read.All': 'Leitura de simulações de phishing (Defender)',
  'InformationProtectionPolicy.Read.All': 'Leitura de labels de proteção de informação (Purview)',
  // Exchange Online
  'MailboxSettings.Read': 'Leitura de configurações de caixa de correio',
  'Mail.Read': 'Leitura de configurações de e-mail',
  'RoleManagement.ReadWrite.Directory': 'Gestão de roles do diretório',
  // SharePoint
  'Sites.Read.All': 'Leitura de sites do SharePoint',
  'SharePointTenantSettings.Read.All': 'Leitura de configurações do admin SharePoint',
  // Teams
  'TeamSettings.Read.All': 'Leitura de configurações de Teams',
  'Channel.ReadBasic.All': 'Leitura de canais de Teams',
  'TeamMember.Read.All': 'Leitura de membros de Teams',
  // Certificados
  'Application.ReadWrite.All': 'Gestão de certificados e credenciais',
  // Outros
  'Reports.Read.All': 'Leitura de relatórios de uso',
  'ServiceHealth.Read.All': 'Leitura da integridade dos serviços Microsoft 365',
  // Directory Roles
  'Exchange Administrator': 'Administração do Exchange Online',
  'SharePoint Administrator': 'Administração do SharePoint Online',
};

export const GRAPH_PERMISSIONS = [
  'User.Read.All', 'Directory.Read.All', 'Group.Read.All',
  'Application.Read.All', 'AuditLog.Read.All', 'Organization.Read.All',
  'Policy.Read.All', 'IdentityRiskyUser.Read.All', 'IdentityRiskEvent.Read.All', 'Domain.Read.All',
  'MailboxSettings.Read', 'Mail.Read',
  'RoleManagement.ReadWrite.Directory', 'Sites.Read.All',
  'Application.ReadWrite.All', 'Reports.Read.All', 'ServiceHealth.Read.All',
  'DeviceManagementManagedDevices.Read.All', 'DeviceManagementConfiguration.Read.All',
  'SecurityAlert.Read.All', 'SecurityEvents.Read.All',
  'SecurityIncident.Read.All', 'AttackSimulation.Read.All',
  'InformationProtectionPolicy.Read.All',
  'TeamSettings.Read.All', 'Channel.ReadBasic.All', 'TeamMember.Read.All',
  'SharePointTenantSettings.Read.All',
];

export const DIRECTORY_ROLES = [
  'Exchange Administrator',
  'SharePoint Administrator',
];
