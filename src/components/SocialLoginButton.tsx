import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/button';
import type { SocialProvider } from '@/services/firebaseSyncService';

/**
 * Botão de login social genérico (Google, Facebook, Apple, Twitter/X).
 * Todos os provedores federados retornam o e-mail JÁ verificado, então o fluxo
 * de confirmação de e-mail é pulado — o maior gatilho de cadastro. O redirect
 * pós-login é tratado pelo useEffect de cada página ao perceber isAuthenticated.
 *
 * Toda a cópia sai do dicionário: a loja abre em japonês para quem acessa do
 * Japão, e o rótulo escrito no JSX aparecia em português no meio de ログイン e
 * パスワードを忘れた？. `loginWithProvider` devolve o código cru do Firebase —
 * a frase mostrada ao cliente nasce aqui, já traduzida.
 */

type Brand = { label: string; className: string; icon: React.ReactNode };

const BRANDS: Record<SocialProvider, Brand> = {
  google: {
    label: 'Google',
    className: '',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    ),
  },
  facebook: {
    label: 'Facebook',
    className: 'bg-[#1877F2] text-white border-[#1877F2] hover:bg-[#166FE0] hover:text-white',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07z" />
      </svg>
    ),
  },
  twitter: {
    label: 'X',
    className: 'bg-black text-white border-black hover:bg-neutral-800 hover:text-white',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
};

// Códigos do Firebase que significam "o cliente desistiu" — fechar o popup não
// é erro, então não vira toast.
const CANCEL_CODES = ['popup-closed-by-user', 'cancelled-popup-request', 'cancel-popup-request'];

// Código do Firebase → chave do dicionário. `includes` porque o código vem
// prefixado (`auth/popup-blocked`). Três códigos distintos descrevem a mesma
// falha de configuração e compartilham a mesma frase.
const ERROR_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['popup-blocked', 'auth.social.error.popupBlocked'],
  ['account-exists-with-different-credential', 'auth.social.error.otherMethod'],
  ['operation-not-allowed', 'auth.social.error.notEnabled'],
  ['unauthorized-domain', 'auth.social.error.domain'],
  ['network-request-failed', 'auth.social.error.network'],
  ['configuration-not-found', 'auth.social.error.misconfigured'],
  ['internal-error', 'auth.social.error.misconfigured'],
  ['invalid-credential', 'auth.social.error.misconfigured'],
];

const SocialLoginButton: React.FC<{
  provider: SocialProvider;
  mode?: 'login' | 'register';
  disabled?: boolean;
}> = ({ provider, mode = 'login', disabled = false }) => {
  const navigate = useNavigate();
  const { loginWithProvider } = useUser();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const brand = BRANDS[provider];
  const label = t(mode === 'register' ? 'auth.social.register' : 'auth.social.login')
    .replace('{provider}', brand.label);

  // `null` = nada a mostrar. O código cru entra na frase genérica porque é o
  // que permite diagnosticar uma falha relatada por cliente em produção.
  const errorMessage = (code: string): string | null => {
    if (CANCEL_CODES.some(c => code.includes(c))) return null;
    const hit = ERROR_KEYS.find(([c]) => code.includes(c));
    if (hit) return t(hit[1]).replace('{host}', window.location.hostname);
    if (code === 'unknown') return t('auth.social.error.unknown');
    return t('auth.social.error.generic').replace('{code}', code);
  };

  const handleClick = async () => {
    setLoading(true);
    try {
      const result = await loginWithProvider(provider);
      if (result.success && result.error === 'new-user') {
        // Cliente JÁ criado pelo provedor (com cupom de boas-vindas) e sessão
        // aberta — falta endereço e telefone, que se completam no perfil.
        // `/cadastro` não serve mais: quem já está autenticado é redirecionado
        // de lá para o perfil no efeito da própria página.
        toast({ title: t('auth.social.newUser.title'), description: t('auth.social.newUser.desc') });
        navigate('/perfil');
      } else if (result.success) {
        toast({ title: t('auth.social.success.title'), description: t('auth.social.success.desc') });
      } else if (result.error) {
        const message = errorMessage(result.error);
        if (message) toast({ title: t('auth.social.error.title'), description: message, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={disabled || loading}
      className={`w-full rounded-xl py-5 font-semibold flex items-center justify-center gap-3 border-2 ${brand.className}`}
    >
      <span className="shrink-0 flex items-center justify-center">{brand.icon}</span>
      {loading ? t('auth.social.loading') : label}
    </Button>
  );
};

export default SocialLoginButton;
