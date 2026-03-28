import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export type ScopeModule = string;
export type ModulePermissionLevel = 'none' | 'view' | 'edit';

export interface Module {
  id: string;
  code: ScopeModule;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
}

export interface UserModuleAccess {
  module: Module;
  permission: ModulePermissionLevel;
}

interface ModuleContextType {
  modules: Module[];
  userModules: UserModuleAccess[];
  activeModule: ScopeModule | null;
  setActiveModule: (module: ScopeModule | null) => void;
  hasModuleAccess: (moduleCode: ScopeModule) => boolean;
  getModulePermission: (moduleCode: ScopeModule) => ModulePermissionLevel;
  canEditModule: (moduleCode: ScopeModule) => boolean;
  loading: boolean;
}

const ModuleContext = createContext<ModuleContextType | undefined>(undefined);

export function ModuleProvider({ children }: { children: ReactNode }) {
  const { user, authLoading } = useAuth() as any;
  const [modules] = useState<Module[]>([]);
  const [userModules] = useState<UserModuleAccess[]>([]);
  const [activeModule, setActiveModule] = useState<ScopeModule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading]);

  const hasModuleAccess = (moduleCode: ScopeModule): boolean => {
    return true; 
  };

  const getModulePermission = (moduleCode: ScopeModule): ModulePermissionLevel => {
    return 'edit'; 
  };

  const canEditModule = (moduleCode: ScopeModule): boolean => {
    return true; 
  };

  return (
    <ModuleContext.Provider
      value={{
        modules,
        userModules,
        activeModule,
        setActiveModule,
        hasModuleAccess,
        getModulePermission,
        canEditModule,
        loading,
      }}
    >
      {children}
    </ModuleContext.Provider>
  );
}

export function useModules() {
  const context = useContext(ModuleContext);
  if (context === undefined) {
    throw new Error('useModules must be used within a ModuleProvider');
  }
  return context;
}
