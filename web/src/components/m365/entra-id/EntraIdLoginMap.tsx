import { useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { EntraIdCountryMap } from './EntraIdCountryMap';
import { getCountryCode } from '@/lib/countryUtils';
import { DataSourceDot } from '@/components/m365/shared';
import 'flag-icons/css/flag-icons.min.css';

interface EntraIdLoginMapProps {
  loginCountriesSuccess: { country: string; count: number }[];
  loginCountriesFailed?: { country: string; count: number }[];
}

export function EntraIdLoginMap({ loginCountriesSuccess }: EntraIdLoginMapProps) {
  const [fullscreen, setFullscreen] = useState(false);

  if (loginCountriesSuccess.length === 0) return null;

  const totalSuccess = loginCountriesSuccess.reduce((s, c) => s + c.count, 0);
  const top5 = [...loginCountriesSuccess].sort((a, b) => b.count - a.count).slice(0, 5);

  return (
    <>
      {!fullscreen && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Mapa de Conexões
              </h2>
              <DataSourceDot source="aggregated" />
            </div>
            <button
              onClick={() => setFullscreen(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Tela cheia
            </button>
          </div>

          <div
            className="max-h-[200px] overflow-hidden rounded-lg border border-border/50 cursor-pointer"
            onClick={() => setFullscreen(true)}
          >
            <EntraIdCountryMap loginCountriesSuccess={loginCountriesSuccess} />
          </div>

          <div className="flex items-center gap-4 justify-center mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block bg-primary" />
              Login com Sucesso ({totalSuccess.toLocaleString()})
            </div>
          </div>
        </div>
      )}

      {fullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#222222' }}>
          <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-black/40 backdrop-blur-md">
            <h1 className="text-white text-base font-semibold">
              Entra ID — Origens de Login
            </h1>
            <button
              onClick={() => setFullscreen(false)}
              className="h-8 w-8 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 relative min-h-0">
            <EntraIdCountryMap loginCountriesSuccess={loginCountriesSuccess} fullscreen />

            {/* Right panel - Country ranking */}
            <div className="absolute top-4 right-4 z-[1000] w-60 max-h-[calc(100%-2rem)] overflow-y-auto bg-black/70 backdrop-blur-md rounded-lg border border-white/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
                <h3 className="text-white/90 text-xs font-semibold uppercase tracking-wider">Login com Sucesso</h3>
                <span className="text-white/40 text-xs font-mono ml-auto">{totalSuccess.toLocaleString()}</span>
              </div>
              <div className="space-y-1.5">
                {top5.map((c, i) => {
                  const raw = c.country?.trim().toLowerCase();
                  const code = raw && raw.length === 2 ? raw : getCountryCode(c.country);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-white/40 text-xs font-bold w-4">{i + 1}</span>
                      {code && <span className={`fi fi-${code} text-sm`} />}
                      <span className="text-white/80 text-xs flex-1 truncate">{c.country}</span>
                      <span className="text-white/60 text-xs font-mono">{c.count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 justify-center p-3 border-t border-border text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block bg-primary" />
              Login com Sucesso ({totalSuccess.toLocaleString()})
            </div>
          </div>
        </div>
      )}
    </>
  );
}
