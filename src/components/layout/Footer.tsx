import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Instagram, Facebook, Mail, MapPin, MessageCircle, Smartphone, Twitter } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { COMPANY_PROFILE } from '@/config/companyProfile';

const WHATSAPP_NUMBER = COMPANY_PROFILE.whatsapp.digits;
const INSTAGRAM_URL = 'https://www.instagram.com/nikkey_box_official/';
const FACEBOOK_URL = 'https://www.facebook.com/nikkeyboxoficial';
const TIKTOK_URL = 'https://www.tiktok.com/@nikkeyboxoficial';
const X_URL = 'https://x.com/nikkeybox_of';
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;
const CONTACT_EMAIL = COMPANY_PROFILE.email;
import { useLanguage } from '@/context/LanguageContext';

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
    <footer className="bg-accent text-accent-foreground">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex flex-col leading-tight mb-4">
              <span className="font-display text-lg font-bold tracking-tight">Nikkey</span>
              <span className="animate-nikkeybox-pulse font-display font-extrabold text-sm tracking-tight text-accent-foreground/90">Box</span>
            </div>
            <p className="text-accent-foreground/80 text-sm leading-relaxed max-w-md">
              {t('footer.description')}
            </p>
            <div className="flex items-center gap-4 mt-6">
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram @nikkey_box_official"
                className="p-2 rounded-full bg-primary/20 hover:bg-primary/30 transition-colors"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook nikkeyboxoficial"
                className="p-2 rounded-full bg-primary/20 hover:bg-primary/30 transition-colors"
              >
                <Facebook className="w-5 h-5" />
              </a>
              <a
                href={TIKTOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok @nikkeyboxoficial"
                className="p-2 rounded-full bg-primary/20 hover:bg-primary/30 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.77a4.85 4.85 0 0 1-1.01-.08z"/>
                </svg>
              </a>
              <a
                href={X_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter) @nikkeybox_of"
                className="p-2 rounded-full bg-primary/20 hover:bg-primary/30 transition-colors"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="p-2 rounded-full bg-green-500/80 hover:bg-green-500 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
              </a>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="p-2 rounded-full bg-primary/20 hover:bg-primary/30 transition-colors"
              >
                <Mail className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-semibold mb-4">{t('footer.links')}</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/produtos" className="text-sm text-accent-foreground/80 hover:text-accent-foreground transition-colors">
                  {t('nav.products')}
                </Link>
              </li>
              <li>
                <Link to="/vlog" className="text-sm text-accent-foreground/80 hover:text-accent-foreground transition-colors">
                  {t('nav.vlog')}
                </Link>
              </li>
              <li>
                <Link to="/frete" className="text-sm text-accent-foreground/80 hover:text-accent-foreground transition-colors">
                  {t('nav.shipping')}
                </Link>
              </li>
              <li>
                <Link to="/sobre" className="text-sm text-accent-foreground/80 hover:text-accent-foreground transition-colors">
                  {t('nav.about')}
                </Link>
              </li>
              <li>
                <Link to="/afiliado" className="text-sm text-accent-foreground/80 hover:text-accent-foreground transition-colors">
                  {t('footer.affiliate')}
                </Link>
              </li>
              {!isInstalled && (
                <li className="pt-1">
                  <button
                    onClick={handleInstallClick}
                    className="flex items-center gap-1.5 text-sm text-purple-300 hover:text-purple-200 font-semibold transition-colors"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    {platform === 'ios' ? t('footer.appInstallIOS') : t('footer.appInstall')}
                  </button>
                  {showIOSHint && (
                    <p className="text-xs text-accent-foreground/50 mt-1 leading-snug">
                      {t('footer.iosHint')}
                    </p>
                  )}
                </li>
              )}
              {isInstalled && (
                <li className="pt-1">
                  <span className="text-xs text-green-400 flex items-center gap-1">{t('footer.appInstalled')}</span>
                </li>
              )}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display font-semibold mb-4">{t('footer.contact')}</h4>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 text-primary" />
                <span className="text-sm text-accent-foreground/80">
                  {isJapan ? COMPANY_PROFILE.fulfillmentOrigin.formattedJa : COMPANY_PROFILE.fulfillmentOrigin.formatted}
                </span>
              </div>
              <a href={`mailto:${CONTACT_EMAIL}`} className="flex items-start gap-2 group">
                <Mail className="w-4 h-4 mt-0.5 text-primary" />
                <span className="text-sm text-accent-foreground/80 group-hover:text-accent-foreground transition-colors break-all">
                  {CONTACT_EMAIL}
                </span>
              </a>
              <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 group">
                <MessageCircle className="w-4 h-4 mt-0.5 text-green-400" />
                <span className="text-sm text-accent-foreground/80 group-hover:text-accent-foreground transition-colors">
                  WhatsApp: {COMPANY_PROFILE.whatsapp.international}
                </span>
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-accent-foreground/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-accent-foreground/60">
            © {new Date().getFullYear()} NikkeyBox. {t('footer.rights')}
          </p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <Link to="/privacidade" className="text-xs text-accent-foreground/50 hover:text-accent-foreground/80 transition-colors">
              {t('footer.privacy')}
            </Link>
            <Link to="/termos" className="text-xs text-accent-foreground/50 hover:text-accent-foreground/80 transition-colors">
              {t('footer.terms')}
            </Link>
            <Link to="/cookies" className="text-xs text-accent-foreground/50 hover:text-accent-foreground/80 transition-colors">
              {t('footer.cookies')}
            </Link>
            <Link to="/devolucao" className="text-xs text-accent-foreground/50 hover:text-accent-foreground/80 transition-colors">
              {t('footer.returns') || 'Devolução'}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
