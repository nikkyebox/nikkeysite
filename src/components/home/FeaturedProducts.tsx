import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Eye, Zap, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import CompactProductCard from '@/components/products/CompactProductCard';
import ScrollReveal from '@/components/ScrollReveal';
import { useProducts } from '@/context/ProductsContext';
import { hasDiscount } from '@/utils/pricing';
import { useLanguage } from '@/context/LanguageContext';

type TabId = 'vistos' | 'vendidos' | 'ofertas';

/**
 * Grade única de produtos com abas de filtro (estilo Temu: uma grade contínua
 * em vez de várias seções empilhadas com títulos/fundos diferentes).
 * As abas "Ofertas" e "Mais Vendidos" só aparecem quando há dados reais.
 */
const FeaturedProducts: React.FC = () => {
  const { products, loading } = useProducts();
  const { t } = useLanguage();
  const [tab, setTab] = useState<TabId>('vistos');

  // "Mais Vistos": produtos marcados como destaque pelo admin. Mostra no máx. 8 por vez;
  // se houver mais, a janela alterna a cada semana (rotação automática).
  const vistos = useMemo(() => {
    const flagged = products
      .filter(p => !p.hidden && p.featured)
      .sort((a, b) => (a.featuredAt || '').localeCompare(b.featuredAt || ''));

    const pool = flagged.length > 0 ? flagged : products.filter(p => !p.hidden);
    if (pool.length <= 12) return pool;

    const weeksSinceEpoch = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
    const offset = (weeksSinceEpoch * 12) % pool.length;
    const result = [];
    for (let i = 0; i < 12; i++) result.push(pool[(offset + i) % pool.length]);
    return result;
  }, [products]);

  const ofertas = useMemo(
    () => products.filter(p => !p.hidden && hasDiscount(p)).slice(0, 12),
    [products]
  );

  const vendidos = useMemo(
    () =>
      products
        .filter(p => !p.hidden && (p.salesCount || 0) > 0)
        .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
        .slice(0, 12),
    [products]
  );

  const tabs = [
    { id: 'vistos' as TabId, label: t('featured.tab.vistos'), icon: Eye, items: vistos },
    ...(vendidos.length > 0 ? [{ id: 'vendidos' as TabId, label: t('featured.tab.vendidos'), icon: TrendingUp, items: vendidos }] : []),
    ...(ofertas.length > 0 ? [{ id: 'ofertas' as TabId, label: t('featured.tab.ofertas'), icon: Zap, items: ofertas }] : []),
  ];

  const activeTab = tabs.find(t => t.id === tab) || tabs[0];
  const items = activeTab.items;

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-pink-50/25 to-white py-10 sm:py-14">
      <div className="pointer-events-none absolute -left-28 top-20 h-72 w-72 rounded-full bg-fuchsia-200/20 blur-3xl" />
      <div className="container relative mx-auto px-4">
        <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-pink-500">{t('featured.badge')}</p>
            <h2 className="mt-1.5 text-3xl font-black tracking-[-0.035em] text-slate-950 md:text-4xl">{t('featured.title')}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500 md:text-base">{t('featured.subtitle')}</p>
          </div>
          <Link
            to="/produtos"
            className="group inline-flex w-fit items-center gap-2 rounded-2xl border border-pink-100 bg-white px-4 py-2.5 text-sm font-extrabold text-pink-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-md"
          >
            {t('featured.viewAll')}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        <div className="mb-7 flex gap-2 overflow-x-auto rounded-2xl border border-pink-100/80 bg-white/75 p-2 shadow-sm backdrop-blur-xl scrollbar-hide md:w-fit">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'shrink-0 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-all duration-300',
                tab === id
                  ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white shadow-lg shadow-pink-500/20'
                  : 'text-slate-500 hover:bg-pink-50 hover:text-pink-600'
              )}
              aria-pressed={tab === id}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {loading
            ? Array.from({ length: 10 }).map((_, idx) => (
                <div key={idx} className="overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-sm animate-pulse">
                  <div className="aspect-square bg-pink-50" />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-4/5 rounded bg-pink-50" />
                    <div className="h-4 w-2/3 rounded bg-pink-50" />
                  </div>
                </div>
              ))
            : items.map((product, idx) => (
                <ScrollReveal key={product.id} delay={(idx % 5) * 55}>
                  <CompactProductCard product={product} />
                </ScrollReveal>
              ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
