import { useState, useMemo } from 'react';
import { formatDateTimeBR } from '@/lib/dateUtils';
import { ComplianceReport, CVEInfo } from '@/types/compliance';
import { CategorySection } from './CategorySection';
import { CVESection } from './CVESection';
import { XCircle, RefreshCw, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { usePDFDownload, sanitizePDFFilename, getPDFDateString } from '@/hooks/usePDFDownload';
import { FirewallPDF } from '@/components/pdf/FirewallPDF';
import { CategoryConfig } from '@/hooks/useCategoryConfig';
import { MiniStat, DetailRow, CommandCentralLayout } from './CommandCentral';


interface DashboardProps {
  report: ComplianceReport;
  onRefresh: () => void;
  isRefreshing: boolean;
  firewallName?: string;
  firewallUrl?: string;
  deviceVendor?: string | null;
  clientName?: string | null;
  categoryConfigs?: CategoryConfig[];
  skipGaugeAnimation?: boolean;
  hideHeader?: boolean;
}

export function Dashboard({ report, onRefresh, isRefreshing, firewallName, firewallUrl, deviceVendor, clientName, categoryConfigs, skipGaugeAnimation = false, hideHeader = false }: DashboardProps) {
  const [loadedCVEs, setLoadedCVEs] = useState<CVEInfo[]>([]);
  const { downloadPDF, isGenerating: isExportingPDF } = usePDFDownload();

  // Sort categories by display_order from configs
  const sortedCategories = useMemo(() => {
    if (!report.categories) return [];
    return [...report.categories].sort((a, b) => {
      const configA = categoryConfigs?.find(c => c.name === a.name);
      const configB = categoryConfigs?.find(c => c.name === b.name);
      return (configA?.display_order ?? 999) - (configB?.display_order ?? 999);
    });
  }, [report.categories, categoryConfigs]);

  const handleCVEsLoaded = (cves: CVEInfo[]) => {
    setLoadedCVEs(cves);
  };

  // Calculate status info for PDF export
  const statusInfo = useMemo(() => {
    // Firmware: Check if there's a "Firmware" or similar category, and check pass rate
    const firmwareCategory = report.categories.find(
      cat => cat.name.toLowerCase().includes('firmware') || 
             cat.name.toLowerCase().includes('atualização') ||
             cat.name.toLowerCase().includes('atualizações')
    );
    const firmwareUpToDate = firmwareCategory ? firmwareCategory.passRate > 50 : false;

    // Licensing: Check "Licenciamento" category
    const licensingCategory = report.categories.find(
      cat => cat.name.toLowerCase().includes('licenciamento') || 
             cat.name.toLowerCase().includes('license')
    );
    const licensingActive = licensingCategory ? licensingCategory.passRate > 50 : false;

    // MFA: Check authentication-related checks
    const authCategory = report.categories.find(
      cat => cat.name.toLowerCase().includes('autenticação') || 
             cat.name.toLowerCase().includes('auth') ||
             cat.name.toLowerCase().includes('acesso')
    );
    // Look for MFA-specific checks in any category
    const mfaCheck = report.categories
      .flatMap(cat => cat.checks)
      .find(check => 
        check.name.toLowerCase().includes('mfa') || 
        check.name.toLowerCase().includes('dois fatores') ||
        check.name.toLowerCase().includes('two-factor') ||
        check.name.toLowerCase().includes('2fa')
      );
    // If we found an MFA check, use its status. Otherwise, check if auth category has MFA passing
    const mfaEnabled = mfaCheck 
      ? mfaCheck.status === 'pass' 
      : (authCategory ? authCategory.checks.some(c => c.status === 'pass' && c.name.toLowerCase().includes('mfa')) : false);

    return {
      firmwareUpToDate,
      licensingActive,
      mfaEnabled,
    };
  }, [report.categories]);

  const handleExportPDF = async () => {
    try {
      // Load logo as base64 (same approach as ExternalDomainAnalysisReportPage)
      const { default: logoIscope } = await import('@/assets/logo-iscope.png');
      
      const logoResponse = await fetch(logoIscope);
      const logoBlob = await logoResponse.blob();
      
      const logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(logoBlob);
      });
      
      const filename = `iscope360-${sanitizePDFFilename(firewallName || 'firewall')}-${getPDFDateString()}.pdf`;
      
      await downloadPDF(
        <FirewallPDF
          report={{ ...report, categories: sortedCategories }}
          deviceInfo={{
            name: firewallName || 'Firewall',
            url: firewallUrl,
            vendor: deviceVendor || undefined,
            clientName: clientName || undefined,
          }}
          logoBase64={logoBase64}
          categoryConfigs={categoryConfigs}
          statusInfo={statusInfo}
        />,
        filename
      );
      toast.success('PDF exportado com sucesso!');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erro ao exportar PDF');
    }
  };

  // Determine vendor label
  const vendorSource = deviceVendor?.toLowerCase() || report.systemInfo?.vendor?.toLowerCase() || '';
  const isSonicWall = vendorSource.includes('sonicwall') || vendorSource.includes('sonic');
  const osLabel = isSonicWall ? 'SonicOS' : 'FortiOS';

  return (
    <div>
      <div>
        {/* Header - hidden when page provides its own */}
        {!hideHeader && (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Análise de Compliance
              </h1>
              <p className="text-muted-foreground">
                Relatório gerado em {formatDateTimeBR(report.generatedAt)}
              </p>
            </div>
            <div className="flex gap-3 ml-auto">
              <Button variant="outline" size="lg" onClick={handleExportPDF} disabled={isExportingPDF}>
                <FileText className={`w-4 h-4 ${isExportingPDF ? 'animate-pulse' : ''}`} />
                {isExportingPDF ? 'Gerando...' : 'Exportar PDF'}
              </Button>
              <Button 
                variant="cyber" 
                size="lg" 
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Reanalisar
              </Button>
            </div>
          </div>
        )}

        {/* COMMAND CENTER HEADER */}
        <CommandCentralLayout
          title={firewallName || 'Firewall'}
          score={report.overallScore}
          skipGaugeAnimation={skipGaugeAnimation}
          miniStats={
            <>
              <MiniStat value={report.totalChecks} label="Total" variant="primary" />
              <MiniStat value={report.passed} label="Aprovadas" variant="success" />
              <MiniStat value={report.failed} label="Falhas" variant="destructive" />
            </>
          }
          detailRows={
            <>
              <DetailRow label="Modelo" value={report.systemInfo?.model || 'N/A'} />
              <DetailRow label="Serial" value={report.systemInfo?.serial || 'N/A'} />
              <DetailRow label={osLabel} value={report.firmwareVersion ? `v${report.firmwareVersion}` : 'N/A'} />
              <DetailRow label="Hostname" value={report.systemInfo?.hostname || firewallName || 'N/A'} />
              <DetailRow label="Uptime" value={report.systemInfo?.uptime || 'N/A'} />
              <DetailRow label="URL" value={firewallUrl || 'N/A'} />
              <DetailRow 
                label="Firmware" 
                value={statusInfo.firmwareUpToDate ? "Atualizado" : "Desatualizado"}
                indicator={statusInfo.firmwareUpToDate ? "success" : "error"}
              />
              <DetailRow 
                label="Licenciamento" 
                value={statusInfo.licensingActive ? "Ativo" : "Expirado"}
                indicator={statusInfo.licensingActive ? "success" : "error"}
              />
              <DetailRow 
                label="MFA" 
                value={statusInfo.mfaEnabled ? "Ativo" : "Inativo"}
                indicator={statusInfo.mfaEnabled ? "success" : "error"}
              />
            </>
          }
        />


        {/* CVE Section */}
        {report.firmwareVersion && (
          <div className="mb-8">
            <CVESection 
              firmwareVersion={report.firmwareVersion} 
              onCVEsLoaded={handleCVEsLoaded}
            />
          </div>
        )}

        {/* Categories */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            Verificações por Categoria
          </h2>
          {Array.isArray(sortedCategories) && sortedCategories.length > 0 ? (
            sortedCategories.map((category, index) => (
              <CategorySection key={category.name} category={category} index={index} categoryConfigs={categoryConfigs} />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhuma categoria de verificação disponível.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
