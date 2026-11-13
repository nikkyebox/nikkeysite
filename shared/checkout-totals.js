// Conta do checkout em UM lugar: a mesma para o servidor (api/_lib/commerce.js),
// para o carrinho/checkout/revisão (src/utils/checkoutTotals.ts) e para os testes.
//
// Regra: o servidor é a fonte da verdade. Estas funções são a parte PURA da conta
// de `buildQuote` (cupom, pontos, taxa PS, conversão e total) — copiadas linha a
// linha, sem mudar nenhuma regra. Quem chama decide o frete (tabelas do
// servidor ou do cliente) e a validação do cupom; esta conta só soma.
//
// Mora em `shared/` porque `src` não pode importar de `api/_lib`.

import { roundYen } from './pricing.js';

/** ¥ → moeda do cliente, com a MESMA margem e cushion do servidor. JPY é inteiro. */
export function convertYen(yen, currency, rates, { exact = false } = {}) {
  if (currency === 'JPY') return Math.round(yen);
  const baseRate = Number(rates[currency]);
  const cushion = rates.source === 'wise' ? 0 : 0.04;
  const rate = exact ? baseRate : baseRate * (1 + cushion);
  const buffer = exact ? 0 : 5;
  return Math.round((yen + buffer) * rate * 100) / 100;
}

/** Valor na moeda do cliente: JPY inteiro, demais com 2 casas. */
export function normalizeMoney(value, currency) {
  return currency === 'JPY' ? Math.round(value) : Math.round(value * 100) / 100;
}

/**
 * Desconto do cupom em ¥ sobre a base regular (sem promoção da home e sem brinde).
 * Cupom de frete grátis não dá desconto em produto. Mesma conta do servidor:
 * fixo é em ienes; percentual vem de `discountPercent` ou `discount`.
 */
export function couponDiscountYen(regularSubtotalYen, coupon) {
  if (!coupon || coupon.freeShipping) return 0;
  const percentage = coupon.discountPercent != null ? Number(coupon.discountPercent) : Number(coupon.discount || 0);
  return coupon.discountType === 'fixed' || coupon.type === 'fixed'
    ? Math.min(regularSubtotalYen, Number(coupon.discount || 0))
    : Math.min(regularSubtotalYen, Math.round(regularSubtotalYen * percentage / 100));
}

/** Taxa do Personal Shopper: ¥1.000 por unidade, exceto brinde e produto isento. */
export const PS_FEE_PER_UNIT_YEN = 1000;

/**
 * A conta depois do frete. `lines`: [{ unitYen, quantity, freeGift, homePromo, noPsFee }].
 * Ordem igual ao servidor: cupom (já calculado), depois pontos (só mercadoria),
 * depois pagamento (5% em cartão e PIX), depois taxa PS.
 *
 * Devolve as parcelas em ¥ e em moeda do cliente, e o total cobrado.
 */
export function settleCheckout({
  lines,
  couponDiscountYen: couponYen,
  redeemPoints = 0,
  paymentMethod,
  currency,
  rates,
  finalShippingYen,
  psFeeWaived = false,
  negotiatedPsDiscountYen = 0,
}) {
  let productSubtotalYen = 0;
  let psFeeYen = 0;
  for (const line of lines) {
    productSubtotalYen += line.freeGift ? 0 : line.unitYen * line.quantity;
    if (!line.freeGift && !line.noPsFee) psFeeYen += line.quantity * PS_FEE_PER_UNIT_YEN;
  }
  const couponDiscountYen = couponYen;
  const points = Math.max(0, Math.floor(Number(redeemPoints || 0)));
  const pointsDiscountYen = Math.min(points, Math.max(0, productSubtotalYen - couponDiscountYen));
  const afterBenefitsYen = Math.max(0, productSubtotalYen - couponDiscountYen - pointsDiscountYen);
  const paymentDiscountYen = paymentMethod === 'card' || paymentMethod === 'pix'
    ? Math.floor(afterBenefitsYen * 0.05)
    : 0;
  const netProductsYen = Math.max(0, afterBenefitsYen - paymentDiscountYen);

  const pointsCoverAllProducts = productSubtotalYen > 0
    && pointsDiscountYen > 0
    && afterBenefitsYen === 0;
  const psFeeWaiverApplied = Boolean(psFeeWaived && psFeeYen > 0 && !pointsCoverAllProducts);
  const psDiscountYen = pointsCoverAllProducts
    ? 0
    : psFeeWaiverApplied ? psFeeYen : Math.min(psFeeYen, Number(negotiatedPsDiscountYen || 0));

  const productsDisplay = normalizeMoney(convertYen(netProductsYen, currency, rates), currency);
  const shippingDisplay = normalizeMoney(convertYen(finalShippingYen, currency, rates), currency);
  const psFeeDisplay = normalizeMoney(convertYen(psFeeYen - psDiscountYen, currency, rates, { exact: true }), currency);
  const total = normalizeMoney(productsDisplay + shippingDisplay + psFeeDisplay, currency);

  const taxaEfetiva = netProductsYen > 0 ? productsDisplay / netProductsYen : 0;
  const linha = (valorYen) => normalizeMoney(valorYen * taxaEfetiva, currency);
  const couponDiscountDisplay = linha(couponDiscountYen);
  const pointsDiscountDisplay = linha(pointsDiscountYen);
  const paymentDiscountDisplay = linha(paymentDiscountYen);
  const subtotalDisplay = normalizeMoney(
    productsDisplay + couponDiscountDisplay + pointsDiscountDisplay + paymentDiscountDisplay,
    currency,
  );

  return {
    productSubtotalYen,
    couponDiscountYen,
    pointsDiscountYen,
    paymentDiscountYen,
    netProductsYen,
    psFeeYen,
    psDiscountYen,
    psFeeWaiverApplied,
    pointsCoverAllProducts,
    finalShippingYen,
    currency,
    total,
    totalYen: netProductsYen + finalShippingYen + (psFeeYen - psDiscountYen),
    psFeeYenCharged: psFeeYen - psDiscountYen,
    display: {
      subtotal: subtotalDisplay,
      couponDiscount: couponDiscountDisplay,
      pointsDiscount: pointsDiscountDisplay,
      paymentDiscount: paymentDiscountDisplay,
      products: productsDisplay,
      shipping: shippingDisplay,
      psFee: psFeeDisplay,
    },
  };
}

export { roundYen };
