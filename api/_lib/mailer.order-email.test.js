// E-mail de pedido: o que o cliente (e a loja) lê depois da compra.
//
// Duas garantias que importam mais que o visual:
//  1. o total mostrado é SEMPRE o `totalPrice` do pedido, e o detalhamento só
//     aparece quando a conta fecha com ele (nunca exibir números que não batem);
//  2. nada que vem do pedido (nome do produto, imagem, endereço) vira HTML solto.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function Resend() {
    return { emails: { send: mocks.send } };
  }),
}));

const { buildOrderEmail, sendMail } = await import('./mailer.js');

const IMG = 'https://firebasestorage.googleapis.com/v0/b/x/o/produto.jpg';

function pedido(extras = {}) {
  return {
    id: 'SC-JP-100001',
    orderNumber: 'SC-JP-100001',
    customerName: 'Maria Silva',
    customerEmail: 'maria@exemplo.com',
    currency: 'JPY',
    totalPrice: 2200,
    status: 'confirmed',
    paymentConfirmed: true,
    paymentMethod: 'card',
    shippingCarrier: 'yuubin',
    shippingAddress: {
      name: 'Maria Silva', phone: '090-0000-0000', email: 'maria@exemplo.com',
      postalCode: '100-0001', prefecture: 'Tokyo', city: 'Chiyoda', address: '1-1 Chiyoda', building: 'Apto 12', country: 'Japão',
    },
    items: [{ productName: 'Creme Facial', image: IMG, quantity: 2, price: 50 }],
    priceBreakdown: {
      subtotal: 100, couponDiscount: 0, pointsDiscount: 0, products: 100,
      shipping: 1100, psFee: 1000, importDuty: 0, paymentFee: 0, pixIof: 0, pixBankFee: 0,
    },
    ...extras,
  };
}

describe('e-mail de confirmação do cliente', () => {
  it('mostra produto com foto, quantidade, preço e o total do pedido', () => {
    const { subject, html } = buildOrderEmail(pedido());
    expect(subject).toBe('Pedido recebido - #SC-JP-100001');
    expect(html).toContain('Creme Facial');
    expect(html).toContain(`<img src="${IMG}"`);
    expect(html).toContain('2 × ¥50');
    expect(html).toContain('¥100'); // total da linha
    expect(html).toContain('¥2,200'); // total do pedido
  });

  it('detalha a conta: produtos + frete + taxa de serviço = total', () => {
    const { html } = buildOrderEmail(pedido());
    expect(html).toContain('Produtos');
    expect(html).toContain('Frete');
    expect(html).toContain('¥1,100');
    expect(html).toContain('Taxa de serviço');
    expect(html).toContain('¥1,000');
  });

  it('cartão já pago diz "Pagamento confirmado", não "será confirmado"', () => {
    const { html } = buildOrderEmail(pedido());
    expect(html).toContain('Pagamento confirmado');
    expect(html).not.toContain('será confirmado');
    expect(html).toContain('Cartão · confirmado');
  });

  it('pedido ainda sem pagamento mantém o aviso de que será confirmado', () => {
    const { html } = buildOrderEmail(pedido({ status: 'pending_payment', paymentConfirmed: false, paymentMethod: 'pix' }));
    expect(html).toContain('Pedido recebido');
    expect(html).toContain('O pagamento será confirmado antes da separação');
    expect(html).toContain('PIX · aguardando confirmação');
  });

  it('mostra endereço de entrega e transportadora', () => {
    const { html } = buildOrderEmail(pedido());
    expect(html).toContain('〒100-0001 Tokyo Chiyoda');
    expect(html).toContain('1-1 Chiyoda Apto 12');
    expect(html).toContain('Japan Post – Yu-Pack');
  });

  it('desconto de cupom e pontos aparece abatendo, e a conta ainda fecha', () => {
    const { html } = buildOrderEmail(pedido({
      totalPrice: 2000,
      priceBreakdown: { subtotal: 200, couponDiscount: 100, pointsDiscount: 100, products: 0, shipping: 1000, psFee: 1000, importDuty: 0, paymentFee: 0 },
    }));
    expect(html).toContain('Cupom de desconto');
    expect(html).toContain('−¥100');
    expect(html).toContain('Pontos utilizados');
    expect(html).toContain('¥2,000');
  });

  it('PIX no Brasil: IOF e taxa bancária em linhas próprias, em reais', () => {
    const { html } = buildOrderEmail(pedido({
      currency: 'BRL', totalPrice: 120, paymentMethod: 'pix', status: 'pending_payment', paymentConfirmed: false,
      shippingAddress: { name: 'Ana', postalCode: '01310-100', state: 'SP', city: 'Sao Paulo', address: 'Av Paulista 1000', country: 'Brasil' },
      items: [{ productName: 'Mascara', quantity: 1, price: 100 }],
      priceBreakdown: { subtotal: 100, couponDiscount: 0, pointsDiscount: 0, shipping: 10, psFee: 0, importDuty: 0, paymentFee: 10, pixIof: 4, pixBankFee: 6 },
    }));
    expect(html).toContain('IOF (PIX)');
    expect(html).toContain('Taxa bancária (PIX)');
    expect(html).toContain('R$ 120.00');
    expect(html).not.toContain('〒');
  });
});

