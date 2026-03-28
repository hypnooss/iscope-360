import { useModules, Module, UserModuleAccess, ModulePermissionLevel } from '@/contexts/ModuleContext';
import { usePreview, PreviewModuleAccess } from '@/contexts/PreviewContext';

export interface EffectiveModulesResult {
  // Real admin's modules
  realUserModules: UserModuleAccess[];
  
  // Effective modules (preview target when in preview mode, otherwise real)
  effectiveUserModules: UserModuleAccess[];
  
  // All active modules in the system (regardless of user access)
  allActiveModules: Module[];
  
  // Helper function to check module access with effective permissions
  hasEffectiveModuleAccess: (moduleCode: string) => boolean;
  
  // Flag
  isPreviewMode: boolean;
}

/**
 * Hook that combines ModuleContext and PreviewContext to provide "effective" module access.
 * When in preview mode, returns the preview target's modules.
 * When not in preview mode, returns the real user's modules.
 */
export function useEffectiveModules(): EffectiveModulesResult {
  const { userModules, modules } = useModules();
  const { isPreviewMode, previewTarget } = usePreview();
  
  // Convert PreviewModuleAccess to UserModuleAccess format
  const convertModules = (previewModules: PreviewModuleAccess[]): UserModuleAccess[] => {
    return previewModules.map(pm => ({
      module: {
        id: pm.module.id,
        code: pm.module.code,
        name: pm.module.name,
        description: pm.module.description,
        icon: pm.module.icon,
        color: pm.module.color,
      } as Module,
      permission: pm.permission as ModulePermissionLevel,
    }));
  };
  
  const effectiveUserModules = isPreviewMode && previewTarget?.modules
    ? convertModules(previewTarget.modules)
    : userModules;
    
  const hasEffectiveModuleAccess = (moduleCode: string): boolean => {
    return effectiveUserModules.some(
      m => m.module.code === moduleCode && m.permission !== 'none'
    );
  };
    
  return {
    realUserModules: userModules,
    effectiveUserModules,
    allActiveModules: modules,
    hasEffectiveModuleAccess,
    isPreviewMode,
  };
}
