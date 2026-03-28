export type AppRole = 'super_admin' | 'super_suporte' | 'workspace_admin' | 'user';

export type ModulePermission = 'view' | 'edit' | 'full' | 'none';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone?: string;
}

export interface User {
  id: string;
  email?: string;
}

export interface Session {
  user: User;
  access_token: string;
}

export interface ModulePermissions {
  dashboard: ModulePermission;
  firewall: ModulePermission;
  reports: ModulePermission;
  users: ModulePermission;
  external_domain: ModulePermission;
}