describe('conta que não fecha ou pedido antigo', () => {
  it('breakdown que não soma o total some do e-mail, mas o total fica', () => {
    const { html } = buildOrderEmail(pedido({ totalPrice: 2200, priceBreakdown: { subtotal: 100, shipping: 500, psFee: 0 } }));
    expect(html).not.toContain('Taxa de serviço');
    expect(html).not.toContain('Frete');
    expect(html).toContain('¥2,200');
  });

  it('pedido antigo, sem priceBreakdown, ainda mostra itens e total', () => {
    const antigo = pedido();
    delete antigo.priceBreakdown;
    const { html } = buildOrderEmail(antigo);
    expect(html).toContain('Creme Facial');
    expect(html).toContain('¥2,200');
  });

  it('item sem foto não quebra a tabela', () => {
    const { html } = buildOrderEmail(pedido({ items: [{ productName: 'Sem foto', quantity: 1, price: 100 }] }));
    expect(html).toContain('Sem foto');
    expect(html).not.toContain('<img');
  });

  it('brinde aparece como Grátis', () => {
    const { html } = buildOrderEmail(pedido({
      items: [{ productName: 'Creme Facial', quantity: 1, price: 100 }, { productName: 'Amostra', quantity: 1, price: 0, freeGift: true }],
    }));
    expect(html).toContain('Amostra');
    expect(html).toContain('Brinde');
    expect(html).toContain('Grátis');
  });
});

describe('segurança do conteúdo', () => {
  it('escapa HTML no nome do produto e no endereço', () => {
    const { html } = buildOrderEmail(pedido({
      items: [{ productName: '<script>alert(1)</script>', quantity: 1, price: 100 }],
      shippingAddress: { name: '<b>X</b>', city: '"><img src=x onerror=1>', country: 'Japão' },
    }));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>X</b>');
    expect(html).not.toContain('onerror=1>');
    expect(html).toContain('&lt;script&gt;');
  });

  it.each([
    ['javascript:alert(1)'],
    ['data:image/png;base64,AAAA'],
    ['http://exemplo.com/a.jpg'],
    ['https://exemplo.com/a.jpg" onerror="x'],
  ])('imagem não-https ou com aspas (%s) é descartada', (imagem) => {
    const { html } = buildOrderEmail(pedido({ items: [{ productName: 'Creme', image: imagem, quantity: 1, price: 100 }] }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
  });
});

describe('aviso para a loja e rastreamento', () => {
  it('e-mail da loja traz cliente, contato, pagamento e endereço', () => {
    const { subject, html } = buildOrderEmail(pedido({ paymentReference: 'pi_123' }), { store: true });
    expect(subject).toBe('Novo pedido - #SC-JP-100001');
    expect(html).toContain('Novo pedido pago');
    expect(html).toContain('maria@exemplo.com · 090-0000-0000');
    expect(html).toContain('pi_123');
    expect(html).toContain('〒100-0001');
  });

  it('rastreamento Japan Post traz o código e o link; Yamato traz só o código', () => {
    const japan = buildOrderEmail(pedido({ trackingCode: 'EE123456789JP', shippingCarrier: 'ems' }), { tracking: true });
    expect(japan.subject).toBe('Pedido enviado - #SC-JP-100001');
    expect(japan.html).toContain('EE123456789JP');
    expect(japan.html).toContain('trackings.post.japanpost.jp');

    const yamato = buildOrderEmail(pedido({ trackingCode: '1234-5678-9012', shippingCarrier: 'yamato' }), { tracking: true });
    expect(yamato.html).toContain('1234-5678-9012');
    expect(yamato.html).not.toContain('japanpost.jp');
  });

  it('rastreamento sem código avisa que aguarda atualização', () => {
    const { html } = buildOrderEmail(pedido(), { tracking: true });
    expect(html).toContain('aguardando atualização');
  });
});

describe('versão em texto puro', () => {
  beforeEach(() => {
    mocks.send.mockReset().mockResolvedValue({ data: { id: 'msg' }, error: null });
    process.env.RESEND_API_KEY = 're_teste';
  });

  it('separa nome, quantidade e valor em vez de colar tudo', async () => {
    const { subject, html } = buildOrderEmail(pedido());
    await sendMail({ to: 'maria@exemplo.com', subject, html });
    const { text } = mocks.send.mock.calls[0][0];
    expect(text).toContain('Creme Facial');
    expect(text).toMatch(/Frete\s+¥1,100/);
    expect(text).toMatch(/Total\s+¥2,200/);
  });
});
