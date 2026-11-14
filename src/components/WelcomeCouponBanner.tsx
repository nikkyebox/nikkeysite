import React from 'react';
import { Link } from 'react-router-dom';
import { Gift, X } from 'lucide-react';
import { useUser } from '@/context/UserContext';
import { useLanguage } from '@/context/LanguageContext';
import { safeStorage } from '@/utils/storage';
import { SIGNUP_POPUPS_ENABLED } from '@/config/featureFlags';

const DISMISS_KEY = 'welcome_banner_dismissed_at';
const DISMISS_DAYS = 3;

/**
 * Faixa do cupom de boas-vindas (BEMVINDO10) para quem não está logado.
 * Superfície neutra com o código em destaque; dispensável por alguns dias.
 */
const WelcomeCouponBanner: React.FC<{ context?: 'home' | 'cart' }> = ({ context = 'home' }) => {
  const { isAuthenticated } = useUser();
  const { t } = useLanguage();
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const raw = safeStorage.getItem(DISMISS_KEY);
    if (raw && Date.now() - Number(raw) < DISMISS_DAYS * 86400000) setDismissed(true);
  }, []);

  if (!SIGNUP_POPUPS_ENABLED || isAuthenticated || dismissed) return null;

  const dismiss = () => {
    safeStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <div className="container mx-auto px-4 py-2">
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 py-2 pl-3 pr-1 text-sm text-foreground">
        <Gift className="hidden h-5 w-5 shrink-0 text-primary sm:block" aria-hidden="true" />
        <p className="min-w-0 flex-1 leading-snug">
          {context === 'cart' ? `${t('welcomeBanner.cart')} ` : ''}
          {t('welcomeBanner.text')} <strong className="font-semibold">{t('welcomeBanner.discount')}</strong>
          <span className="hidden sm:inline">
            {' '}· {t('welcomeBanner.codeLabel')}{' '}
            <code className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-xs font-semibold">{t('welcomeBanner.code')}</code>
          </span>{' '}
          <Link to="/cadastro" className="whitespace-nowrap font-semibold text-primary underline underline-offset-2 hover:no-underline">
            {t('welcomeBanner.cta')}
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('welcomeBanner.close')}
          title={t('welcomeBanner.close')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default WelcomeCouponBanner;
