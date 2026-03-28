import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import logoIscope from '@/assets/logo-iscope.png';

export default function MfaEnrollPage() {
  const navigate = useNavigate();
  const [qrCode, setQrCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
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
      enrollFactor();
    };
    checkSession();
  }, []);

  const enrollFactor = async () => {
    setLoading(true);
    try {
      // Check if user already has a verified TOTP factor
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const verifiedTotp = factorsData?.totp?.find(f => f.status === 'verified');
      if (verifiedTotp) {
        // Already enrolled, go to challenge
        navigate('/mfa/challenge', { replace: true });
        return;
      }

      // Remove any unverified factors first
      const unverified = factorsData?.totp?.filter(f => f.status !== 'verified') || [];
      for (const f of unverified) {
        try {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        } catch (e) {
          console.warn('Failed to unenroll factor:', f.id, e);
        }
      }

      // Use unique friendly name to avoid conflicts
      const friendlyName = `iScope 360 ${Date.now()}`;
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
      });

      if (error) throw error;

      setQrCode(data.totp.qr_code);
      setFactorId(data.id);
      setSecret(data.totp.secret);
    } catch (err: any) {
      console.error('MFA enroll error:', err);
      toast.error('Erro ao configurar MFA. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) return;
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

      toast.success('MFA configurado com sucesso!');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      console.error('MFA verify error:', err);
      if (err.message?.includes('Invalid')) {
        toast.error('Código inválido. Verifique e tente novamente.');
      } else {
        toast.error('Erro ao verificar código. Tente novamente.');
      }
      setCode('');
    } finally {
      setVerifying(false);
    }
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
            <CardTitle>Configurar Autenticação MFA</CardTitle>
            <CardDescription>
              Escaneie o QR code abaixo com seu aplicativo autenticador (Google Authenticator, Microsoft Authenticator, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* QR Code */}
            {qrCode && (
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-lg">
                  <img src={qrCode} alt="QR Code MFA" className="w-48 h-48" />
                </div>
              </div>
            )}

            {/* Manual secret */}
            {secret && (
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground">Ou insira manualmente:</p>
                <code className="text-xs font-mono bg-muted px-3 py-1.5 rounded break-all select-all">
                  {secret}
                </code>
              </div>
            )}

            {/* OTP Input */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
                <Smartphone className="w-4 h-4" />
                <span>Digite o código de 6 dígitos</span>
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
                'Ativar MFA'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
