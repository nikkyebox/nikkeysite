import React from 'react';
import { Link } from 'react-router-dom';
import { Tag, ArrowRight } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import CompactProductCard from '@/components/products/CompactProductCard';
import { useProducts } from '@/context/ProductsContext';
import { hasDiscount } from '@/utils/pricing';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/LanguageContext';

const Offers: React.FC = () => {
  const { products, loading } = useProducts();
  const { t } = useLanguage();
  const offers = products.filter((p) => !p.hidden && hasDiscount(p));

  return (
    <Layout>
      <div className="gradient-hero py-10">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <span className="inline-flex items-center gap-2 bg-red-600 text-white text-xs font-extrabold px-3 py-1 rounded-full mb-3">
            <Tag className="w-3.5 h-3.5" /> {t('offers.badge')}
          </span>
          <h1 className="font-display text-3xl lg:text-4xl font-bold text-foreground mb-2">{t('offers.title')}</h1>
          <p className="text-muted-foreground">{t('offers.subtitle')}</p>
        </div>
      </div>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div key={idx} className="rounded-lg border border-border bg-card overflow-hidden animate-pulse">
                  <div className="aspect-square bg-secondary" />
                  <div className="p-2 space-y-2">
                    <div className="h-3 bg-secondary rounded w-4/5" />
                    <div className="h-4 bg-secondary rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : offers.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
              {offers.map((product) => (
                <CompactProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 max-w-md mx-auto">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
                <Tag className="w-7 h-7 text-muted-foreground" />
              </div>
              <h2 className="font-display text-xl font-bold text-foreground mb-2">{t('offers.empty.title')}</h2>
              <p className="text-muted-foreground mb-5">{t('offers.empty.desc')}</p>
              <Button asChild className="btn-primary gap-2">
                <Link to="/produtos">{t('offers.empty.cta')} <ArrowRight className="w-4 h-4" /></Link>
              </Button>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default Offers;
