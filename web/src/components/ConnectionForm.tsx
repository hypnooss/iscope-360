import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Link, Key, Loader2, CheckCircle } from 'lucide-react';

interface ConnectionFormProps {
  onConnect: (url: string, apiKey: string) => Promise<void>;
  isConnecting: boolean;
  isConnected: boolean;
}

export function ConnectionForm({ onConnect, isConnecting, isConnected }: ConnectionFormProps) {
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (url && apiKey) {
      await onConnect(url, apiKey);
    }
  };

  return (
    <div className="glass-card rounded-xl p-8 max-w-xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-lg bg-primary/10 glow-effect">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Conectar ao Firewall</h2>
          <p className="text-sm text-muted-foreground">Forneça as credenciais do FortiGate</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Link className="w-4 h-4" />
            URL do FortiGate
          </label>
          <Input
            type="url"
            placeholder="https://firewall.exemplo.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isConnecting || isConnected}
            className="bg-background/50"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Key className="w-4 h-4" />
            API Key
          </label>
          <Input
            type="password"
            placeholder="••••••••••••••••"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={isConnecting || isConnected}
            className="bg-background/50"
          />
        </div>

        <Button
          type="submit"
          variant={isConnected ? 'success' : 'cyber'}
          size="lg"
          className="w-full"
          disabled={!url || !apiKey || isConnecting || isConnected}
        >
          {isConnecting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Conectando...
            </>
          ) : isConnected ? (
            <>
              <CheckCircle className="w-4 h-4" />
              Conectado
            </>
          ) : (
            <>
              <Shield className="w-4 h-4" />
              Conectar e Analisar
            </>
          )}
        </Button>
      </form>

      <p className="mt-4 text-xs text-muted-foreground text-center">
        A conexão é criptografada e suas credenciais não são armazenadas.
      </p>
    </div>
  );
}
