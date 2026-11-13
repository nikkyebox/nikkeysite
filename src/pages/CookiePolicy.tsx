import React from 'react';
import Layout from '@/components/layout/Layout';
import { COMPANY_PROFILE } from '@/config/companyProfile';
import { useLanguage } from '@/context/LanguageContext';
import { renderRich } from '@/utils/richText';

const CookiePolicy: React.FC = () => {
  const { t } = useLanguage();

  const email = (
    <a href={`mailto:${COMPANY_PROFILE.email}`} className="text-primary hover:underline">{COMPANY_PROFILE.email}</a>
  );
  const values = {
    brand: COMPANY_PROFILE.brand,
    contact: COMPANY_PROFILE.contactName,
    googleLink: (
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
        {t('legal.cookies.s4.googleLink')}
      </a>
    ),
    youtubeLink: (
      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
        {t('legal.cookies.s4.youtubeLink')}
      </a>
    ),
  };
  const r = (key: string) => renderRich(t(key), values, key);

  return (
    <Layout>
      <div className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-4xl font-bold text-foreground mb-2">{t('legal.cookies.title')}</h1>
          <p className="text-muted-foreground text-sm mb-10">{t('legal.lastUpdated')}</p>

          <div className="prose prose-gray max-w-none space-y-8 text-foreground/80 leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.cookies.s1.title')}</h2>
              <p>{t('legal.cookies.s1.p')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.cookies.s2.title')}</h2>

              <div className="space-y-5 mt-2">
                <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl">
                  <h3 className="font-semibold text-green-800 dark:text-green-300 mb-1">{t('legal.cookies.s2.essential.title')}</h3>
                  <p className="text-sm">{t('legal.cookies.s2.essential.p')}</p>
                  <ul className="list-disc pl-5 mt-2 text-sm space-y-1">
                    <li><code>nikkeybox-users</code> — {t('legal.cookies.s2.essential.users')}</li>
                    <li><code>cart</code> — {t('legal.cookies.s2.essential.cart')}</li>
                    <li><code>loginAs</code> — {t('legal.cookies.s2.essential.loginAs')}</li>
                    <li><code>maintenance_state</code> — {t('legal.cookies.s2.essential.maintenance')}</li>
                    <li><code>cookie_consent</code> — {t('legal.cookies.s2.essential.consent')}</li>
                    <li><code>pwa_install_dismissed</code> — {t('legal.cookies.s2.essential.pwa')}</li>
                  </ul>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-1">{t('legal.cookies.s2.analytics.title')}</h3>
                  <p className="text-sm">{t('legal.cookies.s2.analytics.p')}</p>
                  <ul className="list-disc pl-5 mt-2 text-sm space-y-1">
                    <li>{r('legal.cookies.s2.analytics.firebase')}</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">{t('legal.cookies.s2.analytics.note')}</p>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800/20 border border-gray-200 dark:border-gray-700 rounded-xl">
                  <h3 className="font-semibold text-foreground mb-1">{t('legal.cookies.s2.local.title')}</h3>
                  <p className="text-sm">{r('legal.cookies.s2.local.p')}</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.cookies.s3.title')}</h2>
              <p>{t('legal.cookies.s3.p')}</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>{r('legal.cookies.s3.li1')}</li>
                <li>{r('legal.cookies.s3.li2')}</li>
              </ul>
              <p className="mt-3 text-sm text-muted-foreground">{t('legal.cookies.s3.warn')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.cookies.s4.title')}</h2>
              <p>{t('legal.cookies.s4.p')}</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>{r('legal.cookies.s4.firebase')}</li>
                <li>{r('legal.cookies.s4.youtube')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.cookies.s5.title')}</h2>
              <p>{t('legal.cookies.s5.p')}</p>
              <ul className="list-none mt-2 space-y-1">
                <li>📧 {email}</li>
                <li>💬 {t('legal.contact.whatsapp')} {COMPANY_PROFILE.whatsapp.international}</li>
                <li>📍 {COMPANY_PROFILE.fulfillmentOrigin.shortPt} 🇯🇵</li>
              </ul>
              <p className="mt-3">{r('legal.cookies.s5.last')}</p>
            </section>

          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CookiePolicy;
