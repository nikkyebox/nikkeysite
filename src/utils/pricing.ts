import { Product, ProductVariant } from '@/types';

// `roundYen` mora em `shared/pricing.js` para não existir uma cópia por lado.
// A do feed tinha ficado sem ele, e o Google recebia preço menor do que o site
// cobra — divergência que suspende conta no Merchant Center.
import { roundYen } from '../../shared/pricing.js';

export { roundYen };

/** Promoção ativa? (desconto entre 1 e 99%) */
export const hasDiscount = (product: Pick<Product, 'discountPercent'>): boolean => {
  const d = product.discountPercent || 0;
  return d > 0 && d < 100;
};

/** Lista de variantes do produto. Se não tiver `variants`, deriva de prices.small/large. */
export const getVariants = (product: Product): ProductVariant[] => {
  if (product.variants && product.variants.length > 0) return product.variants;
  const list: ProductVariant[] = [];
  if (product.prices?.small) list.push({ id: 'small', label: 'Pequeno', price: product.prices.small });
  if (product.prices?.large) list.push({ id: 'large', label: 'Grande', price: product.prices.large });
  if (list.length === 0) list.push({ id: 'small', label: 'Único', price: product.prices?.small || 0 });
  return list;
};

/** Variante por id (ou a primeira como fallback). */
export const variantById = (product: Product, id: string): ProductVariant => {
  const vs = getVariants(product);
  return vs.find((v) => v.id === id) || vs[0];
};

/** Preço base em ¥ de uma variante (sem desconto). Aceita id de variante (o "size"). */
export const baseYen = (product: Product, size: string): number => {
  // Compatibilidade: 'small'/'large' continuam lendo prices se não houver variants.
  if (!product.variants?.length) {
    if (size === 'small') return roundYen(product.prices?.small || 0);
    if (size === 'large') return roundYen(product.prices?.large || product.prices?.small || 0);
  }
  return roundYen(variantById(product, size)?.price || 0);
};

/** Preço efetivo em ¥ (com desconto promocional). */
export const effectiveYen = (product: Product, size: string): number => {
  const base = baseYen(product, size);
  if (!hasDiscount(product)) return base;
  return roundYen(Math.round(base * (1 - (product.discountPercent as number) / 100)));
};

/** Menor preço efetivo entre as variantes (para "a partir de" nos cards). */
export const minEffectiveYen = (product: Product): number => {
  const vs = getVariants(product);
  return Math.min(...vs.map((v) => effectiveYen(product, v.id)));
};
