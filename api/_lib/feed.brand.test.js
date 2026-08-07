// O feed declarava `brand: NikkeyBox` nos 296 produtos. Estão errados: são
// Kewpie, Bioré, Glico. O Google reprova por marca incorreta, deixa de casar a
// busca por marca no Shopping, e o nome ainda colide com as transportadoras
// homônimas ("NikkeyBox" de logística e de frete de automóveis).
//
// A marca sai do nome do produto, por lista ordenada — a primeira que casar
// vence. Os casos abaixo são os que quebram uma implementação ingênua, todos
// tirados do catálogo real.
import { describe, expect, it } from 'vitest';

import { detectBrand } from '../../shared/brand.js';
import {
  classifyMerchantProduct,
  feedDisclosure,
  GOOGLE_CATEGORY,
  merchantDescription,
  merchantImagesForProduct,
} from '../feed.js';
import { taxDisclosure } from '../../shared/tax-disclosure.js';

describe('detectBrand', () => {
  it('usa o fabricante, nunca a loja, quando a marca está no nome', () => {
    expect(detectBrand('Kewpie Mayonnaise 700g')).toBe('Kewpie');
    expect(detectBrand('Bioré UV Aqua Rich Watery Essence')).toBe('Bioré');
    expect(detectBrand('SKIN1004 Madagascar Centella Ampoule')).toBe('SKIN1004');
  });

  it('resolve a marca mesmo quando ela não abre o nome', () => {
    // O nome começa com o tipo do produto, em português.
    expect(detectBrand('Sabonete Corporal 8x4 MEN Foot + Body')).toBe('8x4');
    expect(detectBrand('Furikake Marumiya Noritama')).toBe('Marumiya');
    expect(detectBrand('Chá de Cevada Japonês (Mugicha) Ito En – 54 Sachês')).toBe('Ito En');
    expect(detectBrand('Kit Ululis Pinkme (Shampoo + Tratamento)')).toBe('Ululis');
  });

  it('prefere a entrada mais específica quando duas casam', () => {
    // 'ReFa Honey Queen' casa com /honey/ — ReFa precisa vencer.
    expect(detectBrand('ReFa Honey Queen SHAMPOO & TREATMENT')).toBe('ReFa');
    expect(detectBrand('Reva Honey Queen Shampoo/ReFa HONEY QUEEN')).toBe('ReFa');
    // 'Shiseido Senka' e 'Specialty SENKA' são a mesma marca.
    expect(detectBrand('Specialty SENKA Perfect Whip White Clay')).toBe('Senka');
    expect(detectBrand('Shiseido Senka')).toBe('Senka');
  });

  it('não casa sigla curta dentro de outra palavra', () => {
    // O caso que motivou os \b: 'Deoxyribose' contém 'oxy'.
    expect(detectBrand('Medicube Deoxyribose Scalp Serum')).toBe('Medicube');
    expect(detectBrand('OXY Clear Wash – Sabonete Facial')).toBe('OXY');
  });

  it('agrupa submarcas sob o fabricante', () => {
    // Pocky, Pretz e Caplico são todas Ezaki Glico.
    expect(detectBrand('Pocky Chocolate Original 10 unidade')).toBe('Glico');
    expect(detectBrand('Glico Pretz Salada – Palitos Crocantes')).toBe('Glico');
    expect(detectBrand('Caplico Giant Morango 10 unidade')).toBe('Glico');
    // Hatomugi, com ou sem o nome da linha, é Naturie.
    expect(detectBrand('Hatomugi Body Milk 400ml')).toBe('Naturie');
    expect(detectBrand('Naturie Hatomugi Skin Conditioner')).toBe('Naturie');
  });

  it('assina com a loja quando o produto não tem marca', () => {
    // Genérico de verdade — inventar marca aqui é o erro que estamos corrigindo.
    expect(detectBrand('Escova Massageadora para Cães e Gatos')).toBe('NikkeyBox Store');
    expect(detectBrand('')).toBe('NikkeyBox Store');
    expect(detectBrand(undefined)).toBe('NikkeyBox Store');
  });
});

describe('GOOGLE_CATEGORY', () => {
  it('manda alimento para Alimentos, não para Doces e chocolates', () => {
    // 4748 (Doces e chocolates) seria falso para 31 dos 72 itens de `doces` —
    // a categoria da loja mistura curry, maionese, ramen e chá.
    expect(GOOGLE_CATEGORY.doces).toBe(422);
    expect(GOOGLE_CATEGORY.cosmeticos).toBe(469);
    expect(GOOGLE_CATEGORY.pet).toBe(2);
  });
});

