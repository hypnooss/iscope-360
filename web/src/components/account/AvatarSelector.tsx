import { useState, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RefreshCw, X } from 'lucide-react';

const STYLES = [
  'adventurer',
  'avataaars',
  'fun-emoji',
  'pixel-art',
  'big-ears',
  'shapes',
] as const;

const SEEDS = [
  'felix', 'aneka', 'jade', 'leo', 'mia', 'zara',
  'kira', 'sam', 'nova', 'rio', 'luna', 'kai',
  'aria', 'max', 'sky', 'neo', 'ava', 'eli',
  'finn', 'lux', 'cleo', 'ryu', 'hana', 'zen',
];

function avatarUrl(style: string, seed: string) {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;
}

interface AvatarSelectorProps {
  currentUrl: string;
  userName: string;
  onSelect: (url: string) => void;
}

export function AvatarSelector({ currentUrl, userName, onSelect }: AvatarSelectorProps) {
  const [round, setRound] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [activeStyle, setActiveStyle] = useState<string>(STYLES[0]);

  const baseName = userName || 'user';

  // Generate avatar grid for the active style tab
  const avatarOptions = useMemo(() => {
    return SEEDS.map((seed) => {
      const finalSeed = round === 0 ? `${baseName}-${seed}` : `${baseName}-${seed}-r${round}`;
      return {
        key: `${activeStyle}-${seed}-${round}`,
        url: avatarUrl(activeStyle, finalSeed),
      };
    });
  }, [baseName, round, activeStyle]);

  const displayUrl = currentUrl || avatarUrl('adventurer', baseName);

  const styleLabels: Record<string, string> = {
    'adventurer': 'Anime',
    'avataaars': 'Cartoon',
    'fun-emoji': 'Fun',
    'pixel-art': 'Pixel',
    'big-ears': 'Cute',
    'shapes': 'Shapes',
  };

  return (
    <div className="space-y-3">
      <Label>Avatar</Label>

      <div className="flex items-center gap-4">
        <div className="relative group">
          <img
            src={displayUrl}
            alt="Avatar atual"
            className="w-16 h-16 rounded-full border-2 border-primary/30 bg-muted object-cover"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Fechar galeria' : 'Escolher avatar'}
          </Button>
          {currentUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive gap-1"
              onClick={() => onSelect('')}
            >
              <X className="w-3 h-3" />
              Remover avatar
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 rounded-xl border border-border p-4 bg-card/80 backdrop-blur-sm">
          {/* Style tabs */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setActiveStyle(style)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                    activeStyle === style
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {styleLabels[style] || style}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRound((r) => r + 1)}
              className="gap-1.5 h-7 text-xs shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              Randomizar
            </Button>
          </div>

          {/* Avatar grid */}
          <div className="grid grid-cols-6 sm:grid-cols-9 gap-2">
            {avatarOptions.map(({ key, url }) => (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(url)}
                className={cn(
                  'rounded-xl border-2 p-1.5 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring',
                  currentUrl === url
                    ? 'border-primary bg-primary/10 shadow-md ring-1 ring-primary/30'
                    : 'border-transparent hover:border-border hover:shadow-sm'
                )}
              >
                <img
                  src={url}
                  alt="Avatar option"
                  className="w-full aspect-square rounded-lg bg-muted/50"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
