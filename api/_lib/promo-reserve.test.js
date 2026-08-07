/**
 * Aritmética pura da reserva de unidades da promoção da home: holds vigentes,
 * vencidos, troca de rodada, substituição por retentativa.
 *
 * Não testa a fiação (integração com orders.js e fulfillment.js) — isso fica em
 * `orders.promo-reserve.test.js` junto com os pontos para reusar o harness.
 */
import { describe, it, expect } from 'vitest';
import {
  PRAZO_RESERVA_CARTAO_MS,
  PRAZO_RESERVA_MANUAL_MS,
  prazoReserva,
  chaveRodada,
  quantidadeReservada,
  comReservaPromo,
  semReservaPromo,
} from './promo-reserve.js';

const HORA = 60 * 60 * 1000;
const AGORA = 1000000;

function estado(rodada = '', holds = []) {
  return { rodada, holds };
}

function hold(orderId, quantity, expiresAt) {
  return { orderId, quantity, expiresAt };
}

function promo(productId = 'p1', expiresAt = 1500000) {
  return { productId, expiresAt };
}

describe('chaveRodada', () => {
  it('monta a chave a partir de productId e expiresAt', () => {
    const chave = chaveRodada(promo('p1', 1500000));
    expect(chave).toBe('p1|1500000');
  });

  it('devolve string vazia quando falta productId', () => {
    expect(chaveRodada({})).toBe('');
    expect(chaveRodada(null)).toBe('');
  });

  it('normaliza expiresAt nulo', () => {
    const chave = chaveRodada({ productId: 'p1', expiresAt: null });
    expect(chave).toBe('p1|');
  });
});

