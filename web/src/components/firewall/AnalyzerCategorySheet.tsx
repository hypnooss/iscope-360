import * as LucideIcons from 'lucide-react';
import { ShieldX, ShieldCheck, XCircle, CheckCircle2, Server, Target, Crosshair, User } from 'lucide-react';
import { getCountryCode } from '@/lib/countryUtils';
import 'flag-icons/css/flag-icons.min.css';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  ANALYZER_CATEGORY_INFO,
  type AnalyzerEventCategory,
  type AnalyzerSnapshot,
  type TopBlockedIP,
  type TopCountry,
  type TopCategory,
  type TopUserIP,
} from '@/types/analyzerInsights';

function DynamicIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const iconName = name.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('') as keyof typeof LucideIcons;
  const IconComponent = LucideIcons[iconName] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  if (!IconComponent) return <LucideIcons.Shield className={className} style={style} />;
  return <IconComponent className={className} style={style} />;
}

const isPrivateIP = (ip: string) =>
  /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/.test(ip);

function IPList({ items, colorClass }: { items?: TopBlockedIP[]; colorClass?: string }) {
  if (!items?.length) return <p className="text-xs text-muted-foreground py-2">Sem dados</p>;
  return (
    <>
      {items.slice(0, 10).map((item, idx) => (
        <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-mono truncate">{item.ip}</span>
            {item.country ? (
              <span className={`fi fi-${getCountryCode(item.country) || 'xx'} text-base shrink-0`} title={item.country} />
            ) : isPrivateIP(item.ip) ? (
              <span title="IP Privado (LAN)">
                <Server className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </span>
            ) : null}
          </div>
          <span className={cn('text-sm font-semibold shrink-0 ml-2', colorClass ?? 'text-foreground')}>
            {item.count.toLocaleString()}
          </span>
        </div>
      ))}
    </>
  );
}

function CountryList({ items, colorClass }: { items?: TopCountry[]; colorClass?: string }) {
  if (!items?.length) return <p className="text-xs text-muted-foreground py-2">Sem dados</p>;
  return (
    <>
      {items.slice(0, 10).map((item, idx) => (
        <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
          <span className="flex items-center gap-2">
            <span className={`fi fi-${getCountryCode(item.country) || 'xx'} text-base`} title={item.country} />
            <span className="text-sm">{item.country}</span>
          </span>
          <span className={cn('text-sm font-semibold', colorClass ?? 'text-foreground')}>
            {item.count.toLocaleString()}
          </span>
        </div>
      ))}
    </>
  );
}

function UserList({ items, colorClass }: { items?: TopUserIP[]; colorClass?: string }) {
  if (!items?.length) return <p className="text-xs text-muted-foreground py-2">Sem dados</p>;
  return (
    <>
      {items.slice(0, 10).map((item, idx) => (
        <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
          <div className="flex items-center gap-2 min-w-0">
            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm truncate">{item.user}</span>
            {item.ip && (
              <span className="text-xs text-muted-foreground font-mono">{item.ip}</span>
            )}
          </div>
          <span className={cn('text-sm font-semibold shrink-0 ml-2', colorClass ?? 'text-foreground')}>
            {item.count.toLocaleString()}
          </span>
        </div>
      ))}
    </>
  );
}

interface AnalyzerCategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: AnalyzerEventCategory | null;
  snapshot: AnalyzerSnapshot;
}

