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
import { productEnglishName } from '@/utils/productName';
import { cdnImage } from '@/services/cloudinaryService';

// Assets locais do projeto — evita depender de host externo (Unsplash) que pode
// falhar por CSP/rede em alguns ambientes de preview.
const STORE_IMAGE = '/icons/icon-512x512.png';
const STORE_VIDEO = '/videos/store-intro.mp4';
// Poster do slide institucional: branco (mesma cor do fundo do slide) em vez do
// ícone rosa — evita o flash "logo some, vira fundo rosa" antes do vídeo tocar.
const STORE_POSTER = '/videos/store-intro-poster.png';

/**
 * Carrossel da home: 1º slide institucional (loja no Japão) + promoção ativa
 * do admin (siteContent/homePromotion) + produtos marcados como destaque.
 * Não requer nenhuma mudança no painel admin — só lê dados já existentes.
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

  const featured = useMemo(
    () => products.filter(p => !p.hidden && p.featured).slice(0, 4),
    [products]
  );

  const slides: CarouselSlide[] = useMemo(() => {
    const list: CarouselSlide[] = [
      {
        id: 'store',
        image: STORE_POSTER,
        videoSrc: STORE_VIDEO,
        layout: 'center',
        badge: t('hero.badge'),
        title: `${t('hero.title.1')} ${t('hero.title.highlight')} ${t('hero.title.2')}`,
        subtitle: t('hero.description'),
        titleParts: {
          before: t('hero.title.1'),
          highlight: t('hero.title.highlight'),
          after: t('hero.title.2'),
        },
        ctaLabel: t('hero.cta.products') || 'Ver Produtos',
        ctaLink: '/produtos',
        secondaryCtaLabel: t('hero.cta.story') || 'Como funciona',
        secondaryCtaLink: '/como-funciona',
        highlights: [
          t('hero.badge.recipe'),
          t('hero.badge.tradition'),
          t('featured.tag.imported'),
        ],
      },
    ];

    if (promo) {
      list.push({
        id: 'promo',
        image: cdnImage(promo.productImage, 1400),
        layout: 'split',
        badge: PROMO_TYPES.find(pt => pt.value === promo.type)?.label ?? promo.type,
        title: promo.productName,
        subtitle: t('hero.badge.tradition') || undefined,
        ctaLabel: 'Saiba Mais',
        ctaLink: '/promocao',
        priceOriginal: promo.originalPriceYen > 0 ? formatPrice(convertYen(promo.originalPriceYen), currency) : undefined,
        pricePromo: formatPrice(convertYen(promo.promoPriceYen), currency),
      });
    }

    featured.forEach((p) => {
      const variants = getVariants(p);
      const firstVariant = [...variants].sort((a, b) => a.price - b.price)[0];
      const price = convertYen(effectiveYen(p, firstVariant?.id || 'small'));
      const original = convertYen(baseYen(p, firstVariant?.id || 'small'));
      const hasDiscount = original > price;
      list.push({
        id: `featured-${p.id}`,
        image: p.gallery?.[0] || p.image || p.thumbnail || STORE_IMAGE,
        videoSrc: p.videoCover ? p.video : undefined,
        layout: 'split',
        badge: t('featured.badge') || 'Seleção em destaque',
        title: productEnglishName(p),
        subtitle: undefined,
        ctaLabel: t('featured.details') || 'Ver detalhes',
        ctaLink: `/produto/${p.id}`,
        priceOriginal: hasDiscount ? formatPrice(original, currency) : undefined,
        pricePromo: formatPrice(price, currency),
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
