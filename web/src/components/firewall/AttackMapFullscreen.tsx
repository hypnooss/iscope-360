import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AttackMap } from './AttackMap';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { getCountryCode } from '@/lib/countryUtils';
import type { TopCountry, TopBlockedIP } from '@/types/analyzerInsights';
import 'flag-icons/css/flag-icons.min.css';

interface LabelMap {
  authFailed?: string;
  authFailedVpn?: string;
  authSuccess?: string;
  authSuccessVpn?: string;
  outbound?: string;
  outboundBlocked?: string;
  centerPoint?: string;
}

const DEFAULT_LABELS: Required<LabelMap> = {
  authFailed: 'Falha Auth FW',
  authFailedVpn: 'Falha Auth VPN',
  authSuccess: 'Sucesso Auth FW',
  authSuccessVpn: 'Sucesso Auth VPN',
  outbound: 'Saída Permitida',
  outboundBlocked: 'Saída Bloqueada',
  centerPoint: 'Firewall',
};

interface AttackMapFullscreenProps {
  authFailedCountries: TopCountry[];
  authFailedVpnCountries?: TopCountry[];
  authSuccessCountries: TopCountry[];
  authSuccessVpnCountries?: TopCountry[];
  outboundCountries?: TopCountry[];
  outboundBlockedCountries?: TopCountry[];
  firewallLocation?: { lat: number; lng: number; label: string };
  firewallName?: string;
  lastAnalysis?: string;
  totalFwAuthFailed?: number;
  totalVpnAuthFailed?: number;
  totalFwAuthSuccess?: number;
  totalVpnAuthSuccess?: number;
  totalOutbound?: number;
  totalOutboundBlocked?: number;
  topBlockedIPs?: TopBlockedIP[];
  topOutboundCountries?: TopCountry[];
  topOutboundBlockedCountries?: TopCountry[];
  labelMap?: LabelMap;
  onClose: () => void;
}

