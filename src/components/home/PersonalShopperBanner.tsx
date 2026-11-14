import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, MessageCircle, PackageSearch, ShieldCheck } from 'lucide-react';
import { COMPANY_PROFILE } from '@/config/companyProfile';
import { useLanguage } from '@/context/LanguageContext';

const WHATSAPP_TEXT = encodeURIComponent(
  'Olá NikkeyBox! Quero cotar um produto específico do Japão que não encontrei no site. Como funciona a encomenda personalizada?',
);
const WHATSAPP_HREF = `https://wa.me/${COMPANY_PROFILE.whatsapp.digits}?text=${WHATSAPP_TEXT}`;

/** Personal Shopper: cartão L1 com um CTA primário (WhatsApp) e um secundário (formulário). */
export const PersonalShopperBanner: React.FC = () => {
  const { t } = useLanguage();

  return (
    <section className="py-10 sm:py-14" aria-labelledby="ps-title">
      <div className="container mx-auto px-4">
        <div className="flex flex-col gap-8 rounded-lg border border-border bg-card p-6 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-primary">{t('ui.ps.badge')}</p>
            <h2 id="ps-title" className="mt-2 font-display text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
              {t('ui.ps.title1')} {t('ui.ps.title2')}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t('ui.ps.desc')}</p>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" /> {t('ui.ps.authentic')}</li>
              <li className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" aria-hidden="true" /> {t('ui.ps.quote')}</li>
              <li className="flex items-center gap-1.5"><PackageSearch className="h-4 w-4 text-primary" aria-hidden="true" /> {t('ui.ps.consolidate')}</li>
            </ul>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row lg:w-auto lg:flex-col">
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              {t('ui.ps.whatsapp')}
            </a>
            <Link
              to="/faca-seu-pedido"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 text-base font-semibold text-foreground transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('ui.ps.form')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PersonalShopperBanner;
