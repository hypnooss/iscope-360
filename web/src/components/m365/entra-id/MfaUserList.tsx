import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ShieldCheck, ShieldOff, Star } from 'lucide-react';

interface MfaUserDetail {
  displayName: string;
  upn: string;
  methods: string[];
  hasMfa: boolean;
  defaultMethod?: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  microsoftAuthenticatorPush: 'Authenticator',
  softwareOneTimePasscode: 'Software OTP',
  mobilePhone: 'Mobile Phone',
  email: 'Email',
  windowsHelloForBusiness: 'Windows Hello',
  passKeyDeviceBound: 'Passkey',
  hardwareOneTimePasscode: 'Hardware OTP',
  microsoftAuthenticatorPasswordless: 'Passwordless',
  fido2: 'FIDO2',
};

interface MfaUserListProps {
  users: MfaUserDetail[];
  showMethods?: boolean;
}

export function MfaUserList({ users, showMethods = false }: MfaUserListProps) {
  const [search, setSearch] = useState('');
  const LIMIT = 10;

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) => u.displayName.toLowerCase().includes(q) || u.upn.toLowerCase().includes(q)
    );
  }, [users, search]);

  const visible = filtered.slice(0, search.trim() ? filtered.length : LIMIT);
  const hiddenCount = search.trim() ? 0 : Math.max(0, filtered.length - LIMIT);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou UPN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} usuário{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          Nenhum usuário encontrado.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((user) => (
            <div
              key={user.upn}
              className="flex items-start gap-2.5 p-2.5 rounded-lg bg-secondary/30 border border-border/40"
            >
              <div className="mt-0.5 shrink-0">
                {user.hasMfa ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                ) : (
                  <ShieldOff className="w-4 h-4 text-destructive" />
                )}
              </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="font-medium text-sm truncate block">{user.displayName}</span>
                <div className="text-xs text-muted-foreground truncate">{user.upn}</div>
                {showMethods && user.methods.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {user.methods.map((m) => {
                      const isDefault = user.defaultMethod === m;
                      return (
                        <Badge
                          key={m}
                          variant={isDefault ? 'default' : 'secondary'}
                          className={
                            isDefault
                              ? 'text-[10px] px-1.5 py-0 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30'
                              : 'text-[10px] px-1.5 py-0'
                          }
                        >
                          {isDefault && <Star className="w-2.5 h-2.5 mr-0.5 fill-primary" />}
                          {METHOD_LABELS[m] || m}
                          {isDefault && ' (padrão)'}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <div className="text-xs text-center text-muted-foreground">
          + {hiddenCount} usuário{hiddenCount !== 1 ? 's' : ''}. Use a busca para ver todos.
        </div>
      )}
    </div>
  );
}
