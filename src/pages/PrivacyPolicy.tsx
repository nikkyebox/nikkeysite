import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { COMPANY_PROFILE } from '@/config/companyProfile';
import { useLanguage } from '@/context/LanguageContext';
import { renderRich } from '@/utils/richText';

const PrivacyPolicy: React.FC = () => {
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
    email,
    cookiesLink: (
      <Link to="/cookies" className="text-primary hover:underline">{t('legal.cookies.title')}</Link>
    ),
  };
  const r = (key: string) => renderRich(t(key), values, key);

  return (
    <Layout>
      <div className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-4xl font-bold text-foreground mb-2">{t('legal.privacy.title')}</h1>
          <p className="text-muted-foreground text-sm mb-10">{t('legal.lastUpdated')}</p>

          <div className="prose prose-gray max-w-none space-y-8 text-foreground/80 leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.privacy.s1.title')}</h2>
              <p>{r('legal.privacy.s1.p1')}</p>
              <p className="mt-2">{r('legal.privacy.s1.p2')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.privacy.s2.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.privacy.s2.li1')}</li>
                <li>{r('legal.privacy.s2.li2')}</li>
                <li>{r('legal.privacy.s2.li3')}</li>
                <li>{r('legal.privacy.s2.li4')}</li>
              </ul>
              <p className="mt-3">{r('legal.privacy.s2.important')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.privacy.s3.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.privacy.s3.li1')}</li>
                <li>{r('legal.privacy.s3.li2')}</li>
                <li>{r('legal.privacy.s3.li3')}</li>
                <li>{r('legal.privacy.s3.li4')}</li>
                <li>{r('legal.privacy.s3.li5')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.privacy.s4.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.privacy.s4.li1')}</li>
                <li>{r('legal.privacy.s4.li2')}</li>
                <li>{r('legal.privacy.s4.li3')}</li>
                <li>{r('legal.privacy.s4.li4')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.privacy.s5.title')}</h2>
              <p>{r('legal.privacy.s5.p1')}</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>{r('legal.privacy.s5.li1')}</li>
                <li>{r('legal.privacy.s5.li2')}</li>
                <li>{r('legal.privacy.s5.li3')}</li>
              </ul>
              <p className="mt-3">{r('legal.privacy.s5.p2')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.privacy.s6.title')}</h2>
              <p>{r('legal.privacy.s6.p1')}</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>{r('legal.privacy.s6.li1')}</li>
                <li>{r('legal.privacy.s6.li2')}</li>
                <li>{r('legal.privacy.s6.li3')}</li>
                <li>{r('legal.privacy.s6.li4')}</li>
                <li>{r('legal.privacy.s6.li5')}</li>
              </ul>
              <p className="mt-3">{r('legal.privacy.s6.p2')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.privacy.s7.title')}</h2>
              <p>{r('legal.privacy.s7.p')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.privacy.s8.title')}</h2>
              <p>{r('legal.privacy.s8.p')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.privacy.s9.title')}</h2>
              <p>{r('legal.privacy.s9.p')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.privacy.s10.title')}</h2>
              <p>{r('legal.privacy.s10.p')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.privacy.s11.title')}</h2>
              <p>{t('legal.privacy.s11.p')}</p>
              <ul className="list-none mt-2 space-y-1">
                <li>📧 {t('legal.contact.email')} {email}</li>
                <li>💬 {t('legal.contact.whatsapp')} {whatsapp}</li>
                <li>📍 {t('legal.contact.address')} {COMPANY_PROFILE.fulfillmentOrigin.formatted} 🇯🇵</li>
              </ul>
            </section>

          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PrivacyPolicy;
