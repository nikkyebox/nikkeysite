// Aviso de tributos em UM lugar só — usado pelo feed do Merchant e pela página
// que o anúncio abre.
//
// O Google compara o feed com a landing page e trata custo que o comprador só
// descobre depois como Deturpação: a conta é suspensa mesmo com o preço do feed
// batendo com o do site. Enquanto forem dois textos, eles divergem, e a
// divergência é exatamente a infração.
//
// O que o texto precisa dizer, e é o que a loja de fato faz: a estimativa de
// imposto É calculada e exibida no carrinho, mas NÃO é cobrada — não entra no
// total pago no site. Quem cobra é a autoridade do destino, na liberação.
// Prometer "impostos inclusos" seria falso; omitir a estimativa seria custo não
// divulgado. O texto abaixo é o único que descreve as duas coisas.

/** Idioma do site e do feed: `pt` cobre Brasil e a Europa lusófona. */
const DISCLOSURE = {
  pt: {
    title: 'Aviso sobre Tributação',
    body: 'Preço e frete são exibidos separadamente e não incluem tributos. Produtos enviados do Japão podem estar sujeitos a tributos, taxas e inspeção alfandegária definidos pelas autoridades do país de destino. No carrinho calculamos e exibimos uma estimativa desses tributos apenas para informação: ela não é cobrada pela loja nem somada ao total pago no site. O valor é uma estimativa, não garante a cobrança final nem o prazo de liberação, e quem cobra é a autoridade do país de destino no momento da entrega.',
  },
  en: {
    title: 'Duties & Taxes Notice',
    body: 'Product price and shipping are displayed separately and do not include duties or taxes. Products shipped from Japan may be subject to duties, fees, and customs inspection determined by the authorities of the destination country. In the cart we calculate and display an estimate of these charges for information only: it is not charged by the store and is not added to the total you pay on the site. The amount is an estimate, does not guarantee the final charge or the clearance time, and is collected by the destination country authorities upon delivery.',
  },
  ja: {
    title: '関税・税金に関するご案内',
    body: '商品代金と送料は別々に表示され、税金は含まれていません。日本から発送される商品は、配送先国の当局が定める関税・手数料・通関検査の対象となる場合があります。カート内では参考として税額の概算を計算して表示しますが、当店が請求することはなく、サイトでお支払いいただく合計にも加算されません。表示額はあくまで概算であり、最終的な請求額や通関にかかる期間を保証するものではありません。徴収はお届け時に配送先国の当局が行います。',
  },
};

/**
 * Aviso no idioma pedido.
 *
 * Idioma desconhecido cai em português — o feed sem aviso é a infração, então o
 * fallback publica o texto em vez de nada.
 */
export function taxDisclosure(lang) {
  return DISCLOSURE[lang] || DISCLOSURE.pt;
}

/** Idiomas com aviso escrito. Serve aos testes e a quem for adicionar região. */
export const DISCLOSURE_LANGS = Object.keys(DISCLOSURE);
