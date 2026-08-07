import React from 'react';
import { Link } from 'react-router-dom';
import { Truck, MapPin, Package, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/LanguageContext';

const ShippingBanner: React.FC = () => {
  const { t } = useLanguage();

  const features = [
    { icon: Truck, titleKey: 'shippingBanner.carrier1.title', descKey: 'shippingBanner.carrier1.desc' },
    { icon: MapPin, titleKey: 'shippingBanner.carrier2.title', descKey: 'shippingBanner.carrier2.desc' },
    { icon: Package, titleKey: 'shippingBanner.carrier3.title', descKey: 'shippingBanner.carrier3.desc' },
    { icon: Clock, titleKey: 'shippingBanner.carrier4.title', descKey: 'shippingBanner.carrier4.desc' },
  ];

  return (
    <section className="py-20 gradient-caramel text-primary-foreground relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-full h-full" 
          style={{ 
            backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }} 
        />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-12">
          <h2 className="font-display text-4xl lg:text-5xl font-bold mb-4">
            {t('shipping.title')}
          </h2>
          <p className="text-primary-foreground/80 max-w-2xl mx-auto text-lg">
            {t('shipping.subtitle')}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {features.map((feature, index) => (
            <div 
              key={feature.titleKey}
              className="bg-primary-foreground/10 backdrop-blur-sm rounded-2xl p-6 text-center hover:bg-primary-foreground/15 transition-colors"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="w-14 h-14 rounded-full bg-primary-foreground/20 flex items-center justify-center mx-auto mb-4">
                <feature.icon className="w-7 h-7" />
              </div>
              <h3 className="font-display text-lg font-semibold mb-1">
                {t(feature.titleKey)}
              </h3>
              <p className="text-sm text-primary-foreground/70">
                {t(feature.descKey)}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Button asChild size="lg" variant="secondary" className="rounded-full px-8 text-base font-semibold">
            <Link to="/frete">
              {t('shippingBanner.cta')}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default ShippingBanner;
