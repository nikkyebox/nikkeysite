import React, { useEffect, useMemo, useState } from 'react';
import HeroCarousel, { CarouselSlide } from './HeroCarousel';
import { useLanguage } from '@/context/LanguageContext';
import { useProducts } from '@/context/ProductsContext';
import { db } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { convertYen as fxConvert } from '@/services/fxService';
import { effectiveYen, baseYen, getVariants } from '@/utils/pricing';
import { PROMO_TYPES, ActivePromo } from '@/types/promotion';
import { Product } from '@/types';
import { productEnglishName } from '@/utils/productName';
import { cdnImage } from '@/services/cloudinaryService';

// Assets locais do projeto — evita depender de host externo (Unsplash) que pode
// falhar por CSP/rede em alguns ambientes de preview.
const STORE_IMAGE = '/icons/icon-512x512.png';

const productImage = (p: Product) => p.gallery?.[0] || p.image || p.thumbnail || STORE_IMAGE;

/**
 * Carrossel da home, nesta ordem:
 * 1. cartão do hero (layout 'center') = 1º produto marcado como destaque no admin;
 * 2. promoção ativa (siteContent/homePromotion);
 * 3. demais produtos marcados como destaque (layout 'split').
 * Sem produto marcado, o cartão do hero não aparece. Não requer mudança no painel admin.
 */
const PromoCarouselSection: React.FC = () => {
  const { t, selectedCountry } = useLanguage();
  const { products } = useProducts();
  const [promo, setPromo] = useState<ActivePromo | null | undefined>(undefined);

  useEffect(() => {
    if (!db) { setPromo(null); return; }
    getDoc(doc(db, 'siteContent', 'homePromotion'))
      .then((snap) => setPromo(snap.exists() ? (snap.data() as ActivePromo) : null))
      .catch(() => setPromo(null));
  }, []);

  const currency = getCurrencyByCountry(selectedCountry);
  const convertYen = (yen: number) => fxConvert(yen, currency);

  // Produtos marcados "Hero Carrossel" no admin (campo `heroCarousel`, distinto
  // de `featured` — que alimenta a grade "Mais Vistos" em FeaturedProducts.tsx).
  // Até 4, mostra todos; acima disso, sorteia 4 diferentes a cada visita (sem
  // repetir dentro do próprio sorteio), como o texto do admin promete.
  const heroProducts = useMemo(
    () => products.filter(p => !p.hidden && p.heroCarousel),
    [products]
  );
  const featured = useMemo(() => {
    if (heroProducts.length <= 4) return heroProducts;
    const shuffled = [...heroProducts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, [heroProducts]);

  const slides: CarouselSlide[] = useMemo(() => {
    // Preço da variante mais barata (com promoção, se houver), na moeda do visitante.
    const pricesOf = (p: Product) => {
      const firstVariant = [...getVariants(p)].sort((a, b) => a.price - b.price)[0];
      const variantId = firstVariant?.id || 'small';
      const price = convertYen(effectiveYen(p, variantId));
      const original = convertYen(baseYen(p, variantId));
      return {
        pricePromo: formatPrice(price, currency),
        priceOriginal: original > price ? formatPrice(original, currency) : undefined,
      };
    };

    // 1º produto marcado vira o cartão do hero; os demais viram slides próprios (abaixo).
    const [heroProduct, ...otherProducts] = featured;
    const list: CarouselSlide[] = heroProduct ? [
      {
        id: `hero-${heroProduct.id}`,
        image: productImage(heroProduct),
        layout: 'center',
        badge: t('featured.badge') || 'Seleção em destaque',
        title: productEnglishName(heroProduct),
        ...pricesOf(heroProduct),
        ctaLabel: t('featured.details') || 'Ver detalhes',
        ctaLink: `/produto/${heroProduct.id}`,
        secondaryCtaLabel: t('hero.cta.products') || 'Ver produtos',
        secondaryCtaLink: '/produtos',
      },
    ] : [];

    if (promo) {
      list.push({
        id: 'promo',
        image: cdnImage(promo.productImage, 1400),
        layout: 'split',
        badge: PROMO_TYPES.find(pt => pt.value === promo.type)?.label ?? promo.type,
        title: promo.productName,
        ctaLabel: 'Saiba Mais',
        ctaLink: '/promocao',
        priceOriginal: promo.originalPriceYen > 0 ? formatPrice(convertYen(promo.originalPriceYen), currency) : undefined,
        pricePromo: formatPrice(convertYen(promo.promoPriceYen), currency),
      });
    }

    // Demais produtos marcados como destaque: slides próprios, no layout 'split'.
    otherProducts.forEach((p) => {
      list.push({
        id: `featured-${p.id}`,
        image: productImage(p),
        videoSrc: p.videoCover ? p.video : undefined,
        layout: 'split',
        badge: t('featured.badge') || 'Seleção em destaque',
        title: productEnglishName(p),
        ctaLabel: t('featured.details') || 'Ver detalhes',
        ctaLink: `/produto/${p.id}`,
        ...pricesOf(p),
      });
    });

    return list;
  }, [t, promo, featured, currency]);

  return (
    <div className="container mx-auto px-3 pt-4 pb-5 sm:px-4 sm:pt-6 sm:pb-7">
      <HeroCarousel slides={slides} autoplay autoplayInterval={9000} />
    </div>
  );
};

export default PromoCarouselSection;
