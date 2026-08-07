import { useEffect } from 'react';
import type { Product } from '@/types';
import { minEffectiveYen } from '@/utils/pricing';
import { convertYen } from '@/services/fxService';
import { catalogShippingYen } from '@/utils/catalogShipping';
import { getCurrencyByCountry } from '@/utils/currency';
import { getCountryConfig } from '@/data/worldCountries';
import { detectBrand } from '../../shared/brand.js';

interface Props {
  product: Product;
  country: string;     // país do cliente (define moeda e zona de frete)
  rating?: { averageRating: number; totalReviews: number };
}

const SITE_URL = 'https://www.nikkeybox-store.com';

/**
 * Injeta Schema.org Product/Offer com shippingDetails no <head>.
 * O Google lê isso ao rastrear e exibe preço + frete na busca orgânica.
 * Preço = menor variante; frete = serviço mais barato pelo peso do produto.
 */
const ProductJsonLd: React.FC<Props> = ({ product, country, rating }) => {
  useEffect(() => {
    const isJapan = country === 'Japão';
    const currency = getCurrencyByCountry(country);
    const cfg = getCountryConfig(country);
    const shippingCountry = (cfg?.iso || 'br').toUpperCase();

    const priceYen = minEffectiveYen(product);
    const shipYen = isJapan ? 0 : catalogShippingYen(product, country);

    const priceLocal = isJapan ? priceYen : convertYen(priceYen, currency);
    const shipLocal = isJapan ? 0 : convertYen(shipYen, currency);

    const image = product.gallery?.[0] || product.image || product.thumbnail || '';
    const inStock = !(product.stock && !product.stock.unlimited && product.stock.quantity === 0);

    const jsonLd: Record<string, unknown> = {
      '@context': 'https://schema.org/',
      '@type': 'Product',
      name: product.name,
      image: image ? [image] : undefined,
      description: (product.description || product.name).slice(0, 5000),
      brand: { '@type': 'Brand', name: detectBrand(product.name) },
      sku: product.id,
      offers: {
        '@type': 'Offer',
        url: `${SITE_URL}/produto/${product.id}`,
        priceCurrency: currency,
        price: priceLocal.toFixed(2),
        availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
        ...(isJapan ? {} : {
          shippingDetails: {
            '@type': 'OfferShippingDetails',
            shippingRate: {
              '@type': 'MonetaryAmount',
              value: shipLocal.toFixed(2),
              currency,
            },
            shippingDestination: {
              '@type': 'DefinedRegion',
              addressCountry: shippingCountry,
            },
            deliveryTime: {
              '@type': 'ShippingDeliveryTime',
              handlingTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
              transitTime: { '@type': 'QuantitativeValue', minValue: 7, maxValue: 20, unitCode: 'DAY' },
            },
          },
        }),
      },
    };

    if (rating && rating.totalReviews > 0) {
      jsonLd.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: rating.averageRating.toFixed(1),
        reviewCount: rating.totalReviews,
      };
    }

    // Remove undefined antes de serializar
    const clean = JSON.parse(JSON.stringify(jsonLd));

    const scriptId = 'product-jsonld';
    let el = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.id = scriptId;
      el.type = 'application/ld+json';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(clean);

    return () => {
      document.getElementById(scriptId)?.remove();
    };
  }, [product, country, rating]);

  return null;
};

export default ProductJsonLd;