describe('classifyMerchantProduct', () => {
  it('classifica a máscara Fino na categoria profunda de cuidados capilares', () => {
    expect(classifyMerchantProduct({
      name: 'Fino Premium Touch  hair mask (230g)',
      category: 'cosmeticos',
    }, 'br')).toEqual({
      googleCategory: 486,
      productType: 'Saúde e Beleza > Cuidados Pessoais > Cuidados com os Cabelos > Máscaras Capilares',
    });
  });

  it.each([
    ['Shampoo Tsubaki Premium Moist', 543615],
    ['Condicionador Tsubaki Premium Moist', 543616],
    ['Kit Fino Shampoo + Condicionador', 543617],
    ['Kit &honey Shampoo + Tratamento + Máscara Capilar', 8452],
  ])('usa a categoria capilar específica para %s', (name, googleCategory) => {
    expect(classifyMerchantProduct({ name, category: 'cosmeticos' }, 'br').googleCategory)
      .toBe(googleCategory);
  });

  it('não classifica cosmético facial como produto capilar', () => {
    expect(classifyMerchantProduct({
      name: 'Bioré UV Aqua Rich Watery Essence',
      category: 'cosmeticos',
    }, 'br')).toEqual({ googleCategory: 469 });
  });

  it('omite product_type em feeds que não são brasileiros', () => {
    expect(classifyMerchantProduct({
      name: 'Fino Premium Touch Hair Oil',
      category: 'cosmeticos',
    }, 'us')).toEqual({ googleCategory: 486, productType: undefined });
  });
});

describe('merchantImagesForProduct', () => {
  it('gera JPG público, remove duplicatas e mantém imagens adicionais', () => {
    const front = 'https://res.cloudinary.com/demo/image/upload/f_auto,q_95,c_limit/v1/front.webp';
    expect(merchantImagesForProduct({
      image: front,
      gallery: [
        front,
        'https://res.cloudinary.com/demo/image/upload/f_auto,q_95,c_limit/v1/back.webp',
        'data:image/png;base64,abc',
      ],
      thumbnail: 'https://res.cloudinary.com/demo/image/upload/f_jpg,w_300/v1/front-thumb.jpg',
    })).toEqual([
      'https://res.cloudinary.com/demo/image/upload/f_jpg,q_auto:best/v1/front.jpg',
      'https://res.cloudinary.com/demo/image/upload/f_jpg,q_auto:best/v1/back.jpg',
    ]);
  });

  it('usa o thumbnail apenas quando não existe imagem completa', () => {
    expect(merchantImagesForProduct({
      thumbnail: 'https://res.cloudinary.com/demo/image/upload/f_auto,w_300/v1/thumb.webp',
    })).toEqual([
      'https://res.cloudinary.com/demo/image/upload/f_jpg,q_auto:best/v1/thumb.jpg',
    ]);
  });
});

// O preço do feed é produto + frete e para aí: o imposto de importação é cobrado
// na liberação, pelo país de destino. Custo que o comprador descobre depois é
// Deturpação para o Google, e a suspensão vem mesmo com o preço batendo com o do
// site. O aviso viaja na descrição de TODO item, não só no canal — e é o MESMO
// texto da página que o anúncio abre, senão o Google acha a divergência.
describe('merchantDescription', () => {
  it('anexa à descrição o mesmo aviso que a loja mostra no carrinho', () => {
    const description = merchantDescription('Máscara capilar 230g.', 'br');

    expect(description).toMatch(/^Máscara capilar 230g\. /);
    expect(description.endsWith(taxDisclosure('pt').body)).toBe(true);
  });

  // O ponto da mudança: o item diz que a loja calcula e mostra a estimativa E
  // que não a cobra. Faltando uma das duas metades, o anúncio volta a mentir.
  it.each([
    ['br', 'pt'],
    ['eu', 'pt'],
    ['us', 'en'],
  ])('no feed %s declara estimativa exibida e não cobrada', (region, lang) => {
    expect(feedDisclosure(region)).toBe(taxDisclosure(lang).body);
  });

  it('avisa em inglês no feed dos EUA', () => {
    const description = merchantDescription('Hair mask 230g.', 'us');

    expect(description).toContain('do not include duties or taxes');
    expect(description).not.toContain('tributos');
  });

  // Sem região conhecida o aviso ainda tem de sair — silêncio aqui é a infração.
  it('cai no aviso em português quando a região é desconhecida', () => {
    expect(merchantDescription('Produto', 'jp')).toContain('não incluem tributos');
    expect(merchantDescription('Produto', undefined)).toContain('não incluem tributos');
  });

  // Produto sem descrição existe no catálogo: o campo é opcional no painel.
  it('publica só o aviso quando o produto não tem texto', () => {
    expect(merchantDescription(undefined, 'br')).toBe(taxDisclosure('pt').body);
    expect(merchantDescription('', 'br')).toBe(taxDisclosure('pt').body);
  });

  // 5000 é o teto do Merchant. Estourar reprova o item; cortar o aviso o deixa
  // dentro do limite e fora da regra — o corte tem de cair no texto do produto.
  it('corta o texto do produto, nunca o aviso, para caber em 5000 caracteres', () => {
    const description = merchantDescription('x'.repeat(6000), 'br');

    expect(description).toHaveLength(5000);
    expect(description.endsWith(taxDisclosure('pt').body)).toBe(true);
  });
});
