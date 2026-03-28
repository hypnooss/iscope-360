import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const PROJECT_REF = "akbosdbyheezghieiefz";
const INSTALL_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/agent-install`;
const SUPER_AGENT_INSTALL_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/super-agent-install`;

const STATUS_CMD = "systemctl status iscope-agent --no-pager";
const LOGS_CMD = "journalctl -u iscope-agent -f --no-pager";

type Props = {
  activationCode: string;
  className?: string;
  isSuperAgent?: boolean;
};

async function copyToClipboard(text: string, label: string) {
  await navigator.clipboard.writeText(text);
  toast.success(`${label} copiado!`);
}

export function AgentInstallInstructions({ activationCode, className, isSuperAgent = false }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const baseUrl = isSuperAgent ? SUPER_AGENT_INSTALL_URL : INSTALL_URL;

  const installCommand = useMemo(
    () => `curl -fsSL ${baseUrl} | sudo bash -s -- --activation-code "${activationCode}"`,
    [activationCode, baseUrl],
  );

  const doCopy = async (key: string, value: string, label: string) => {
    await copyToClipboard(value, label);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label>{isSuperAgent ? "Instalar Super Agent (Linux)" : "Instalar agent (Linux)"}</Label>

        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm">
          <p className="text-foreground">
            <span className="font-medium">Pré-requisito:</span> publique o arquivo{" "}
            <code className="font-mono text-xs">iscope-agent-latest.tar.gz</code> no Supabase Storage (bucket{" "}
            <code className="font-mono text-xs">agent-releases</code>).
          </p>
          {isSuperAgent && (
            <p className="mt-2 text-foreground">
              <span className="font-medium">Ferramentas instaladas:</span> masscan, nmap, httpx (projectdiscovery).
            </p>
          )}
          <p className="mt-2 text-muted-foreground">
            Link do Storage:{" "}
            <a
              className="underline underline-offset-2"
              href="https://supabase.com/dashboard/project/akbosdbyheezghieiefz/storage/buckets"
              target="_blank"
              rel="noreferrer"
            >
              abrir buckets
            </a>
          </p>
        </div>

        <div className="rounded-lg bg-muted/30 border border-border/50 p-3">
          <div className="flex items-start gap-2">
            <code className="flex-1 text-xs sm:text-sm font-mono break-all text-foreground">{installCommand}</code>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => doCopy("install", installCommand, "Comando")}
              title="Copiar comando"
            >
              {copied === "install" ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Passo 1: cole no servidor Linux (requer sudo).</p>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => doCopy("status", STATUS_CMD, "Verificação")}
            className="gap-2">
            {copied === "status" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            Copiar verificação
          </Button>
          <Button variant="outline" size="sm" onClick={() => doCopy("logs", LOGS_CMD, "Logs")}
            className="gap-2">
            {copied === "logs" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            Copiar logs
          </Button>
        </div>

        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li>O serviço deve ficar como <span className="text-foreground">active (running)</span>.</li>
          <li>Veja logs no <span className="text-foreground">journalctl</span> para confirmar o heartbeat.</li>
          <li>Volte aqui e confira se o status do Agent mudou para <span className="text-foreground">Online</span>.</li>
        </ul>
      </div>
    </div>
  );
}
