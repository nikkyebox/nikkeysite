import React from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { COMPANY_PROFILE } from '@/config/companyProfile';
import { useLanguage } from '@/context/LanguageContext';
import { renderRich } from '@/utils/richText';

const TermsOfService: React.FC = () => {
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
    whatsappNumber: <strong>{COMPANY_PROFILE.whatsapp.international}</strong>,
    returnLink: (
      <Link to="/devolucao" className="text-primary hover:underline">{t('legal.return.title')}</Link>
    ),
  };
  const r = (key: string) => renderRich(t(key), values, key);

  return (
    <Layout>
      <div className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-4xl font-bold text-foreground mb-2">{t('legal.terms.title')}</h1>
          <p className="text-muted-foreground text-sm mb-10">{t('legal.lastUpdated')}</p>

          <div className="prose prose-gray max-w-none space-y-8 text-foreground/80 leading-relaxed">

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.terms.s1.title')}</h2>
              <p>{r('legal.terms.s1.p')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.terms.s2.title')}</h2>
              <p>{r('legal.terms.s2.p1')}</p>
              <p className="mt-3">{r('legal.terms.s2.p2')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.terms.s3.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.terms.s3.li1')}</li>
                <li>{r('legal.terms.s3.li2')}</li>
                <li>{r('legal.terms.s3.li3')}</li>
                <li>{r('legal.terms.s3.li4')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.terms.s4.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.terms.s4.li1')}</li>
                <li>{r('legal.terms.s4.li2')}</li>
                <li>{r('legal.terms.s4.li3')}</li>
                <li>{r('legal.terms.s4.li4')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.terms.s5.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.terms.s5.li1')}</li>
                <li>{r('legal.terms.s5.li2')}</li>
                <li>{r('legal.terms.s5.li3')}</li>
                <li>{r('legal.terms.s5.li4')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.terms.s6.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.terms.s6.li1')}</li>
                <li>{r('legal.terms.s6.li2')}</li>
                <li>{r('legal.terms.s6.li3')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.terms.s7.title')}</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>{r('legal.terms.s7.li1')}</li>
                <li>{r('legal.terms.s7.li2')}</li>
                <li>{r('legal.terms.s7.li3')}</li>
                <li>{r('legal.terms.s7.li4')}</li>
                <li>{r('legal.terms.s7.li5')}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.terms.s8.title')}</h2>
              <p>{r('legal.terms.s8.p')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.terms.s9.title')}</h2>
              <p>{r('legal.terms.s9.p')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.terms.s10.title')}</h2>
              <p>{r('legal.terms.s10.p')}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">{t('legal.terms.s11.title')}</h2>
              <ul className="list-none space-y-1">
                <li>📧 {t('legal.contact.email')} {email}</li>
                <li>💬 {t('legal.contact.whatsapp')} {whatsapp}</li>
                <li>📍 {t('legal.contact.location')} {COMPANY_PROFILE.fulfillmentOrigin.shortPt} 🇯🇵</li>
              </ul>
            </section>

          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TermsOfService;
