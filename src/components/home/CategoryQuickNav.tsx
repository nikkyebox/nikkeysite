import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProducts } from '@/context/ProductsContext';
import { categoryService, DEFAULT_CATEGORIES, type ProductCategory } from '@/services/categoryService';
import { useLanguage } from '@/context/LanguageContext';

/** Navegação rápida por categoria na home — cards clicáveis com contagem real de produtos. */
const CategoryQuickNav: React.FC = () => {
  const { products, loading } = useProducts();
  const { t } = useLanguage();
  const [categories, setCategories] = useState<ProductCategory[]>(DEFAULT_CATEGORIES);

  useEffect(() => {
    categoryService.getAll().then(setCategories).catch(() => {});
  }, []);

  const counts = products.reduce<Record<string, number>>((acc, p) => {
    if (p.hidden) return acc;
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  const visibleCategories = categories.filter((c) => counts[c.id] > 0);
  if (!loading && visibleCategories.length === 0) return null;

  return (
    <section className="relative overflow-hidden border-y border-pink-100/70 bg-gradient-to-b from-white via-pink-50/35 to-white py-6 sm:py-8">
      <div className="pointer-events-none absolute -right-20 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-pink-200/25 blur-3xl" />
      <div className="container relative mx-auto px-4">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-pink-500">{t('featured.badge')}</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{t('nav.products')}</h2>
          </div>
          <span className="hidden text-xs font-semibold text-slate-400 sm:block">{t('featured.subtitle')}</span>
        </div>

        <div className="flex gap-3 overflow-x-auto px-1 pb-3 pt-1 scrollbar-hide sm:flex-wrap sm:overflow-visible sm:pb-0">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[76px] w-36 shrink-0 animate-pulse rounded-2xl bg-pink-50" />
              ))
            : visibleCategories.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/produtos/${cat.id}`}
                  className="category-depth-card group relative flex min-w-[148px] shrink-0 items-center gap-3 overflow-hidden rounded-2xl border border-pink-100 bg-white/85 px-3.5 py-3 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-pink-200 hover:shadow-xl hover:shadow-pink-200/35"
                >
                  <span className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-pink-100/60 transition-transform duration-500 group-hover:scale-150" aria-hidden="true" />
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-50 to-fuchsia-100 text-2xl shadow-inner ring-1 ring-white transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                    {cat.icon}
                  </span>
                  <span className="relative min-w-0">
                    <span className="block truncate text-xs font-extrabold text-slate-800">{cat.label}</span>
                    <span className="mt-1 block text-[10px] font-bold text-pink-500">{counts[cat.id]} itens</span>
                  </span>
                </Link>
              ))}
        </div>
      </div>
    </section>
  );
};

export default CategoryQuickNav;
