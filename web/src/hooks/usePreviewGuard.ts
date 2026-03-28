import { useCallback } from 'react';
import { usePreview } from '@/contexts/PreviewContext';
import { toast } from 'sonner';

interface UsePreviewGuardReturn {
  /** Whether actions are blocked due to preview mode */
  isBlocked: boolean;
  /** Show a toast message explaining why the action is blocked */
  showBlockedMessage: () => void;
  /** Returns true if preview mode is active */
  isPreviewMode: boolean;
  /** The current mode (preview or impersonate - for future use) */
  mode: 'preview' | 'impersonate';
}

/**
 * Hook to guard actions in preview mode.
 * 
 * In preview mode (read-only), all mutating actions should be blocked.
 * In future impersonate mode, actions will be allowed.
 * 
 * @example
 * ```tsx
 * const { isBlocked, showBlockedMessage } = usePreviewGuard();
 * 
 * <Button 
 *   disabled={isBlocked} 
 *   onClick={isBlocked ? showBlockedMessage : handleAction}
 * >
 *   {isBlocked && <Lock className="w-4 h-4 mr-2" />}
 *   Criar Novo
 * </Button>
 * ```
 */
export function usePreviewGuard(): UsePreviewGuardReturn {
  const { isPreviewMode, mode } = usePreview();

  // In preview mode, block actions. In future impersonate mode, allow them.
  const isBlocked = isPreviewMode && mode === 'preview';

  const showBlockedMessage = useCallback(() => {
    toast.warning('Ação bloqueada no modo de visualização', {
      description: 'Você está visualizando o sistema como outro usuário. Todas as ações estão desabilitadas.',
    });
  }, []);

  return {
    isBlocked,
    showBlockedMessage,
    isPreviewMode,
    mode,
  };
}
