// Testes para o cálculo de peso de envio (produto + embalagem).
//
// O peso cadastrado é apenas do produto. A embalagem (caixa + plástico-bolha)
// passa de 100 g e precisa estar incluída no cálculo de frete. A soma acontece
// aqui, no cálculo, porque é idempotente e vale automaticamente para todo
// produto novo — sem precisar reescrever o banco nem lembrar de migração.
import { describe, expect, it } from 'vitest';
import { PACKING_PADDING_G, PACKED_ALREADY_G, packedWeightG } from './weight.js';

describe('packedWeightG — peso de envio', () => {
  it('soma 200g de embalagem para produto de 303g', () => {
    const weight = packedWeightG(303);
    expect(weight).toBe(503);
  });

  it('soma 200g por unidade: 3 finos de 303g dão 1509g (não 909g)', () => {
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
