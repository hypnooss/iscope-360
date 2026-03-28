import { Eye, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreview } from '@/contexts/PreviewContext';
import { useEffect, useState } from 'react';

export function PreviewBanner() {
  const { isPreviewMode, previewTarget, previewStartedAt, stopPreview } = usePreview();
  const [elapsedTime, setElapsedTime] = useState('');

  // Update elapsed time every minute
  useEffect(() => {
    if (!previewStartedAt) return;

    const updateElapsed = () => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - previewStartedAt.getTime()) / 1000);
      
      if (diff < 60) {
        setElapsedTime('agora');
      } else if (diff < 3600) {
        const mins = Math.floor(diff / 60);
        setElapsedTime(`há ${mins} min`);
      } else {
        const hours = Math.floor(diff / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        setElapsedTime(`há ${hours}h ${mins}min`);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 60000);
    return () => clearInterval(interval);
  }, [previewStartedAt]);

  if (!isPreviewMode || !previewTarget) {
    return null;
  }

  return (
    <div className="bg-warning text-warning-foreground py-2 px-4 flex items-center justify-between gap-4 z-50">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Eye className="w-5 h-5 flex-shrink-0" />
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-medium whitespace-nowrap">
            Visualizando como
          </span>
          <span className="font-bold truncate">
            {previewTarget.profile.full_name || previewTarget.profile.email}
          </span>
          <span className="opacity-80 hidden sm:inline">
            ({previewTarget.profile.email})
          </span>
          <span className="bg-warning-foreground/20 text-warning-foreground px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap">
            Modo Leitura
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-3 flex-shrink-0">
        {elapsedTime && (
          <div className="hidden md:flex items-center gap-1 text-sm opacity-80">
            <Clock className="w-4 h-4" />
            <span>{elapsedTime}</span>
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={stopPreview}
          className="bg-background text-foreground border-border hover:bg-secondary"
        >
          <X className="w-4 h-4 mr-1" />
          Encerrar
        </Button>
      </div>
    </div>
  );
}
