export interface ModuleDashboardConfig {
  /** Key used in the stats Record (e.g. "firewall", "m365") */
  statsKey: string;
  /** Main route for the module */
  path: string;
  /** Label shown in the infrastructure card (e.g. "Firewalls", "Tenants M365") */
  infraLabel: string;
  /** Route to CVE page (undefined = module has no CVEs) */
  cvePath?: string;
}

export const MODULE_DASHBOARD_CONFIG: Record<string, ModuleDashboardConfig> = {
  scope_firewall: {
    statsKey: 'firewall',
    path: '/scope-firewall/dashboard',
    infraLabel: 'Firewalls',
    cvePath: '/scope-firewall/cves',
  },
  scope_m365: {
    statsKey: 'm365',
    path: '/scope-m365/compliance',
    infraLabel: 'Tenants M365',
    cvePath: '/scope-m365/cves',
  },
  scope_external_domain: {
    statsKey: 'externalDomain',
    path: '/environment',
    infraLabel: 'Domínios',
    cvePath: '/scope-external-domain/analyzer',
  },
  scope_network: {
    statsKey: 'network',
    path: '/scope-network/dashboard',
    infraLabel: 'Network',
  },
  scope_cloud: {
    statsKey: 'cloud',
    path: '/scope-cloud/dashboard',
    infraLabel: 'Cloud',
  },
};
