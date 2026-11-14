import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, PackageOpen, TrendingUp, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import CompactProductCard from '@/components/products/CompactProductCard';
import { useProducts } from '@/context/ProductsContext';
import { hasDiscount } from '@/utils/pricing';
import { useLanguage } from '@/context/LanguageContext';

type TabId = 'vistos' | 'vendidos' | 'ofertas';

/**
 * Vitrine da home: uma grade contínua com abas de filtro.
 * "Ofertas" e "Mais Vendidos" só aparecem quando há dados reais.
 */
const FeaturedProducts: React.FC = () => {
  const { products, loading } = useProducts();
  const { t } = useLanguage();
  const [tab, setTab] = useState<TabId>('vistos');

  // "Mais Vistos": destaques do admin. Mais de 12 → janela que gira por semana.
  const vistos = useMemo(() => {
    const flagged = products
      .filter((p) => !p.hidden && p.featured)
      .sort((a, b) => (a.featuredAt || '').localeCompare(b.featuredAt || ''));
    const pool = flagged.length > 0 ? flagged : products.filter((p) => !p.hidden);
    if (pool.length <= 12) return pool;
    const weeksSinceEpoch = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const offset = (weeksSinceEpoch * 12) % pool.length;
    return Array.from({ length: 12 }, (_, i) => pool[(offset + i) % pool.length]);
  }, [products]);

  const ofertas = useMemo(() => products.filter((p) => !p.hidden && hasDiscount(p)).slice(0, 12), [products]);

  const vendidos = useMemo(
    () =>
      products
        .filter((p) => !p.hidden && (p.salesCount || 0) > 0)
        .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
        .slice(0, 12),
    [products],
  );

  const tabs = [
    { id: 'vistos' as TabId, label: t('featured.tab.vistos'), icon: Eye, items: vistos },
    ...(vendidos.length > 0 ? [{ id: 'vendidos' as TabId, label: t('featured.tab.vendidos'), icon: TrendingUp, items: vendidos }] : []),
    ...(ofertas.length > 0 ? [{ id: 'ofertas' as TabId, label: t('featured.tab.ofertas'), icon: Zap, items: ofertas }] : []),
  ];

  const activeTab = tabs.find((x) => x.id === tab) || tabs[0];
  const items = activeTab.items;

  return (
    <section className="py-10 sm:py-14" aria-labelledby="featured-title">
      <div className="container mx-auto px-4">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <h2 id="featured-title" className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {t('featured.title')}
            </h2>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">{t('featured.subtitle')}</p>
          </div>
          <Link
            to="/produtos"
            className="inline-flex h-11 w-fit items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('featured.viewAll')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {tabs.length > 1 && (
          <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border scrollbar-hide" role="tablist" aria-label={t('featured.title')}>
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                role="tab"
                key={id}
                onClick={() => setTab(id)}
                aria-selected={tab === id}
                className={cn(
                  '-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        )}

        {!loading && items.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-12 text-center">
            <PackageOpen className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-base font-medium text-foreground">{t('featured.empty.title')}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t('featured.empty.desc')}</p>
            <Link to="/faca-seu-pedido" className="mt-5 inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              {t('featured.empty.cta')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {loading
              ? Array.from({ length: 10 }, (_, idx) => (
                  <div key={idx} className="overflow-hidden rounded-lg border border-border bg-card" aria-hidden="true">
                    <div className="aspect-square bg-muted motion-safe:animate-pulse" />
                    <div className="space-y-2 p-3">
                      <div className="h-4 w-4/5 rounded bg-muted motion-safe:animate-pulse" />
                      <div className="h-4 w-2/3 rounded bg-muted motion-safe:animate-pulse" />
                    </div>
                  </div>
                ))
              : items.map((product) => <CompactProductCard key={product.id} product={product} />)}
          </div>
        )}
      </div>
    </section>
  );
};

export default FeaturedProducts;
