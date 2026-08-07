// O painel prometia uma coisa e o e-mail dizia outra.
//
// Havia duas funções montando o texto da mesma campanha: `buildOffer` no modal
// do admin, que somava o desconto do produto ao da campanha ("-30% · Compre
// agora e ganhe mais desconto"), e `offerFor` em api/notify.js, que ignorava o
// desconto do produto ("-15% · 15% de desconto · Aproveite X com 15% de
// desconto"). Quem recebia o e-mail lia a versão pior — e a que não explicava
// que havia DOIS descontos.
//
// Agora as duas pontas chamam `promoOffer`. Estes testes travam o que o cliente
// lê: os dois percentuais explícitos, o nome do cupom e o uso único.
import { describe, expect, it } from 'vitest';
import { promoOffer, promoCouponLabel } from './promo-offer.js';

const PRODUTO = 'Sabonete Corporal 8x4 MEN Foot + Body';

describe('promoOffer — desconto somado', () => {
  const oferta = promoOffer({
    mechanic: 'discount',
    discountPct: 15,
    keepProductDiscount: true,
    productName: PRODUTO,
    productDiscountPercent: 15,
  });

  it('mostra os dois percentuais no selo, não um total inventado', () => {
    // 15% + 15% em cadeia dá 27,75% do preço cheio: anunciar "-30%" seria número
    // que a conta do carrinho não fecha.
    expect(oferta.badge).toBe('15% + 15%');
    expect(oferta.badge).not.toContain('30');
  });

  it('diz de onde vem cada parte do desconto', () => {
    expect(oferta.tagline).toBe('15% do produto + 15% do cupom AGORA15');
  });

  it('explica o produto já com desconto, o cupom somado e o uso único', () => {
    expect(oferta.description).toContain('já sai com 15% OFF');
    expect(oferta.description).toContain('AGORA15');
    expect(oferta.description).toContain('uso único');
    expect(oferta.description).toContain(PRODUTO);
  });

  it('nomeia o cupom pelo percentual, para o cliente não ver PROMO-A1B2', () => {
    expect(oferta.couponLabel).toBe('AGORA15');
    expect(promoCouponLabel(20)).toBe('AGORA20');
  });
});

describe('promoOffer — desconto sem a base do produto', () => {
  // Sem "manter desconto inicial" o produto volta ao preço cheio no carrinho:
  // anunciar soma aqui seria propaganda enganosa.
  const oferta = promoOffer({
    mechanic: 'discount',
    discountPct: 15,
    keepProductDiscount: false,
    productName: PRODUTO,
    productDiscountPercent: 15,
  });

  it('anuncia só o desconto da campanha', () => {
    expect(oferta.badge).toBe('-15%');
    expect(oferta.tagline).toBe('15% de desconto com o cupom AGORA15');
    expect(oferta.description).not.toContain('já sai com');
  });

  it('mantém o nome do cupom e o uso único', () => {
    expect(oferta.couponLabel).toBe('AGORA15');
    expect(oferta.description).toContain('uso único');
  });
});

describe('promoOffer — demais mecânicas', () => {
  it('compre 1 ganhe 1 avisa que a segunda unidade entra pelo link', () => {
    const o = promoOffer({ mechanic: 'bogo', productName: PRODUTO });
    expect(o.badge).toBe('COMPRE 1 GANHE 1');
    expect(o.description).toContain('carrinho');
    expect(o.couponLabel).toBe('');
  });

  it('brinde nomeia o produto de presente quando existe', () => {
    const o = promoOffer({ mechanic: 'bogo_other', productName: PRODUTO, giftProductName: 'Kit Alga' });
    expect(o.description).toContain('Kit Alga');
  });

  it('pontos informam quantos e quando entram', () => {
    const o = promoOffer({ mechanic: 'points', points: 100, productName: PRODUTO });
    expect(o.badge).toBe('+100 PONTOS');
    expect(o.description).toContain('100 pontos');
  });

  it('cupom para a próxima compra usa o código informado', () => {
    const o = promoOffer({ mechanic: 'coupon', couponCode: 'volta10', productName: PRODUTO });
    expect(o.badge).toBe('CUPOM VOLTA10');
    expect(o.description).toContain('próxima compra');
  });

  it('mecânica desconhecida não quebra o envio', () => {
    const o = promoOffer({ mechanic: 'none', productName: PRODUTO });
    expect(o.badge).toBe('OFERTA');
    expect(o.description).toContain(PRODUTO);
  });
});

describe('promoOffer — limites', () => {
  it('percentual fora da faixa é contido, sem gerar texto absurdo', () => {
    expect(promoOffer({ mechanic: 'discount', discountPct: 0 }).badge).toBe('-1%');
    expect(promoOffer({ mechanic: 'discount', discountPct: 999 }).badge).toBe('-90%');
  });

  it('sem nome de produto ainda produz frase legível', () => {
    const o = promoOffer({ mechanic: 'discount', discountPct: 15 });
    expect(o.description).toContain('o produto selecionado');
  });
});
