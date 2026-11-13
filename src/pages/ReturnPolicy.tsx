import React from 'react';
import Layout from '@/components/layout/Layout';
import { AlertTriangle } from 'lucide-react';
import { COMPANY_PROFILE } from '@/config/companyProfile';
import { useLanguage } from '@/context/LanguageContext';
import { renderRich } from '@/utils/richText';

const ReturnPolicy: React.FC = () => {
  const { t } = useLanguage();

  const email = (
    <a href={`mailto:${COMPANY_PROFILE.email}`} className="text-primary hover:underline">{COMPANY_PROFILE.email}</a>
  );
  const whatsapp = (
    <a
      href={`https://wa.me/${COMPANY_PROFILE.whatsapp.digits}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {COMPANY_PROFILE.whatsapp.international}
    </a>
  );
  const values = {
    brand: COMPANY_PROFILE.brand,
    contact: COMPANY_PROFILE.contactName,
    address: COMPANY_PROFILE.fulfillmentOrigin.formatted,
  };
  const r = (key: string) => renderRich(t(key), values, key);

  return (
    <Layout>
      <div className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-4xl font-bold text-foreground mb-2">{t('legal.return.title')}</h1>
          <p className="text-muted-foreground text-sm mb-10">{t('legal.lastUpdated')}</p>

          {/* Aviso em destaque */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-10 flex gap-4">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900 leading-relaxed">{r('legal.return.notice')}</p>
          </div>

          <div className="prose prose-gray max-w-none space-y-8 text-foreground/80 leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.return.s1.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.return.s1.li1')}</li>
                <li>{r('legal.return.s1.li2')}</li>
                <li>{r('legal.return.s1.li3')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.return.s2.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.return.s2.li1')}</li>
                <li>{r('legal.return.s2.li2')}</li>
                <li>{r('legal.return.s2.li3')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.return.s3.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.return.s3.li1')}</li>
                <li>{r('legal.return.s3.li2')}</li>
                <li>{r('legal.return.s3.li3')}</li>
                <li>{r('legal.return.s3.li4')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.return.s4.title')}</h2>
              <p>{r('legal.return.s4.p')}</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>{r('legal.return.s4.li1')}</li>
                <li>{r('legal.return.s4.li2')}</li>
                <li>{r('legal.return.s4.li3')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.return.s5.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.return.s5.li1')}</li>
                <li>{r('legal.return.s5.li2')}</li>
                <li>{r('legal.return.s5.li3')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.return.s6.title')}</h2>
              <p>{t('legal.return.s6.p')}</p>
              <ul className="list-none mt-3 space-y-1">
                <li>📧 {t('legal.contact.email')} {email}</li>
                <li>💬 {t('legal.contact.whatsapp')} {whatsapp}</li>
                <li>📍 {t('legal.return.operationalAddress')} {COMPANY_PROFILE.fulfillmentOrigin.formatted} 🇯🇵</li>
              </ul>
            </section>

          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ReturnPolicy;
