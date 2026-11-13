// Conta do carrinho, checkout e revisão — a MESMA do servidor (api/_lib/commerce.js),
// porque usa shared/checkout-totals.js. O cliente só traz os dados da tela (itens,
// cupom, pontos, forma de pagamento, frete e cotação); a regra mora no shared.
//
// O frete vem de fora: o servidor calcula com as tabelas dele, o cliente com as
// tabelas de src/utils (ver o relatório da extração). Por isso a conta aceita o
// frete já em ¥ (`finalShippingYen`).
import { settleCheckout, couponDiscountYen } from '../../shared/checkout-totals.js';
import { effectiveYen } from './pricing';
import type { Product } from '@/types';

export interface CheckoutLine {
  /** Preço unitário em ¥ já com desconto do produto (effectiveYen). */
  unitYen: number;
  quantity: number;
  /** Brinde da promoção: não cobra nada e não entra na base do cupom. */
  freeGift?: boolean;
  /** Promoção da home (`_promo`): fora da base do cupom. */
  homePromo?: boolean;
  /** Produto isento da taxa do Personal Shopper. */
  noPsFee?: boolean;
}

export interface CheckoutCoupon {
  code?: string;
  discount?: number;
  discountPercent?: number;
  discountType?: string;
  type?: string;
  freeShipping?: boolean;
  affiliateCode?: string;
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
  /** 'card' e 'pix' têm 5% de desconto; outros métodos não. Sem método escolhido: '' */
  paymentMethod: string;
  currency: string;
  rates: CheckoutRates;
  /** Frete final em ¥ (já com cupom de frete grátis e desconto negociado). */
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
    noPsFee: Boolean(item.product.noPsFee),
  };
}

/** A conta do checkout: mesma função do servidor. `display` tem as parcelas que o cliente vê. */
export function clientCheckoutTotals(input: ClientTotalsInput) {
  const regularSubtotalYen = input.lines
    .filter((line) => !line.homePromo && !line.freeGift)
    .reduce((sum, line) => sum + line.unitYen * line.quantity, 0);
  const couponYen = couponDiscountYen(regularSubtotalYen, input.coupon);
  return settleCheckout({
    lines: input.lines.map((line) => ({
      unitYen: line.unitYen,
      quantity: line.quantity,
      freeGift: Boolean(line.freeGift),
      homePromo: Boolean(line.homePromo),
      noPsFee: Boolean(line.noPsFee),
    })),
    couponDiscountYen: couponYen,
    redeemPoints: input.redeemPoints,
    paymentMethod: input.paymentMethod,
    currency: input.currency,
    rates: input.rates,
    finalShippingYen: input.finalShippingYen,
    psFeeWaived: Boolean(input.psFeeWaived),
    negotiatedPsDiscountYen: input.negotiatedPsDiscountYen ?? 0,
  });
}

/** Cupom em ¥ sobre a base regular (sem promoção da home e sem brinde), pela regra do servidor. */
export function couponYenFor(lines: CheckoutLine[], coupon: CheckoutCoupon | null): number {
  const base = lines
    .filter((line) => !line.homePromo && !line.freeGift)
    .reduce((sum, line) => sum + line.unitYen * line.quantity, 0);
  return couponDiscountYen(base, coupon);
}
