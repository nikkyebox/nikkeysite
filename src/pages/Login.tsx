import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Mail, Lock, ArrowRight, UserCircle, KeyRound, MailCheck, Eye, EyeOff } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/UserContext';
import { useLanguage } from '@/context/LanguageContext';
import SocialLoginButtons from '@/components/SocialLoginButtons';
import { GOOGLE_LOGIN_ENABLED } from '@/config/featureFlags';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const loginState = location.state as { registeredEmail?: string; verificationEmailSent?: boolean; from?: string } | null;
  const registeredEmail = loginState?.registeredEmail || '';
  const verificationEmailSent = Boolean(loginState?.verificationEmailSent);
  const verificationEmailFailed = Boolean(registeredEmail) && loginState?.verificationEmailSent === false;
  const verifiedFromLink = new URLSearchParams(location.search).get('verified') === '1';
  const { toast } = useToast();
  const { login, isAuthenticated, authReady, sendPasswordReset, isAdminAccount } = useUser();
  const { t } = useLanguage();

  const [formData, setFormData] = useState({
    email: registeredEmail,
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(verificationEmailSent);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState(() => {
    if (verifiedFromLink) return t('login.notice.verified');
    if (verificationEmailFailed) return t('login.notice.mailFailed');
    if (verificationEmailSent) return t('login.notice.sent');
    return '';
  });

  // Conta admin → painel; conta usuário → volta pra onde estava (ou perfil)
  const redirectTo = loginState?.from || '/perfil';
  React.useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    navigate(isAdminAccount ? '/admin' : redirectTo);
  }, [isAuthenticated, authReady, isAdminAccount, navigate, redirectTo]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setNeedsVerification(false);

    try {
      const result = await login(formData.email, formData.password);

      if (result.success) {
        toast({
          title: t('login.toast.okTitle'),
          description: t('login.toast.okDesc'),
        });
        // Admin → tela de escolha (Admin/Cliente); cliente → o efeito redireciona
      } else {
        if (result.needsVerification) {
          setNeedsVerification(true);
          setVerificationNotice(result.error || t('login.error.confirmFirst'));
          toast({
            title: t('login.notice.titleConfirm'),
            description: result.error || t('login.error.checkInbox'),
          });
          return;
        }
        toast({
          title: t('login.toast.errorTitle'),
          description: result.error || t('login.error.invalid'),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t('login.toast.error'),
        description: t('login.error.generic'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      toast({ title: t('login.toast.error'), description: t('login.error.typeEmail'), variant: "destructive" });
      return;
    }
    setIsSendingReset(true);
    try {
      const result = await sendPasswordReset(forgotEmail);
      if (result.success) {
        toast({ title: t('login.toast.resetSent'), description: t('login.toast.resetSentDesc') });
        setShowForgotPassword(false);
        setForgotEmail('');
      } else {
        toast({ title: t('login.toast.error'), description: result.error || t('login.error.resetFailed'), variant: "destructive" });
      }
    } catch (error) {
      toast({ title: t('login.toast.error'), description: t('login.error.resetGeneric'), variant: "destructive" });
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <Layout>
      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {t('auth.login')}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t('auth.login.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-md mx-auto">
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">
              {showForgotPassword ? (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <KeyRound className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="font-display text-2xl font-semibold text-foreground">
                      {t('login.forgot.title')}
                    </h2>
                  </div>

                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="forgotEmail" className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {t('auth.login.email')}
                      </Label>
                      <Input
                        id="forgotEmail"
                        type="email"
                        placeholder={t('login.placeholder.emailExample')}
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        disabled={isSendingReset}
                      />
                    </div>

                    <div className="pt-4 space-y-3">
                      <Button type="submit" className="w-full btn-primary rounded-xl py-6 text-lg font-semibold" disabled={isSendingReset}>
                        {isSendingReset ? t('login.forgot.sending') : t('login.forgot.send')}
                      </Button>
                      <Button type="button" variant="outline" className="w-full" onClick={() => setShowForgotPassword(false)}>
                        {t('login.forgot.back')}
                      </Button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserCircle className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="font-display text-2xl font-semibold text-foreground">
                      {t('auth.login.title')}
                    </h2>
                  </div>

                  {(needsVerification || verificationNotice) && (
                    <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <div className="flex items-start gap-3">
                        <MailCheck className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            {verifiedFromLink && !needsVerification ? t('login.notice.titleVerified') : t('login.notice.titleConfirm')}
                          </p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                            {verificationNotice || t('login.notice.defaultText')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        {t('login.emailLabel')}
                      </Label>
                      <Input
                        id="email"
                        name="email"
                        type="text"
                        placeholder={t('login.placeholder.email')}
                        value={formData.email}
                        onChange={handleInputChange}
                        required
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password" className="flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        {t('auth.login.password')}
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={formData.password}
                          onChange={handleInputChange}
                          required
                          minLength={6}
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isLoading}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                          aria-label={showPassword ? t('login.aria.hidePassword') : t('login.aria.showPassword')}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="text-right">
                      <button type="button" onClick={() => setShowForgotPassword(true)} className="text-sm text-primary hover:underline">
                        {t('auth.login.forgot')}
                      </button>
                    </div>

                    <div className="pt-2">
                      <Button type="submit" className="w-full btn-primary rounded-xl py-6 text-lg font-semibold" disabled={isLoading}>
                        {isLoading ? t('auth.login.loading') : t('auth.login.submit')}
                        {!isLoading && <ArrowRight className="w-5 h-5 ml-2" />}
                      </Button>
                    </div>

                    {GOOGLE_LOGIN_ENABLED && (
                      <div className="relative py-1">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">{t('login.or')}</span></div>
                      </div>
                    )}
                    <SocialLoginButtons disabled={isLoading} />

                    <div className="text-center pt-4">
                      <p className="text-sm text-muted-foreground">
                        {t('auth.login.noAccount')}{' '}
                        <Link to="/cadastro" className="text-primary hover:underline font-medium">
                          {t('auth.login.register')}
                        </Link>
                      </p>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Login;
