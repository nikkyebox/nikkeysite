// Testes para o cálculo de peso de envio (produto + embalagem).
//
// O peso cadastrado é apenas do produto. A embalagem (caixa + plástico-bolha)
// passa de 100 g e precisa estar incluída no cálculo de frete. A soma acontece
// aqui, no cálculo, porque é idempotente e vale automaticamente para todo
// produto novo — sem precisar reescrever o banco nem lembrar de migração.
import { describe, expect, it } from 'vitest';
import { PACKAGE_BOX_G, PACKING_PADDING_G, PACKED_ALREADY_G, packedWeightG, parcelWeightG, productPackedWeightG } from './weight.js';

describe('packedWeightG — peso de envio', () => {
  it('soma 200g de embalagem para produto de 303g', () => {
    const weight = packedWeightG(303);
    expect(weight).toBe(503);
  });

  it('peso NÃO conferido: 3 finos de 303g dão 1509g (margem de 200g por unidade)', () => {
    // O bug relatado: três produtos de 303g = 909g total, caem na faixa de
    // 1kg do Japan Post. Mas o pacote real passa de 1kg, e a loja cobrava
    // a faixa errada. Com o padding: 3 × (303+200) = 1509g, sai da faixa de 1kg.
    const unitWeight = packedWeightG(303);
    expect(unitWeight).toBe(503);
    const threeUnits = unitWeight * 3;
    expect(threeUnits).toBe(1509);
  });

  it('soma embalagem para produto de 1999g', () => {
    const weight = packedWeightG(1999);
    expect(weight).toBe(2199);
  });

  it('não soma embalagem para produto de 2000g (fronteira)', () => {
    // Produtos de 2kg ou mais foram cadastrados pesados (já incluem embalagem).
    // Não somamos de novo.
    const weight = packedWeightG(2000);
    expect(weight).toBe(2000);
  });

  it('não soma embalagem para produto de 2500g', () => {
    const weight = packedWeightG(2500);
    expect(weight).toBe(2500);
  });

  it('retorna 0 para peso ausente', () => {
    expect(packedWeightG(undefined)).toBe(0);
    expect(packedWeightG(null)).toBe(0);
  });

  it('retorna 0 para peso zero', () => {
    expect(packedWeightG(0)).toBe(0);
  });

  it('retorna 0 para peso negativo', () => {
    expect(packedWeightG(-100)).toBe(0);
  });

  it('retorna 0 para peso não-numérico', () => {
    expect(packedWeightG('abc')).toBe(0);
    expect(packedWeightG({})).toBe(0);
    expect(packedWeightG([])).toBe(0);
  });

  it('exporta constantes certas', () => {
    expect(PACKING_PADDING_G).toBe(200);
    expect(PACKED_ALREADY_G).toBe(2000);
  });
});

describe('peso conferido — sem margem', () => {
  it('3 finos de 303 g conferidos dão 909 g e cabem na faixa de 1 kg', () => {
    const fino = { weightGrams: 303, weightVerified: true };
    expect(productPackedWeightG(fino) * 3).toBe(909);
  });

  it('peso não conferido continua com a margem de 200 g', () => {
    expect(productPackedWeightG({ weightGrams: 303 })).toBe(503);
    expect(productPackedWeightG({ weightGrams: 303, weightVerified: false })).toBe(503);
  });

  it('sem peso devolve 0 mesmo marcado como conferido', () => {
    expect(productPackedWeightG({ weightVerified: true })).toBe(0);
    expect(productPackedWeightG(null)).toBe(0);
    expect(packedWeightG(0, true)).toBe(0);
  });
});

describe('parcelWeightG — caixa uma vez por pacote', () => {
  it('a caixa com plástico-bolha pesa 100g', () => {
    expect(PACKAGE_BOX_G).toBe(100);
  });

  it('soma a caixa uma vez só, não por unidade', () => {
    // 3 finos conferidos: 909g de produto + 100g de caixa = 1009g.
    const itens = productPackedWeightG({ weightGrams: 303, weightVerified: true }) * 3;
    expect(parcelWeightG(itens)).toBe(1009);
  });

  it('peso não conferido: margem por unidade + uma caixa', () => {
    expect(parcelWeightG(packedWeightG(280) * 2)).toBe((280 + 200) * 2 + 100);
  });

  it('total vazio ou inválido devolve 0 (sem caixa fantasma)', () => {
    expect(parcelWeightG(0)).toBe(0);
    expect(parcelWeightG(-5)).toBe(0);
    expect(parcelWeightG(Number.NaN)).toBe(0);
  });
});
