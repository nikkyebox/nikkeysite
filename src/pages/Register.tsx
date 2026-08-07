import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { UserCircle, Mail, Lock, Phone, ArrowRight, Eye, EyeOff } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/UserContext';
import { useLanguage } from '@/context/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import SocialLoginButtons from '@/components/SocialLoginButtons';
import { isValidEmail, isNonEmpty, runValidations, FieldErrors, COUNTRY_DIAL_CODES, isValidCNPJ, maskCNPJ } from '@/utils/validation';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { register: registerUser, isAuthenticated, authReady } = useUser();
  const redirectTo = (location.state as any)?.from || '/perfil';
  const { t, selectedCountry } = useLanguage();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    personType: 'PF' as 'PF' | 'PJ',
    cnpj: '',
    razaoSocial: '',
    gender: '' as '' | 'masculino' | 'feminino' | 'outro',
    birthdayMonth: '',
    birthdayYear: '',
  });
  // Código do país (DDI), default pelo país selecionado na loja
  const [dialCode, setDialCode] = useState<string>(() => {
    const match = COUNTRY_DIAL_CODES.find((c) => c.country === selectedCountry);
    return match ? match.code : '+55';
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Redirect after login — volta pra onde o usuário estava (ex: /checkout)
  React.useEffect(() => {
    if (authReady && isAuthenticated) {
      navigate(redirectTo);
    }
  }, [isAuthenticated, authReady, navigate, redirectTo]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    // Telefone: mantém apenas dígitos e espaços (formato varia por país)
    const nextValue = name === 'phone' ? value.replace(/[^\d\s]/g, '') : value;
    setFormData(prev => ({
      ...prev,
      [name]: nextValue
    }));
    // Limpa o erro do campo ao editar
    if (errors[name]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Telefone completo no formato internacional: "+351 912345678"
  const fullPhone = () => `${dialCode} ${formData.phone.trim()}`.trim();

  const validateForm = (): boolean => {
    const phoneDigits = formData.phone.replace(/\D/g, '');
    const isPJ = formData.personType === 'PJ';
    const fieldErrors = runValidations({
      name: () => (isNonEmpty(formData.name, 2) ? null : 'Informe seu nome completo.'),
      email: () => (isValidEmail(formData.email) ? null : 'E-mail inválido.'),
      phone: () =>
        phoneDigits.length >= 6 && phoneDigits.length <= 13
          ? null
          : 'Telefone inválido (digite o número sem o código do país).',
      password: () => (formData.password.length >= 6 ? null : 'A senha deve ter ao menos 6 caracteres.'),
      confirmPassword: () =>
        formData.password === formData.confirmPassword ? null : 'As senhas não coincidem.',
      razaoSocial: () => (!isPJ || isNonEmpty(formData.razaoSocial, 2) ? null : 'Informe a razão social.'),
      cnpj: () => (!isPJ || isValidCNPJ(formData.cnpj) ? null : 'CNPJ inválido.'),
    });
    setErrors(fieldErrors);
    return Object.keys(fieldErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast({
        title: 'Confira os campos',
        description: 'Alguns dados precisam de correção.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const birthdateParts = [formData.birthdayYear, formData.birthdayMonth].filter(Boolean);
      const birthdate = birthdateParts.length === 2 ? `${formData.birthdayYear}-${formData.birthdayMonth.padStart(2,'0')}` : undefined;

      const result = await registerUser({
        name: formData.name,
        email: formData.email,
        phone: fullPhone(),
        password: formData.password,
        personType: formData.personType,
        ...(formData.gender ? { gender: formData.gender as 'masculino' | 'feminino' | 'outro' } : {}),
        ...(birthdate ? { birthdate } : {}),
        ...(formData.personType === 'PJ'
          ? { cnpj: formData.cnpj, razaoSocial: formData.razaoSocial }
          : {}),
        address: {
          postalCode: '',
          prefecture: '',
          city: '',
          address: '',
        }
      });

      if (result.success) {
        const verificationEmailSent = result.verificationEmailSent !== false;
        if (verificationEmailSent) {
          toast({
            title: "Confirme seu e-mail",
            description: "Enviamos um link de confirmação. Clique no link antes de fazer login.",
          });
        } else {
          toast({
            title: "Conta criada",
            description: "Nao conseguimos enviar o link automaticamente. Tente fazer login para reenviar ou avise a loja.",
            variant: "destructive",
          });
        }
        navigate('/login', {
          replace: true,
          state: { registeredEmail: formData.email.trim(), verificationEmailSent },
        });
      } else if (result.verificationEmailSent) {
        // E-mail já cadastrado mas não confirmado → reenviamos o link.
        // Não é erro: leva pro login com o aviso amigável.
        toast({
          title: "Link reenviado",
          description: result.error || "Reenviamos o link de confirmação. Verifique sua caixa de entrada e o spam.",
        });
        navigate('/login', {
          replace: true,
          state: { registeredEmail: formData.email.trim(), verificationEmailSent: true },
        });
      } else {
        toast({
          title: "Erro no cadastro",
          description: result.error || "Não foi possível criar sua conta. Tente novamente.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro no cadastro",
        description: "Ocorreu um erro ao criar sua conta. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
              {t('auth.register')}
            </h1>
            <p className="text-muted-foreground text-lg">
              {t('auth.register.subtitle')}
            </p>
          </div>
        </div>
      </div>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-md mx-auto">
            <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">

              {/* Language Switcher */}
              <div className="flex items-center justify-center gap-2 mb-6 pb-4 border-b border-border">
                <span className="text-sm text-muted-foreground mr-2">🌐</span>
                <LanguageSwitcher />
              </div>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <UserCircle className="w-5 h-5 text-primary" />
                </div>
                <h2 className="font-display text-2xl font-semibold text-foreground">
                  {t('auth.register.title')}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Tipo de cadastro: Pessoa Física ou Jurídica */}
                <div className="space-y-2">
                  <Label>{t('auth.register.accountType')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setFormData((p) => ({ ...p, personType: 'PF' }))}
                      className={`py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors ${formData.personType === 'PF' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-gray-300'}`}>
                      👤 {t('auth.register.personal')}
                    </button>
                    <button type="button" onClick={() => setFormData((p) => ({ ...p, personType: 'PJ' }))}
                      className={`py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors ${formData.personType === 'PJ' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-gray-300'}`}>
                      🏢 {t('auth.register.company')}
                    </button>
                  </div>
                </div>

                {formData.personType === 'PJ' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="razaoSocial">Razão Social</Label>
                      <Input id="razaoSocial" name="razaoSocial" value={formData.razaoSocial}
                        onChange={(e) => setFormData((p) => ({ ...p, razaoSocial: e.target.value }))}
                        placeholder="Nome da empresa" aria-invalid={!!errors.razaoSocial}
                        className={errors.razaoSocial ? 'border-destructive' : ''} />
                      {errors.razaoSocial && <p className="text-xs text-destructive">{errors.razaoSocial}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cnpj">CNPJ</Label>
                      <Input id="cnpj" name="cnpj" value={formData.cnpj} inputMode="numeric"
                        onChange={(e) => setFormData((p) => ({ ...p, cnpj: maskCNPJ(e.target.value) }))}
                        placeholder="00.000.000/0000-00" aria-invalid={!!errors.cnpj}
                        className={`font-mono ${errors.cnpj ? 'border-destructive' : ''}`} />
                      {errors.cnpj && <p className="text-xs text-destructive">{errors.cnpj}</p>}
                      <p className="text-xs text-muted-foreground">
                        Compras em atacado/volume? Conheça a página <Link to="/empresas" className="text-primary font-semibold hover:underline">Empresas</Link>.
                      </p>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name" className="flex items-center gap-2">
                    <UserCircle className="w-4 h-4" />
                    {t('auth.register.name')}
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="山田 太郎"
                    value={formData.name}
                    onChange={handleInputChange}
                    aria-invalid={!!errors.name}
                    className={errors.name ? 'border-destructive' : ''}
                    required
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    {t('auth.login.email')}
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="exemplo@email.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    aria-invalid={!!errors.email}
                    className={errors.email ? 'border-destructive' : ''}
                    required
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    {t('auth.register.phone')}
                  </Label>
                  <div className="flex gap-2">
                    <select
                      value={dialCode}
                      onChange={(e) => setDialCode(e.target.value)}
                      className="px-2 py-2 rounded-lg border border-input bg-background text-sm font-medium focus:ring-2 focus:ring-primary focus:border-primary"
                      aria-label="Código do país"
                    >
                      {COUNTRY_DIAL_CODES.map((c) => (
                        <option key={c.country} value={c.code}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      placeholder="912 345 678"
                      value={formData.phone}
                      onChange={handleInputChange}
                      aria-invalid={!!errors.phone}
                      className={`flex-1 ${errors.phone ? 'border-destructive' : ''}`}
                      maxLength={15}
                      required
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t('auth.register.phoneHint').replace('{code}', dialCode)}
                  </p>
                  {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                </div>

                {/* Gênero */}
                <div className="space-y-2">
                  <Label>{t('auth.register.gender')} <span className="text-muted-foreground font-normal text-xs">{t('auth.register.optional')}</span></Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'feminino', label: `♀ ${t('auth.register.genderFemale')}` },
                      { value: 'masculino', label: `♂ ${t('auth.register.genderMale')}` },
                      { value: 'outro', label: `— ${t('auth.register.genderUndisclosed')}` },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, gender: p.gender === opt.value ? '' : opt.value as any }))}
                        className={`py-2 rounded-lg border-2 text-xs font-semibold transition-colors ${formData.gender === opt.value ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-gray-300'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Data de aniversário */}
                <div className="space-y-2">
                  <Label>{t('auth.register.birthMonth')} <span className="text-muted-foreground font-normal text-xs">{t('auth.register.birthHint')}</span></Label>
                  <div className="flex gap-2">
                    <select
                      value={formData.birthdayMonth}
                      onChange={e => setFormData(p => ({ ...p, birthdayMonth: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    >
                      <option value="">{t('auth.register.month')}</option>
                      {t('auth.register.months').split(',').map((m, i) => (
                        <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={formData.birthdayYear}
                      onChange={e => setFormData(p => ({ ...p, birthdayYear: e.target.value }))}
                      placeholder={t('auth.register.year')}
                      min={1900}
                      max={new Date().getFullYear()}
                      className="w-24 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    {t('auth.register.password')}
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
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    {t('auth.register.confirmPassword')}
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      aria-invalid={!!errors.confirmPassword}
                      className={errors.confirmPassword ? 'border-destructive' : ''}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
                </div>

                <div className="pt-4">
                  <Button 
                    type="submit" 
                    disabled={isLoading}
                    className="w-full btn-primary rounded-xl py-6 text-lg font-semibold"
                  >
                    {isLoading ? t('auth.register.loading') : t('auth.register.submit')}
                    {!isLoading && <ArrowRight className="w-5 h-5 ml-2" />}
                  </Button>
                </div>

                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">ou</span></div>
                </div>
                <SocialLoginButtons disabled={isLoading} mode="register" />

                <div className="text-center pt-4">
                  <p className="text-sm text-muted-foreground">
                    {t('auth.register.hasAccount')}{' '}
                    <Link to="/login" className="text-primary hover:underline font-medium">
                      {t('auth.register.loginLink')}
                    </Link>
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Register;
