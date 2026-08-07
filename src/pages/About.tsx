import React from 'react';
import { Heart, Star, Users, Award, MessageCircle, MapPin, Mail, Phone } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { useLanguage } from '@/context/LanguageContext';
import { COMPANY_PROFILE } from '@/config/companyProfile';

const About: React.FC = () => {
  const { t } = useLanguage();

  const values = [
    { icon: Heart, titleKey: 'aboutPage.value1.title', descKey: 'aboutPage.value1.desc' },
    { icon: Star, titleKey: 'aboutPage.value2.title', descKey: 'aboutPage.value2.desc' },
    { icon: Users, titleKey: 'aboutPage.value3.title', descKey: 'aboutPage.value3.desc' },
    { icon: Award, titleKey: 'aboutPage.value4.title', descKey: 'aboutPage.value4.desc' },
  ];

  return (
    <Layout>
      {/* Hero — Quem Somos */}
      <div className="gradient-hero py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto space-y-5">
            <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground leading-tight">
              {t('aboutPage.hero.title')}
            </h1>
            <p className="text-muted-foreground leading-relaxed">{t('aboutPage.hero.p1')}</p>
            <p className="text-muted-foreground leading-relaxed">{t('aboutPage.hero.p2')}</p>
            <p className="text-muted-foreground leading-relaxed">{t('aboutPage.hero.p3')}</p>
            <p className="text-muted-foreground leading-relaxed">{t('aboutPage.hero.p4')}</p>
            <p className="font-display font-semibold text-foreground">{t('aboutPage.hero.tagline')}</p>
          </div>
        </div>
      </div>

      {/* Values */}
      <section className="py-20 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-foreground mb-4">
              {t('aboutPage.valuesTitle')}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t('aboutPage.valuesSubtitle')}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value) => (
              <div key={value.titleKey} className="p-6 rounded-2xl bg-background border border-border text-center">
                <div className="w-14 h-14 rounded-full gradient-caramel flex items-center justify-center mx-auto mb-4">
                  <value.icon className="w-7 h-7 text-primary-foreground" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                  {t(value.titleKey)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(value.descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contato */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center mb-10">
            <h2 className="font-display text-3xl font-bold text-foreground mb-3">
              {t('aboutPage.contactTitle')}
            </h2>
            <p className="text-muted-foreground">{t('aboutPage.contactSubtitle')}</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-border bg-card text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{t('aboutPage.contact.addressLabel')}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {COMPANY_PROFILE.fulfillmentOrigin.formatted} 🇯🇵
              </p>
            </div>
            <a
              href={`https://wa.me/${COMPANY_PROFILE.whatsapp.digits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-border bg-card text-center hover:border-green-500/50 hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors group"
            >
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                <MessageCircle className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="font-semibold text-foreground">{t('aboutPage.contact.whatsappLabel')}</h3>
              <p className="text-sm text-muted-foreground">{COMPANY_PROFILE.whatsapp.international}</p>
            </a>
            <a
              href={`mailto:${COMPANY_PROFILE.email}`}
              className="flex flex-col items-center gap-3 p-6 rounded-2xl border border-border bg-card text-center hover:border-primary/50 hover:bg-primary/5 transition-colors group"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{t('aboutPage.contact.emailLabel')}</h3>
              <p className="text-sm text-muted-foreground break-all">{COMPANY_PROFILE.email}</p>
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 gradient-caramel text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4">
            {t('aboutPage.ctaTitle')}
          </h2>
          <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">
            {t('aboutPage.ctaDesc')}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="/produtos"
              className="px-8 py-3 bg-background text-foreground rounded-full font-semibold hover:bg-background/90 transition-colors"
            >
              {t('aboutPage.ctaProducts')}
            </a>
            <a
              href="mailto:contato@nikkeybox-store.com"
              className="px-8 py-3 border-2 border-primary-foreground rounded-full font-semibold hover:bg-primary-foreground/10 transition-colors"
            >
              {t('aboutPage.ctaContact')}
            </a>
            <a
              href="https://wa.me/817013671679"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-3 bg-green-500 text-white rounded-full font-semibold hover:bg-green-600 transition-colors inline-flex items-center gap-2"
            >
              <MessageCircle className="w-5 h-5" /> WhatsApp
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default About;