describe('prazoReserva', () => {
  it('cartão usa prazo curto', () => {
    expect(prazoReserva('card')).toBe(PRAZO_RESERVA_CARTAO_MS);
    expect(prazoReserva('card')).toBe(2 * 60 * 60 * 1000);
  });

  it('métodos manuais usam prazo longo', () => {
    expect(prazoReserva('pix')).toBe(PRAZO_RESERVA_MANUAL_MS);
    expect(prazoReserva('bank')).toBe(PRAZO_RESERVA_MANUAL_MS);
    expect(prazoReserva('paypay')).toBe(PRAZO_RESERVA_MANUAL_MS);
    expect(prazoReserva('yucho')).toBe(PRAZO_RESERVA_MANUAL_MS);
    expect(prazoReserva('wise')).toBe(PRAZO_RESERVA_MANUAL_MS);
  });

  it('prazo longo é 24h', () => {
    expect(PRAZO_RESERVA_MANUAL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('quantidadeReservada', () => {
  it('soma os holds vigentes na rodada atual', () => {
    const est = estado('p1|1500000', [
      hold('o1', 2, AGORA + HORA),
      hold('o2', 3, AGORA + HORA),
    ]);
    const quantidade = quantidadeReservada(est, promo('p1', 1500000), AGORA);
    expect(quantidade).toBe(5);
  });

  it('ignora holds da rodada anterior', () => {
    const est = estado('p1|1400000', [
      hold('o1', 5, AGORA + HORA),
    ]);
    const quantidade = quantidadeReservada(est, promo('p1', 1500000), AGORA);
    expect(quantidade).toBe(0);
  });

  it('ignora holds vencidos', () => {
    const est = estado('p1|1500000', [
      hold('o1', 2, AGORA + HORA),
      hold('o2', 3, AGORA - HORA),
    ]);
    const quantidade = quantidadeReservada(est, promo('p1', 1500000), AGORA);
    expect(quantidade).toBe(2);
  });

  it('nunca devolve negativo', () => {
    const est = { rodada: 'p1|1500000', holds: null };
    const quantidade = quantidadeReservada(est, promo('p1', 1500000), AGORA);
    expect(quantidade).toBe(0);
  });

  it('devolve 0 quando não há holds', () => {
    const est = estado('p1|1500000', []);
    const quantidade = quantidadeReservada(est, promo('p1', 1500000), AGORA);
    expect(quantidade).toBe(0);
  });
});

describe('comReservaPromo', () => {
  it('adiciona hold com o prazo curto do cartão', () => {
    const est = estado('p1|1500000', []);
    const novo = comReservaPromo(est, promo('p1', 1500000), {
      orderId: 'o1',
      quantity: 2,
      paymentMethod: 'card',
    }, AGORA);

    expect(novo.rodada).toBe('p1|1500000');
    expect(novo.holds).toHaveLength(1);
    expect(novo.holds[0].orderId).toBe('o1');
    expect(novo.holds[0].quantity).toBe(2);
    expect(novo.holds[0].expiresAt).toBe(AGORA + PRAZO_RESERVA_CARTAO_MS);
  });

  it('adiciona hold com o prazo longo do PIX', () => {
    const est = estado('p1|1500000', []);
    const novo = comReservaPromo(est, promo('p1', 1500000), {
      orderId: 'o1',
      quantity: 5,
      paymentMethod: 'pix',
    }, AGORA);

    expect(novo.holds[0].expiresAt).toBe(AGORA + PRAZO_RESERVA_MANUAL_MS);
  });

  it('substitui hold anterior do mesmo orderId', () => {
    const est = estado('p1|1500000', [
      hold('o1', 2, AGORA + HORA),
      hold('o2', 3, AGORA + HORA),
    ]);
    const novo = comReservaPromo(est, promo('p1', 1500000), {
      orderId: 'o1',
      quantity: 5,
      paymentMethod: 'card',
    }, AGORA);

    expect(novo.holds).toHaveLength(2);
    const o1 = novo.holds.find((h) => h.orderId === 'o1');
    expect(o1.quantity).toBe(5);
    const o2 = novo.holds.find((h) => h.orderId === 'o2');
    expect(o2.quantity).toBe(3);
  });

  it('descarta holds da rodada anterior', () => {
    const est = estado('p1|1400000', [
      hold('o1', 2, AGORA + HORA),
    ]);
    const novo = comReservaPromo(est, promo('p1', 1500000), {
      orderId: 'o2',
      quantity: 3,
      paymentMethod: 'card',
    }, AGORA);

    expect(novo.rodada).toBe('p1|1500000');
    expect(novo.holds).toHaveLength(1);
    expect(novo.holds[0].orderId).toBe('o2');
  });

  it('descarta holds vencidos', () => {
    const est = estado('p1|1500000', [
      hold('o1', 2, AGORA - HORA),
      hold('o2', 3, AGORA + HORA),
    ]);
    const novo = comReservaPromo(est, promo('p1', 1500000), {
      orderId: 'o3',
      quantity: 1,
      paymentMethod: 'card',
    }, AGORA);

    expect(novo.holds).toHaveLength(2);
    expect(novo.holds.some((h) => h.orderId === 'o1')).toBe(false);
  });

  it('ignora quantidade zero', () => {
    const est = estado('p1|1500000', []);
    const novo = comReservaPromo(est, promo('p1', 1500000), {
      orderId: 'o1',
      quantity: 0,
      paymentMethod: 'card',
    }, AGORA);

    expect(novo.holds).toHaveLength(0);
  });

  it('descarta quantidade negativa', () => {
    const est = estado('p1|1500000', []);
    const novo = comReservaPromo(est, promo('p1', 1500000), {
      orderId: 'o1',
      quantity: -5,
      paymentMethod: 'card',
    }, AGORA);

    expect(novo.holds).toHaveLength(0);
  });

  it('trunca quantity para inteiro', () => {
    const est = estado('p1|1500000', []);
    const novo = comReservaPromo(est, promo('p1', 1500000), {
      orderId: 'o1',
      quantity: 2.9,
      paymentMethod: 'card',
    }, AGORA);

    expect(novo.holds[0].quantity).toBe(2);
  });
});

describe('semReservaPromo', () => {
  it('remove hold do orderId', () => {
    const est = estado('p1|1500000', [
      hold('o1', 2, AGORA + HORA),
      hold('o2', 3, AGORA + HORA),
    ]);
    const novo = semReservaPromo(est, promo('p1', 1500000), 'o1', AGORA);

    expect(novo.rodada).toBe('p1|1500000');
    expect(novo.holds).toHaveLength(1);
    expect(novo.holds[0].orderId).toBe('o2');
  });

  it('descarta holds da rodada anterior', () => {
    const est = estado('p1|1400000', [
      hold('o1', 2, AGORA + HORA),
    ]);
    const novo = semReservaPromo(est, promo('p1', 1500000), 'o1', AGORA);

    expect(novo.rodada).toBe('p1|1500000');
    expect(novo.holds).toHaveLength(0);
  });

  it('descarta holds vencidos', () => {
    const est = estado('p1|1500000', [
      hold('o1', 2, AGORA - HORA),
      hold('o2', 3, AGORA + HORA),
    ]);
    const novo = semReservaPromo(est, promo('p1', 1500000), 'o1', AGORA);

    expect(novo.holds).toHaveLength(1);
    expect(novo.holds[0].orderId).toBe('o2');
  });

  it('é seguro remover orderId que não existe', () => {
    const est = estado('p1|1500000', [
      hold('o2', 3, AGORA + HORA),
    ]);
    const novo = semReservaPromo(est, promo('p1', 1500000), 'o1', AGORA);

    expect(novo.holds).toHaveLength(1);
    expect(novo.holds[0].orderId).toBe('o2');
  });
});
