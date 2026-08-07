// O aviso tem de dizer as DUAS coisas em todo idioma: que a loja calcula e
// exibe a estimativa de imposto, e que não a cobra. Dizer só a primeira promete
// imposto incluso (falso); dizer só a segunda esconde o custo. Qualquer um dos
// dois é a violação de Deturpação que suspendeu a conta no Merchant Center.
import { describe, expect, it } from 'vitest';

import { DISCLOSURE_LANGS, taxDisclosure } from './tax-disclosure.js';

describe('taxDisclosure', () => {
  it('cobre os três idiomas do site', () => {
    expect(DISCLOSURE_LANGS).toEqual(['pt', 'en', 'ja']);
  });

  it.each([
    ['pt', 'calculamos e exibimos uma estimativa', 'não é cobrada pela loja nem somada ao total pago'],
    ['en', 'we calculate and display an estimate', 'is not charged by the store and is not added to the total'],
    ['ja', '概算を計算して表示', '当店が請求することはなく'],
  ])('em %s diz que calcula a estimativa e que não cobra', (lang, calcula, naoCobra) => {
    const { body } = taxDisclosure(lang);

    expect(body).toContain(calcula);
    expect(body).toContain(naoCobra);
  });

  it('dá título e texto em todo idioma', () => {
    for (const lang of DISCLOSURE_LANGS) {
      const { title, body } = taxDisclosure(lang);
      expect(title.length).toBeGreaterThan(0);
      expect(body.length).toBeGreaterThan(0);
    }
  });

  // Idioma que ainda não tem tradução não pode virar item sem aviso: o feed
  // publica o texto em português em vez de publicar nada.
  it('cai no português quando o idioma é desconhecido', () => {
    expect(taxDisclosure('de')).toBe(taxDisclosure('pt'));
    expect(taxDisclosure(undefined)).toBe(taxDisclosure('pt'));
  });
});
