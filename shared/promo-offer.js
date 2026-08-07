// Texto da promoção em UM lugar só — usado pelo painel (preview) e pelo
// servidor (e-mail, push, feed do perfil, carrinho).
//
// Existiam DUAS cópias: `buildOffer` no modal do admin, que compunha o desconto
// do produto com o da campanha, e `offerFor` em api/notify.js, que ignorava o
// desconto do produto. O admin via o preview prometendo "-30% · Compre agora e
// ganhe mais desconto" e o cliente recebia "-15% · 15% de desconto · Aproveite X
// com 15% de desconto" — a MESMA campanha, dois textos, e o do cliente era o
// pior dos dois. Enquanto forem duas funções, elas voltam a divergir.
//
// Sobre a soma: os descontos entram EM CADEIA (o cupom incide sobre o preço que
// já tem o desconto do produto). 15% + 15% dá 27,75% do preço cheio, não 30% —
// por isso o texto anuncia "15% + 15%", que é verdade e é o que o cliente vê
// somar no carrinho, em vez de um "30% OFF" que a conta não fecha.

/** Nome do cupom que o link aplica sozinho. Deriva do próprio percentual. */
export function promoCouponLabel(discountPct) {
  const pct = Math.max(1, Math.min(90, Math.round(Number(discountPct) || 0)));
  return `AGORA${pct}`;
}

function inteiroPct(valor) {
  return Math.max(0, Math.min(90, Math.round(Number(valor) || 0)));
}

/**
 * Monta selo, título e frase da promoção.
 *
 * `couponLabel` volta preenchido só quando existe cupom automático (mecânica de
 * desconto): o carrinho mostra esse nome no lugar do código interno
 * `PROMO-XXXXXX`, que ninguém precisa ler nem digitar.
 */
export function promoOffer({
  mechanic,
  discountPct = 0,
  keepProductDiscount = false,
  points = 0,
  couponCode = '',
  productName = '',
  productDiscountPercent = 0,
  giftProductName = '',
} = {}) {
  const nome = String(productName || '').trim() || 'o produto selecionado';

  if (mechanic === 'discount') {
    const extra = Math.max(1, inteiroPct(discountPct));
    // Sem "manter desconto inicial" a base é DESCARTADA: o produto volta ao preço
    // cheio no carrinho e anunciar a soma seria propaganda enganosa.
    const base = keepProductDiscount ? inteiroPct(productDiscountPercent) : 0;
    const cupom = promoCouponLabel(extra);
    if (base > 0) {
      return {
        badge: `${base}% + ${extra}%`,
        tagline: `${base}% do produto + ${extra}% do cupom ${cupom}`,
        description: `${nome} já sai com ${base}% OFF. Este link soma o cupom ${cupom} (uso único) e tira mais ${extra}% sobre esse preço — os dois descontos juntos no carrinho, sem digitar código.`,
        couponLabel: cupom,
      };
    }
    return {
      badge: `-${extra}%`,
      tagline: `${extra}% de desconto com o cupom ${cupom}`,
      description: `Este link aplica o cupom ${cupom} (uso único) e tira ${extra}% de ${nome} no carrinho, sem digitar código.`,
      couponLabel: cupom,
    };
  }

  if (mechanic === 'bogo') {
    return {
      badge: 'COMPRE 1 GANHE 1',
      tagline: 'Compre 1 e ganhe 1',
      description: `Compre um ${nome} e leve dois. A segunda unidade entra no carrinho pelo link, por tempo limitado.`,
      couponLabel: '',
    };
  }

  if (mechanic === 'bogo_other') {
    const brinde = String(giftProductName || '').trim();
    return {
      badge: 'COMPRE E GANHE',
      tagline: 'Compre 1 e ganhe outro produto',
      description: brinde
        ? `Compre ${nome} e ganhe ${brinde} de presente. O brinde entra no carrinho pelo link.`
        : `Compre ${nome} e ganhe outro produto de presente. O brinde entra no carrinho pelo link.`,
      couponLabel: '',
    };
  }

  if (mechanic === 'points') {
    const pts = Math.max(1, Math.round(Number(points) || 0));
    return {
      badge: `+${pts} PONTOS`,
      tagline: 'Compre e ganhe pontos',
      description: `Compre ${nome} e ganhe ${pts} pontos no programa de fidelidade, creditados junto com o pedido.`,
      couponLabel: '',
    };
  }

  if (mechanic === 'coupon') {
    const code = String(couponCode || '').trim().toUpperCase();
    return {
      badge: code ? `CUPOM ${code}` : 'GANHE UM CUPOM',
      tagline: 'Compre e ganhe um cupom',
      description: code
        ? `Compre ${nome} e receba o cupom ${code} para usar na próxima compra.`
        : `Compre ${nome} e receba um cupom de desconto para a próxima compra.`,
      couponLabel: '',
    };
  }

  return { badge: 'OFERTA', tagline: 'Oferta especial', description: `Confira ${nome}.`, couponLabel: '' };
}
