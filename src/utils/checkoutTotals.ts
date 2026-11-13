// Conta do carrinho, checkout e revisão — a MESMA do servidor (api/_lib/commerce.js),
// porque usa shared/money.js. O cliente só traz os dados da tela (itens, cupom,
// pontos, forma de pagamento, país, frete e cotação); a regra mora no shared.
//
// O frete vem de fora: o servidor calcula com as tabelas dele, o cliente com as
// tabelas de src/utils. Por isso a conta aceita o frete já em ¥ (`finalShippingYen`).
//
// Toda linha é um valor inteiro na moeda do cliente e o total é a soma exata
// delas: subtotal − cupom − pontos = produtos; produtos + frete + taxa PS +
// imposto dos EUA + taxa do PIX = total.
import {
  displayTotals,
  productBenefits,
  psFeeDiscountYen as finalPsFeeDiscountYen,
} from '../../shared/money.js';
import { effectiveYen } from './pricing';
import type { Product } from '@/types';

// Valores fixos da taxa Personal Shopper: os mesmos que o servidor cobra.
export { PS_FEE_PER_UNIT_YEN, PS_FEE_AUTO_DISCOUNT_PER_UNIT_YEN, paymentMethodsForCountry } from '../../shared/money.js';

export interface CheckoutLine {
  /** Preço unitário em ¥ já com desconto do produto (effectiveYen). */
  unitYen: number;
  quantity: number;
  /** Brinde da promoção: não cobra nada e não entra na base do cupom. */
  freeGift?: boolean;
  /** Promoção da home (`_promo`): fora da base do cupom. */
  homePromo?: boolean;
  /** Produto com desconto próprio: o cupom de afiliado não empilha nele. */
  productDiscounted?: boolean;
  /** Produto isento da taxa do Personal Shopper. */
  noPsFee?: boolean;
}

export interface CheckoutCoupon {
  code?: string;
  discount?: number;
  discountPercent?: number;
  discountType?: string;
  type?: string;
  affiliateCode?: string;
  minOrderValue?: number;
}

export interface CheckoutRates {
  BRL: number;
  EUR: number;
  USD: number;
  /** 'wise' zera o cushion; qualquer outra origem usa 4%. */
  source?: string;
}

export interface ClientTotalsInput {
  lines: CheckoutLine[];
  coupon: CheckoutCoupon | null;
  redeemPoints: number;
  /** 'pix' soma IOF e tarifa (só em R$); vazio = ainda não escolhido (checkout). */
  paymentMethod: string;
  currency: string;
  /** País de entrega: 'Estados Unidos' soma o imposto de importação pré-pago. */
  country?: string;
  rates: CheckoutRates;
  /** Frete final em ¥ (já com desconto negociado). */
  finalShippingYen: number;
  psFeeWaived?: boolean;
  /** Desconto negociado na taxa PS em ¥ (já aprovado). */
  negotiatedPsDiscountYen?: number;
}

/** Monta uma linha da conta a partir de um item do carrinho (preço do produto, brinde, promoção). */
export function checkoutLineFromItem(item: {
  product: Product;
  size: string;
  quantity: number;
  freeGift?: boolean;
}): CheckoutLine {
  return {
    unitYen: item.freeGift ? 0 : effectiveYen(item.product, item.size),
    quantity: item.quantity,
    freeGift: Boolean(item.freeGift),
    homePromo: item.product.id.endsWith('_promo'),
    productDiscounted: Number(item.product.discountPercent || 0) > 0,
    noPsFee: Boolean(item.product.noPsFee),
  };
}

/** A conta do checkout: mesma função do servidor. `display` tem as linhas que o cliente vê. */
export function clientCheckoutTotals(input: ClientTotalsInput) {
  const lines = input.lines.map((line) => ({
    unitYen: line.unitYen,
    quantity: line.quantity,
    freeGift: Boolean(line.freeGift),
    homePromo: Boolean(line.homePromo),
    productDiscounted: Boolean(line.productDiscounted),
    noPsFee: Boolean(line.noPsFee),
  }));
  const benefits = productBenefits({ lines, coupon: input.coupon, redeemPoints: input.redeemPoints });
  const psDiscountYen = finalPsFeeDiscountYen({
    psFeeYen: benefits.psFeeYen,
    pointsCoverAllProducts: benefits.pointsCoverAllProducts,
    psFeeWaived: Boolean(input.psFeeWaived),
    negotiatedDiscountYen: input.negotiatedPsDiscountYen ?? 0,
  });
  const psFeeFinalYen = benefits.psFeeYen - psDiscountYen;
  const shown = displayTotals({
    currency: input.currency,
    rates: input.rates,
    country: input.country ?? '',
    paymentMethod: input.paymentMethod,
    lines,
    benefits,
    finalShippingYen: input.finalShippingYen,
    psFeeFinalYen,
  });
  return {
    productSubtotalYen: benefits.productSubtotalYen,
    couponDiscountYen: benefits.couponDiscountYen,
    pointsDiscountYen: benefits.pointsDiscountYen,
    netProductsYen: benefits.netProductsYen,
    psFeeYen: benefits.psFeeYen,
    psDiscountYen,
    psFeeYenCharged: psFeeFinalYen,
    pointsCoverAllProducts: benefits.pointsCoverAllProducts,
    finalShippingYen: input.finalShippingYen,
    currency: input.currency,
    total: shown.total,
    shown,
    display: {
      subtotal: shown.subtotal,
      couponDiscount: shown.couponDiscount,
      pointsDiscount: shown.pointsDiscount,
      products: shown.products,
      shipping: shown.shipping,
      psFee: shown.psFee,
      importDuty: shown.importDuty,
      paymentFee: shown.paymentFee,
      pixIof: shown.pixIof,
      pixBankFee: shown.pixBankFee,
    },
  };
}

/** Cupom em ¥ sobre a base regular (sem promoção da home e sem brinde), pela regra do servidor. */
export function couponYenFor(lines: CheckoutLine[], coupon: CheckoutCoupon | null): number {
  return productBenefits({ lines, coupon }).couponDiscountYen;
}
