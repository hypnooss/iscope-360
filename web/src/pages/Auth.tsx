import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Eye, EyeOff, ArrowLeft, Mail, KeyRound, CheckCircle } from 'lucide-react';
import logoIscope from '@/assets/logo-iscope.png';
import { toast } from 'sonner';
import { z } from 'zod';
import { strongPasswordSchema } from '@/lib/passwordValidation';
const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória')
});
const emailSchema = z.object({
  email: z.string().email('Email inválido')
});
const passwordSchema = z.object({
  password: strongPasswordSchema,
  confirmPassword: z.string().min(1, 'Confirmação é obrigatória')
}).refine(data => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword']
});
type AuthView = 'login' | 'forgot-password' | 'email-sent' | 'reset-password' | 'success';
export default function Auth() {
  const {
    user,
    loading,
    signIn,
    mfaRequired,
    mfaEnrolled
  } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [currentView, setCurrentView] = useState<AuthView>('login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);

  // Rate limiting state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutCountdown, setLockoutCountdown] = useState(0);

  // Lockout countdown timer
  useEffect(() => {
    if (!lockoutUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutUntil(null);
        setLockoutCountdown(0);
      } else {
        setLockoutCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // Password reset state
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  useEffect(() => {
    if (isRecoveryFlow) return;
    if (!loading && user) {
      if (mfaRequired) {
        if (mfaEnrolled) {
          navigate('/mfa/challenge');
        } else {
          navigate('/mfa/enroll');
        }
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, loading, navigate, isRecoveryFlow, mfaRequired, mfaEnrolled]);

  // Detect password recovery event - Mock version: simplified
  useEffect(() => {
    // Supabase removal
    console.log('Using Mock Auth Flow');
  }, []);
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check lockout
    if (lockoutUntil && Date.now() < lockoutUntil) {
      toast.error(`Aguarde ${lockoutCountdown}s antes de tentar novamente`);
      return;
    }

    const validation = loginSchema.safeParse({
      email: loginEmail,
      password: loginPassword
    });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    // Progressive delay based on failed attempts
    if (failedAttempts > 0) {
      const delayMs = Math.min(1000 * Math.pow(2, failedAttempts - 1), 8000);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    setIsSubmitting(true);
    const {
      error
    } = await signIn(loginEmail, loginPassword);
    setIsSubmitting(false);
    if (error) {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      // After 5 failed attempts, lock out for 30 seconds
      if (newAttempts >= 5) {
        const lockout = Date.now() + 30000;
        setLockoutUntil(lockout);
        setLockoutCountdown(30);
        toast.error('Muitas tentativas falhas. Aguarde 30 segundos.');
      } else if (error.message.includes('Invalid login credentials')) {
        toast.error(`Email ou senha incorretos (tentativa ${newAttempts}/5)`);
      } else if (error.message.includes('Email not confirmed')) {
        toast.error('Email não confirmado. Verifique sua caixa de entrada.');
      } else {
        toast.error(error.message);
      }
    } else {
      setFailedAttempts(0);
      setLockoutUntil(null);
    }
  };
  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = emailSchema.safeParse({
      email: resetEmail
    });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }
    setIsSubmitting(true);
    // Mock reset logic
    setTimeout(() => {
      setIsSubmitting(false);
      setCurrentView('email-sent');
    }, 1000);
  };
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = passwordSchema.safeParse({
      password: newPassword,
      confirmPassword
    });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }
    setIsSubmitting(true);
    // Mock update logic
    setTimeout(() => {
      setIsSubmitting(false);
      toast.success('Senha redefinida com sucesso!');
      setCurrentView('success');
    }, 1000);
  };
  const resetFlow = async () => {
    // Se estamos no fluxo de reset, fazer logout para limpar a sessão de recuperação
    if (currentView === 'reset-password' || currentView === 'success') {
      // Mock signout
    }
    setIsRecoveryFlow(false);
    setCurrentView('login');
    setResetEmail('');
    setNewPassword('');
    setConfirmPassword('');
  };
  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>;
  }
  const renderLoginView = () => <Card className="glass-card border-border/50">
      <CardContent className="pt-6">
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input id="login-email" type="email" placeholder="seu@email.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Senha</Label>
            <div className="relative">
              <Input id="login-password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting || (!!lockoutUntil && Date.now() < lockoutUntil)}>
            {lockoutUntil && Date.now() < lockoutUntil ? (
              `Bloqueado (${lockoutCountdown}s)`
            ) : isSubmitting ? <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Entrando...
              </> : 'Entrar'}
          </Button>
          <button type="button" className="w-full text-sm text-primary hover:underline" onClick={() => setCurrentView('forgot-password')}>
            Esqueceu sua senha?
          </button>
        </form>
      </CardContent>
    </Card>;
  const renderForgotPasswordView = () => <Card className="glass-card border-border/50">
      <CardHeader>
        <button type="button" onClick={resetFlow} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="w-4 h-4" />
          Voltar ao login
        </button>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          Recuperar Senha
        </CardTitle>
        <CardDescription>
          Digite seu email para receber um link de recuperação
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSendResetCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input id="reset-email" type="email" placeholder="seu@email.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </> : 'Enviar Link de Recuperação'}
          </Button>
        </form>
      </CardContent>
    </Card>;
  const renderEmailSentView = () => <Card className="glass-card border-border/50">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Mail className="w-6 h-6 text-primary" />
        </div>
        <CardTitle>Verifique seu Email</CardTitle>
        <CardDescription>
          Enviamos um link de recuperação para <strong>{resetEmail}</strong>. 
          Clique no botão "Reset Password" no email para definir sua nova senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground text-center">
          Não recebeu o email? Verifique sua pasta de spam ou tente novamente.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={() => setCurrentView('forgot-password')}>
            Reenviar Email
          </Button>
          <Button variant="ghost" onClick={resetFlow}>
            Voltar ao Login
          </Button>
        </div>
      </CardContent>
    </Card>;
  const renderResetPasswordView = () => <Card className="glass-card border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" />
          Nova Senha
        </CardTitle>
        <CardDescription>
          Crie uma nova senha segura para sua conta
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">Nova Senha</Label>
            <div className="relative">
              <Input id="new-password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar Senha</Label>
            <div className="relative">
              <Input id="confirm-password" type={showConfirmPassword ? 'text' : 'password'} placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Redefinindo...
              </> : 'Redefinir Senha'}
          </Button>
        </form>
      </CardContent>
    </Card>;
  const renderSuccessView = () => <Card className="glass-card border-border/50">
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
          <CheckCircle className="w-6 h-6 text-green-500" />
        </div>
        <CardTitle>Senha Redefinida!</CardTitle>
        <CardDescription>
          Sua senha foi alterada com sucesso. Você já pode fazer login.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={resetFlow} className="w-full">
          Voltar ao Login
        </Button>
      </CardContent>
    </Card>;
  const renderCurrentView = () => {
    switch (currentView) {
      case 'forgot-password':
        return renderForgotPasswordView();
      case 'email-sent':
        return renderEmailSentView();
      case 'reset-password':
        return renderResetPasswordView();
      case 'success':
        return renderSuccessView();
      default:
        return renderLoginView();
    }
  };
  return <div className="min-h-screen bg-background cyber-grid flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-12">
          <div className="flex flex-col items-center gap-4">
            <img src={logoIscope} alt="iScope 360" className="h-12 w-auto" />
            <span className="font-bold text-foreground text-4xl">iScope 360</span>
          </div>
        </div>

        {renderCurrentView()}

        <p className="text-center text-xs text-muted-foreground mt-6">
          Acesso restrito. Contate o administrador para obter credenciais.
        </p>
      </div>
    </div>;
}