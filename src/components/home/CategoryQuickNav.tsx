import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useProducts } from '@/context/ProductsContext';
import { categoryService, DEFAULT_CATEGORIES, type ProductCategory } from '@/services/categoryService';
import { useLanguage } from '@/context/LanguageContext';

/** Atalhos por categoria na home, com contagem real de produtos. */
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
    <section className="pb-2 pt-2" aria-labelledby="category-nav-title">
      <div className="container mx-auto px-4">
        <h2 id="category-nav-title" className="mb-3 text-sm font-medium text-muted-foreground">
          {t('filter.categories')}
        </h2>
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-hide sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {loading
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="h-14 w-40 shrink-0 rounded-lg bg-muted motion-safe:animate-pulse" aria-hidden="true" />
              ))
            : visibleCategories.map((cat) => (
                <li key={cat.id} className="shrink-0">
                  <Link
                    to={`/produtos/${cat.id}`}
                    className="group flex h-14 min-w-[160px] items-center gap-3 rounded-lg border border-border bg-card pl-2 pr-3 transition-colors duration-150 hover:border-primary/40 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-xl" aria-hidden="true">
                      {cat.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{cat.label}</span>
                      <span className="block text-xs text-muted-foreground">{t('ui.itemCount').replace('{n}', String(counts[cat.id]))}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-safe:group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
        </ul>
      </div>
    </section>
  );
};

export default CategoryQuickNav;
