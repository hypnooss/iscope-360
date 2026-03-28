import { useModules, UserModuleAccess, Module } from '@/contexts/ModuleContext';

export interface EffectiveModulesResult {
  realUserModules: UserModuleAccess[];
  effectiveUserModules: UserModuleAccess[];
  allActiveModules: Module[];
  hasEffectiveModuleAccess: (moduleCode: string) => boolean;
  isPreviewMode: boolean;
}

export function useEffectiveModules(): EffectiveModulesResult {
  const { userModules, modules } = useModules();
  
  const hasEffectiveModuleAccess = (moduleCode: string): boolean => {
    return userModules.some(
      m => m.module.code === moduleCode && m.permission !== 'none'
    );
  };
    
  return {
    realUserModules: userModules,
    effectiveUserModules: userModules,
    allActiveModules: modules,
    hasEffectiveModuleAccess,
    isPreviewMode: false,
  };
}