export function AnalyzerCategorySheet({ open, onOpenChange, category, snapshot }: AnalyzerCategorySheetProps) {
  if (!category || !snapshot?.metrics) return null;

  const info = ANALYZER_CATEGORY_INFO[category];
  const metrics = snapshot.metrics;
  const isTrafficCategory = category === 'inbound_traffic' || category === 'outbound_traffic';
  const isAuthCategory = category === 'fw_authentication' || category === 'vpn_authentication';
  const isIPSCategory = category === 'ips_events';

  const getTrafficData = () => {
    if (category === 'inbound_traffic') {
      return {
        blockedCount: metrics.inboundBlocked || 0,
        allowedCount: metrics.inboundAllowed || 0,
        blockedIPs: metrics.topInboundBlockedIPs,
        blockedCountries: metrics.topInboundBlockedCountries,
        allowedIPs: metrics.topInboundAllowedIPs,
        allowedCountries: metrics.topInboundAllowedCountries,
        ipLabel: 'de Origem',
        internalLabel: 'de Destino',
        blockedInternalIPs: metrics.topInboundBlockedDestIPs,
        allowedInternalIPs: metrics.topInboundAllowedDestIPs,
      };
    }
    return {
      blockedCount: metrics.outboundBlocked || 0,
      allowedCount: metrics.outboundConnections || 0,
      blockedIPs: metrics.topOutboundBlockedIPs,
      blockedCountries: metrics.topOutboundBlockedCountries,
      allowedIPs: metrics.topOutboundIPs,
      allowedCountries: metrics.topOutboundCountries,
      ipLabel: 'de Destino',
      internalLabel: 'de Origem',
      blockedInternalIPs: metrics.topOutboundBlockedSourceIPs,
      allowedInternalIPs: metrics.topOutboundSourceIPs,
    };
  };

  const renderTrafficContent = () => {
    const data = getTrafficData();
    return (
      <Tabs defaultValue="bloqueado" className="flex flex-col flex-1 min-h-0">
        <div className="border-b border-border shrink-0" />
        <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-6 h-auto py-0 shrink-0">
          <TabsTrigger
            value="bloqueado"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 text-xs gap-1.5"
          >
            <ShieldX className="w-3.5 h-3.5" />
            Bloqueado
          </TabsTrigger>
          <TabsTrigger
            value="permitido"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 text-xs gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Permitido
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bloqueado" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-4">
              {data.blockedCount > 0 && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                  {data.blockedCount.toLocaleString()} eventos bloqueados
                </Badge>
              )}
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium">Top IPs {data.ipLabel} (Bloqueados)</CardTitle>
                </CardHeader>
                <CardContent>
                  <IPList items={data.blockedIPs} colorClass="text-destructive" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium">Top Países Bloqueados</CardTitle>
                </CardHeader>
                <CardContent>
                  <CountryList items={data.blockedCountries} colorClass="text-destructive" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium">Top IPs {data.internalLabel}</CardTitle>
                </CardHeader>
                <CardContent>
                  <IPList items={data.blockedInternalIPs} colorClass="text-destructive" />
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="permitido" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-4">
              {data.allowedCount > 0 && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  {data.allowedCount.toLocaleString()} eventos permitidos
                </Badge>
              )}
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium">Top IPs {data.ipLabel} (Permitidos)</CardTitle>
                </CardHeader>
                <CardContent>
                  <IPList items={data.allowedIPs} colorClass="text-emerald-600 dark:text-emerald-400" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium">Top Países Permitidos</CardTitle>
                </CardHeader>
                <CardContent>
                  <CountryList items={data.allowedCountries} colorClass="text-emerald-600 dark:text-emerald-400" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium">Top IPs {data.internalLabel}</CardTitle>
                </CardHeader>
                <CardContent>
                  <IPList items={data.allowedInternalIPs} colorClass="text-emerald-600 dark:text-emerald-400" />
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    );
  };

  const renderAuthContent = () => {
    const isFw = category === 'fw_authentication';
    const failedIPs = isFw ? metrics.topFwAuthIPsFailed : metrics.topVpnAuthIPsFailed;
    const failedCountries = isFw ? metrics.topFwAuthCountriesFailed : metrics.topVpnAuthCountriesFailed;
    const successIPs = isFw ? metrics.topFwAuthIPsSuccess : metrics.topVpnAuthIPsSuccess;
    const successCountries = isFw ? metrics.topFwAuthCountriesSuccess : metrics.topVpnAuthCountriesSuccess;
    const failCount = isFw ? (metrics.firewallAuthFailures || 0) : (metrics.vpnFailures || 0);
    const successCount = isFw ? (metrics.firewallAuthSuccesses || 0) : (metrics.vpnSuccesses || 0);
    const failedUsers = !isFw ? (metrics.topVpnUsersFailed || []) : [];
    const successUsers = !isFw ? (metrics.topVpnUsersSuccess || []) : [];

    return (
      <Tabs defaultValue="falha" className="flex flex-col flex-1 min-h-0">
        <div className="border-b border-border shrink-0" />
        <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-6 h-auto py-0 shrink-0">
          <TabsTrigger
            value="falha"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-destructive data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 text-xs gap-1.5"
          >
            <XCircle className="w-3.5 h-3.5" />
            Falha
          </TabsTrigger>
          <TabsTrigger
            value="sucesso"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 text-xs gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Sucesso
          </TabsTrigger>
        </TabsList>

        <TabsContent value="falha" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-4">
              {failCount > 0 && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                  {failCount.toLocaleString()} autenticações falhas
                </Badge>
              )}
              {failedUsers.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-medium">Top Usuários (Falha)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <UserList items={failedUsers} colorClass="text-destructive" />
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium">Top IPs (Falha)</CardTitle>
                </CardHeader>
                <CardContent>
                  <IPList items={failedIPs} colorClass="text-destructive" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium">Top Países (Falha)</CardTitle>
                </CardHeader>
                <CardContent>
                  <CountryList items={failedCountries} colorClass="text-destructive" />
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="sucesso" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-6 space-y-4">
              {successCount > 0 && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  {successCount.toLocaleString()} autenticações bem-sucedidas
                </Badge>
              )}
              {successUsers.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-medium">Top Usuários (Sucesso)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <UserList items={successUsers} colorClass="text-emerald-600 dark:text-emerald-400" />
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium">Top IPs (Sucesso)</CardTitle>
                </CardHeader>
                <CardContent>
                  <IPList items={successIPs} colorClass="text-emerald-600 dark:text-emerald-400" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-medium">Top Países (Sucesso)</CardTitle>
                </CardHeader>
                <CardContent>
                  <CountryList items={successCountries} colorClass="text-emerald-600 dark:text-emerald-400" />
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    );
  };

  const renderIPSContent = () => {
    const attackTypes = metrics.topIpsAttackTypes || [];
    const srcIPs = metrics.topIpsSrcIPs || [];
    const srcCountries = metrics.topIpsSrcCountries || [];
    const dstIPs = metrics.topIpsDstIPs || [];
    const ipsCount = metrics.ipsEvents || 0;

    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Top Ataques - always visible */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          {ipsCount > 0 && (
            <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 mb-3">
              {ipsCount.toLocaleString()} eventos IPS
            </Badge>
          )}
          <Card>
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-medium">Top Ataques (por tipo)</CardTitle>
            </CardHeader>
            <CardContent className="max-h-40 overflow-y-auto">
              {attackTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Sem dados</p>
              ) : (
                attackTypes.slice(0, 10).map((item: TopCategory, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-sm truncate max-w-[70%]">{item.category}</span>
                    <span className="text-sm font-semibold text-rose-600 dark:text-rose-400 shrink-0 ml-2">
                      {item.count.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="atacantes" className="flex flex-col flex-1 min-h-0">
          <div className="border-b border-border shrink-0" />
          <TabsList className="w-full justify-start rounded-none border-b border-border/50 bg-transparent px-6 h-auto py-0 shrink-0">
            <TabsTrigger
              value="atacantes"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-rose-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 text-xs gap-1.5"
            >
              <Crosshair className="w-3.5 h-3.5" />
              Atacantes
            </TabsTrigger>
            <TabsTrigger
              value="alvos"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 text-xs gap-1.5"
            >
              <Target className="w-3.5 h-3.5" />
              Alvos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="atacantes" className="flex-1 mt-0 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-6 space-y-4">
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-medium">Top IPs Atacantes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <IPList items={srcIPs} colorClass="text-rose-600 dark:text-rose-400" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-medium">Top Países de Origem</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CountryList items={srcCountries} colorClass="text-rose-600 dark:text-rose-400" />
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="alvos" className="flex-1 mt-0 min-h-0">
            <ScrollArea className="h-full">
              <div className="p-6 space-y-4">
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm font-medium">Top IPs Alvo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <IPList items={dstIPs} colorClass="text-amber-600 dark:text-amber-400" />
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  const renderCategoryContent = () => {
    switch (category) {
      case 'inbound_traffic':
      case 'outbound_traffic':
        return renderTrafficContent();

      case 'fw_authentication':
      case 'vpn_authentication':
        return renderAuthContent();

      case 'ips_events':
        return renderIPSContent();

      case 'web_filter':
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Top Categorias</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.topWebFilterCategories?.slice(0, 10).map((item: TopCategory, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-sm">{item.category}</span>
                    <span className="text-sm font-semibold">{item.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Top Usuários</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.topWebFilterUsers?.slice(0, 10).map((item: TopUserIP, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-sm">{item.user}</span>
                    <span className="text-sm font-semibold">{item.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        );

      case 'app_control':
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Top Aplicações</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.topAppControlApps?.slice(0, 10).map((item: TopCategory, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-sm">{item.category}</span>
                    <span className="text-sm font-semibold">{item.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Top Usuários</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.topAppControlUsers?.slice(0, 10).map((item: TopUserIP, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-sm">{item.user}</span>
                    <span className="text-sm font-semibold">{item.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        );

      case 'anomalies':
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Top IPs de Origem</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.topAnomalySources?.slice(0, 10).map((item: TopBlockedIP, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-sm font-mono">{item.ip}</span>
                    <span className="text-sm font-semibold">{item.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Top Tipos de Anomalia</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.topAnomalyTypes?.slice(0, 10).map((item: TopCategory, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-sm">{item.category}</span>
                    <span className="text-sm font-semibold">{item.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        );

      case 'botnet':
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Domínios Detectados</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.botnetDomains?.slice(0, 10).map((item, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-sm font-mono break-all">{item.domain}</span>
                    <span className="text-sm font-semibold text-red-500">{item.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        );

      default:
        return (
          <p className="text-sm text-muted-foreground">Nenhum detalhe disponível para esta categoria.</p>
        );
    }
  };

  const isFullHeightCategory = isTrafficCategory || isAuthCategory || isIPSCategory;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          'w-full sm:max-w-[50vw]',
          isFullHeightCategory ? 'p-0 flex flex-col' : ''
        )}
      >
        <SheetHeader className={cn(isFullHeightCategory ? 'px-6 pt-6 pb-0 shrink-0' : 'mb-2')}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${info.colorHex}15` }}>
              <DynamicIcon name={info.icon} className="w-5 h-5" style={{ color: info.colorHex }} />
            </div>
            <SheetTitle>{info.label}</SheetTitle>
          </div>
          <SheetDescription>{info.description}</SheetDescription>
        </SheetHeader>

        {isFullHeightCategory ? (
          renderCategoryContent()
        ) : (
          <ScrollArea className="h-[calc(100vh-12rem)] mt-6">
            {renderCategoryContent()}
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
