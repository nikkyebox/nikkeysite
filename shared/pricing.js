// Aritmética de preço em ¥ — a MESMA para a vitrine, o checkout e o feed.
//
// Mora em `shared/` pelo mesmo motivo que `brand.js`: `src` não pode importar de
// `api/_lib` (no dev o Vite manda tudo que começa com `/api` para a função
// serverless e o módulo volta 404), e ter três cópias já custou caro.
//
// O feed tinha a sua própria versão, com o comentário "espelha
// src/utils/pricing.ts" — mas sem o arredondamento. Publicava a máscara Fino a
// ¥1440 enquanto o site cobrava ¥1450, e o Tsubaki a ¥1782 contra ¥1800. O
// Google compara o preço do feed com o da página de destino e suspende a conta
// por divergência.

/**
 * Arredonda para cima na escala da loja: resto 1–50 → xx50, 51–80 → xx80,
 * 81–99 → xx00 seguinte. Preço quebrado não existe na vitrine.
 */
export function roundYen(value) {
  const integer = Math.max(0, Math.round(Number(value) || 0));
  const remainder = integer % 100;
  if (remainder === 0 || remainder === 50 || remainder === 80) return integer;
  if (remainder < 50) return integer - remainder + 50;
  if (remainder <= 80) return integer - remainder + 80;
  return integer - remainder + 100;
}

/** Variantes com preço real. `variants` manda; senão, `prices.small/large`. */
export function variantPrices(product) {
  if (Array.isArray(product?.variants) && product.variants.length) {
    return product.variants.filter((v) => Number(v?.price) > 0);
  }
  return [
    { id: 'small', price: Number(product?.prices?.small) || 0 },
    { id: 'large', price: Number(product?.prices?.large) || 0 },
  ].filter((v) => v.price > 0);
}

/**
 * Preço efetivo de uma variante: base arredondada, desconto aplicado, e
 * arredondada de novo. Os dois arredondamentos são de propósito — é o que a
 * vitrine mostra e o que `api/_lib/commerce.js` cobra.
 */
export function effectiveYen(price, discountPercent) {
  const base = roundYen(price);
  const percent = Number(discountPercent) || 0;
  if (!(percent > 0 && percent < 100)) return base;
  return roundYen(base * (1 - percent / 100));
}

/** Menor preço efetivo do produto. Zero quando não há variante com preço. */
export function minEffectiveYen(product) {
  const variants = variantPrices(product);
  if (!variants.length) return 0;
  return Math.min(...variants.map((v) => effectiveYen(v.price, product?.discountPercent)));
}
