import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { markDeviceAsTrusted } from '@/lib/trustedDevice';
import logoIscope from '@/assets/logo-iscope.png';

export default function MfaChallengePage() {
  const navigate = useNavigate();
  const { refreshMfaStatus } = useAuth();
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  // Guard: redirect to /auth if no session
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/auth', { replace: true });
        return;
      }
      loadFactor();
    };
    checkSession();
  }, []);

  const loadFactor = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;

      const verifiedTotp = data.totp?.find(f => f.status === 'verified');
      if (!verifiedTotp) {
        // No verified factor, redirect to enrollment
        navigate('/mfa/enroll', { replace: true });
        return;
      }

      setFactorId(verifiedTotp.id);
    } catch (err: any) {
      console.error('MFA load factor error:', err);
      toast.error('Erro ao carregar configuração MFA.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6 || !factorId) return;
    setVerifying(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });

      if (verifyError) throw verifyError;

      // Mark device as trusted for 24h
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.user?.id) {
        markDeviceAsTrusted(currentSession.user.id);
      }

      toast.success('Autenticação MFA concluída!');
      await refreshMfaStatus();
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      console.error('MFA challenge error:', err);
      if (err.message?.includes('Invalid') || err.status === 422) {
        toast.error('Código inválido. Verifique e tente novamente.');
      } else {
        toast.error('Erro ao verificar código.');
      }
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex flex-col items-center gap-4">
            <img src={logoIscope} alt="iScope 360" className="h-12 w-auto" />
            <span className="font-bold text-foreground text-4xl">iScope 360</span>
          </div>
        </div>

        <Card className="glass-card border-border/50">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Verificação MFA</CardTitle>
            <CardDescription>
              Abra seu aplicativo autenticador e insira o código de 6 dígitos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
                <Smartphone className="w-4 h-4" />
                <span>Código de verificação</span>
              </div>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                  onComplete={handleVerify}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            <Button
              onClick={handleVerify}
              className="w-full"
              disabled={code.length !== 6 || verifying}
            >
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Verificar'
              )}
            </Button>

            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground text-center"
              onClick={handleSignOut}
            >
              Voltar ao login
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