export function AttackMapFullscreen({
  authFailedCountries,
  authFailedVpnCountries = [],
  authSuccessCountries,
  authSuccessVpnCountries = [],
  outboundCountries = [],
  outboundBlockedCountries = [],
  firewallLocation,
  firewallName,
  lastAnalysis,
  totalFwAuthFailed = 0,
  totalVpnAuthFailed = 0,
  totalFwAuthSuccess = 0,
  totalVpnAuthSuccess = 0,
  totalOutbound = 0,
  totalOutboundBlocked = 0,
  topBlockedIPs = [],
  topOutboundCountries = [],
  topOutboundBlockedCountries = [],
  labelMap: labelMapProp,
  onClose,
}: AttackMapFullscreenProps) {
  const L = { ...DEFAULT_LABELS, ...labelMapProp };
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Helper: compute private IP count for a category
  const privateCount = (total: number, countries: TopCountry[]) => {
    const geoSum = countries.reduce((s, c) => s + c.count, 0);
    return total > geoSum ? total - geoSum : 0;
  };

  // Build sections config
  const sections = [
    { label: L.authFailed, color: '#dc2626', countries: authFailedCountries, total: totalFwAuthFailed, showPrivate: true },
    { label: L.authFailedVpn, color: '#f97316', countries: authFailedVpnCountries, total: totalVpnAuthFailed, showPrivate: true },
    { label: L.authSuccess, color: '#22c55e', countries: authSuccessCountries, total: totalFwAuthSuccess, showPrivate: true },
    { label: L.authSuccessVpn, color: '#22c55e', countries: authSuccessVpnCountries, total: totalVpnAuthSuccess, showPrivate: true },
    { label: L.outbound, color: '#38bdf8', countries: topOutboundCountries, total: totalOutbound, showPrivate: false },
    { label: L.outboundBlocked, color: '#ef4444', countries: topOutboundBlockedCountries, total: totalOutboundBlocked, showPrivate: false },
  ].filter(s => s.total > 0);

  return createPortal(
    <div className="fixed inset-0 z-[9999] animate-fade-in flex flex-col" style={{ background: '#222222' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <h1 className="text-white text-base font-semibold">Firewall — Mapa de Conexões</h1>
          {firewallName && (
            <span className="text-white/50 text-sm">•</span>
          )}
          {firewallName && (
            <span className="text-white/70 text-sm">{firewallName}</span>
          )}
          {lastAnalysis && (
            <span className="text-white/40 text-xs">
              {new Date(lastAnalysis).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white/60 hover:text-white hover:bg-white/10 h-8 w-8"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Map */}
      <div className="flex-1 w-full min-h-0">
        <AttackMap
          authFailedCountries={authFailedCountries}
          authFailedVpnCountries={authFailedVpnCountries}
          authSuccessCountries={authSuccessCountries}
          authSuccessVpnCountries={authSuccessVpnCountries}
          outboundCountries={outboundCountries}
          outboundBlockedCountries={outboundBlockedCountries}
          firewallLocation={firewallLocation}
          fullscreen={true}
          labelMap={labelMapProp}
        />
      </div>

      {/* Right panel - Per-category rankings */}
      <div className="absolute top-20 right-4 z-[1000] w-60 max-h-[calc(100vh-160px)] overflow-y-auto bg-black/70 backdrop-blur-md rounded-lg border border-white/10 p-4 space-y-3">
        {sections.map((section, si) => {
          const top5 = section.countries.slice(0, 5);
          const priv = section.showPrivate ? privateCount(section.total, section.countries) : 0;
          return (
            <div key={si}>
              {si > 0 && <div className="border-t border-white/10 mb-3" />}
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: section.color, boxShadow: `0 0 6px ${section.color}80` }} />
                <h3 className="text-white/90 text-xs font-semibold uppercase tracking-wider">{section.label}</h3>
                <span className="text-white/40 text-xs font-mono ml-auto">{section.total.toLocaleString()}</span>
              </div>
              {top5.length > 0 ? (
                <div className="space-y-1.5">
                  {top5.map((c, i) => {
                    const code = getCountryCode(c.country);
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
              ) : (
                <p className="text-white/30 text-xs italic">Sem dados geolocalizados</p>
              )}
              {priv > 0 && (
                <p className="text-white/40 text-xs mt-1.5">* {priv.toLocaleString()} de IPs privados</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom stats bar */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-black/70 backdrop-blur-md border-t border-white/10 px-6 py-3">
        <div className="flex items-center justify-center gap-6 flex-wrap">
          {totalFwAuthFailed > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#dc2626', boxShadow: '0 0 8px rgba(220,38,38,0.6)' }} />
              <span className="text-white/60 text-xs">{L.authFailed}</span>
              <span className="text-white font-bold text-sm">{totalFwAuthFailed.toLocaleString()}</span>
            </div>
          )}
          {totalVpnAuthFailed > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#f97316', boxShadow: '0 0 8px rgba(249,115,22,0.6)' }} />
              <span className="text-white/60 text-xs">{L.authFailedVpn}</span>
              <span className="text-white font-bold text-sm">{totalVpnAuthFailed.toLocaleString()}</span>
            </div>
          )}
          {totalFwAuthSuccess > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.6)' }} />
              <span className="text-white/60 text-xs">{L.authSuccess}</span>
              <span className="text-white font-bold text-sm">{totalFwAuthSuccess.toLocaleString()}</span>
            </div>
          )}
          {totalVpnAuthSuccess > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.6)' }} />
              <span className="text-white/60 text-xs">{L.authSuccessVpn}</span>
              <span className="text-white font-bold text-sm">{totalVpnAuthSuccess.toLocaleString()}</span>
            </div>
          )}
          {totalOutbound > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#38bdf8', boxShadow: '0 0 8px rgba(56,189,248,0.6)' }} />
              <span className="text-white/60 text-xs">{L.outbound}</span>
              <span className="text-white font-bold text-sm">{totalOutbound.toLocaleString()}</span>
            </div>
          )}
          {totalOutboundBlocked > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.6)' }} />
              <span className="text-white/60 text-xs">{L.outboundBlocked}</span>
              <span className="text-white font-bold text-sm">{totalOutboundBlocked.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: '#06b6d4', boxShadow: '0 0 8px rgba(6,182,212,0.6)' }} />
            <span className="text-white/60 text-xs">{L.centerPoint}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
