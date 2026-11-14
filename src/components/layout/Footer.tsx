import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Mail, MapPin, MessageCircle, Smartphone } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { COMPANY_PROFILE } from '@/config/companyProfile';
import { PWA_INSTALL_ENABLED } from '@/config/featureFlags';
import { useLanguage } from '@/context/LanguageContext';

const WHATSAPP_LINK = `https://wa.me/${COMPANY_PROFILE.whatsapp.digits}`;
const CONTACT_EMAIL = COMPANY_PROFILE.email;

// Só perfis que existem. Facebook e X apontavam para `/teste` — link morto
// na vitrine é pior do que link nenhum. Adicione aqui quando forem criados.
const SOCIAL = [
  { href: 'https://www.instagram.com/nikkeybox/', labelKey: 'footer.social.instagram', icon: Instagram },
  { href: 'https://www.tiktok.com/@nikkeybox', labelKey: 'footer.social.tiktok', icon: null },
  { href: WHATSAPP_LINK, labelKey: 'footer.social.whatsapp', icon: MessageCircle },
  { href: `mailto:${CONTACT_EMAIL}`, labelKey: 'footer.social.email', icon: Mail },
] as const;

const TikTokIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.77a4.85 4.85 0 0 1-1.01-.08z" />
  </svg>
);

const linkClass = 'text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground';

const Footer: React.FC = () => {
  const { t, selectedCountry } = useLanguage();
  const isJapan = selectedCountry === 'Japão';
  const { platform, isInstalled, install } = usePWAInstall();
  const [showIOSHint, setShowIOSHint] = useState(false);

  const handleInstallClick = async () => {
    const result = await install();
    if (result === 'ios' || result === 'desktop') setShowIOSHint(true);
  };

  return (
    // pb-24 no mobile: o botão flutuante do WhatsApp não cobre os links legais.
    <footer className="border-t border-border bg-muted/40 text-foreground">
      <div className="container mx-auto px-4 pb-24 pt-12 md:pb-12">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="whitespace-nowrap font-display text-lg font-semibold tracking-tight">
              Nikkey<span className="text-primary">Box</span>
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{t('footer.description')}</p>
            <ul className="mt-6 flex items-center gap-2">
              {SOCIAL.map(({ href, labelKey, icon: Icon }) => {
                const label = t(labelKey).replace('{email}', CONTACT_EMAIL);
                return (
                <li key={href}>
                  <a
                    href={href}
                    target={href.startsWith('mailto:') ? undefined : '_blank'}
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : <TikTokIcon />}
                  </a>
                </li>
                );
              })}
            </ul>
          </div>

          <nav aria-label={t('footer.links')}>
            <h2 className="mb-4 text-sm font-semibold">{t('footer.links')}</h2>
            <ul className="space-y-3">
              <li><Link to="/produtos" className={linkClass}>{t('nav.products')}</Link></li>
              <li><Link to="/vlog" className={linkClass}>{t('nav.vlog')}</Link></li>
              <li><Link to="/frete" className={linkClass}>{t('nav.shipping')}</Link></li>
              <li><Link to="/sobre" className={linkClass}>{t('nav.about')}</Link></li>
              <li><Link to="/afiliado" className={linkClass}>{t('footer.affiliate')}</Link></li>
              {PWA_INSTALL_ENABLED && !isInstalled && (
                <li>
                  <button onClick={handleInstallClick} className={`${linkClass} flex items-center gap-1.5`}>
                    <Smartphone className="h-4 w-4" aria-hidden="true" />
                    {platform === 'ios' ? t('footer.appInstallIOS') : t('footer.appInstall')}
                  </button>
                  {showIOSHint && <p className="mt-1 text-xs leading-snug text-muted-foreground">{t('footer.iosHint')}</p>}
                </li>
              )}
            </ul>
          </nav>

          <div>
            <h2 className="mb-4 text-sm font-semibold">{t('footer.contact')}</h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{isJapan ? COMPANY_PROFILE.fulfillmentOrigin.formattedJa : COMPANY_PROFILE.fulfillmentOrigin.formatted}</span>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-start gap-2 break-all transition-colors duration-150 hover:text-foreground">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 transition-colors duration-150 hover:text-foreground">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  WhatsApp: {COMPANY_PROFILE.whatsapp.international}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} NikkeyBox. {t('footer.rights')}</p>
          <nav aria-label={t('footer.policies')} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link to="/privacidade" className={linkClass}>{t('footer.privacy')}</Link>
            <Link to="/termos" className={linkClass}>{t('footer.terms')}</Link>
            <Link to="/cookies" className={linkClass}>{t('footer.cookies')}</Link>
            <Link to="/devolucao" className={linkClass}>{t('footer.returns')}</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
