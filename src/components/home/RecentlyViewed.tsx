import React from 'react';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { useProducts } from '@/context/ProductsContext';
import { recentlyViewed } from '@/utils/recentlyViewed';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { effectiveYen } from '@/utils/pricing';
import { convertYen as fxConvert } from '@/services/fxService';
import { useLanguage } from '@/context/LanguageContext';
import { productEnglishName } from '@/utils/productName';

/** Carrossel "Visto Recentemente" — baseado no histórico local do navegador (sem login necessário). */
const RecentlyViewed: React.FC = () => {
  const { products, loading } = useProducts();
  const { selectedCountry } = useLanguage();
  const currency = getCurrencyByCountry(selectedCountry);

  const ids = recentlyViewed.getIds();
  if (loading || ids.length === 0) return null;

  const items = ids
    .map((id) => products.find((p) => p.id === id && !p.hidden))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .slice(0, 8);

  if (items.length === 0) return null;

  return (
    <section className="py-12 bg-gray-50/60 border-y border-gray-100">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-2 mb-6">
          <History className="w-5 h-5 text-gray-500" />
          <h2 className="font-display text-xl md:text-2xl font-bold text-gray-900">Visto Recentemente</h2>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {items.map((product) => {
            const price = fxConvert(effectiveYen(product, 'small'), currency);
            return (
              <Link
                key={product.id}
                to={`/produto/${product.id}`}
                className="group shrink-0 w-36 sm:w-40 bg-white rounded-xl border border-gray-100 overflow-hidden shadow-soft hover:shadow-card transition-all"
              >
                <div className="aspect-square bg-white overflow-hidden">
                  <img
                    src={product.thumbnail || product.image}
                    alt={productEnglishName(product)}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-bold text-gray-800 line-clamp-2 leading-snug min-h-[2.2em]">
                    {productEnglishName(product)}
                  </p>
                  <p className="text-sm font-bold text-primary mt-1">{formatPrice(price, currency)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default RecentlyViewed;
