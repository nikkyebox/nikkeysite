import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, MapPin, Package, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/LanguageContext';

const FEATURES = [
  { icon: Truck, titleKey: 'shippingBanner.carrier1.title', descKey: 'shippingBanner.carrier1.desc' },
  { icon: MapPin, titleKey: 'shippingBanner.carrier2.title', descKey: 'shippingBanner.carrier2.desc' },
  { icon: Package, titleKey: 'shippingBanner.carrier3.title', descKey: 'shippingBanner.carrier3.desc' },
  { icon: Clock, titleKey: 'shippingBanner.carrier4.title', descKey: 'shippingBanner.carrier4.desc' },
] as const;

/** Frete internacional: superfície neutra (L1) com o roxo só no ícone e no CTA. */
const ShippingBanner: React.FC = () => {
  const { t } = useLanguage();

  return (
    <section className="border-y border-border bg-muted/40 py-16" aria-labelledby="shipping-banner-title">
      <div className="container mx-auto px-4">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h2 id="shipping-banner-title" className="font-display text-3xl font-semibold tracking-tight lg:text-4xl">
              {t('shipping.title')}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t('shipping.subtitle')}</p>
          </div>
          <Button asChild size="lg" className="shrink-0 gap-2 self-start md:self-auto">
            <Link to="/frete">
              {t('shippingBanner.cta')} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
            <li key={titleKey} className="rounded-lg border border-border bg-background p-5">
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-base font-semibold">{t(titleKey)}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(descKey)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default ShippingBanner;
