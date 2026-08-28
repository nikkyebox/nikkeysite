import { describe, expect, it } from 'vitest';
import { PRAZO_RESERVA_MS, comReservaEstoque, estoqueDisponivel, estoqueReservado, semReservaEstoque } from './stock-hold.js';

// Mesmo defeito do MEDIO 2 do AUDITORIA.md (points-hold.js), em mercadoria: a
// checagem de estoque em orders.js roda fora de transação, então dois
// checkouts simultâneos do mesmo produto passavam com o mesmo saldo e um
// estourava `insufficient_stock` já com o cartão cobrado.

const AGORA = 1_800_000_000_000;

function produto(quantity, holds = []) {
  return { stock: { unlimited: false, quantity }, stockHolds: holds };
}

describe('reserva de estoque', () => {
  it('desconta do disponível o que outro pedido já segurou', () => {
    const p = produto(10, [{ orderId: 'O1', quantity: 4, expiresAt: AGORA + 1000 }]);

    expect(estoqueReservado(p, 'O2', AGORA)).toBe(4);
    expect(estoqueDisponivel(p, 'O2', AGORA)).toBe(6);
  });

  // Sem prazo a reserva vazaria: não existe cancelamento de pedido no
  // servidor, então um checkout abandonado prenderia a unidade para sempre.
  it('ignora reserva vencida', () => {
    const p = produto(10, [
      { orderId: 'velho', quantity: 9, expiresAt: AGORA - 1 },
      { orderId: 'novo', quantity: 1, expiresAt: AGORA + 1000 },
    ]);

    expect(estoqueDisponivel(p, 'outro', AGORA)).toBe(9);
  });

  it('poda as vencidas ao gravar uma nova', () => {
    const p = produto(10, [{ orderId: 'velho', quantity: 9, expiresAt: AGORA - 1 }]);

    const lista = comReservaEstoque(p, 'O2', 3, AGORA);

    expect(lista).toEqual([{ orderId: 'O2', quantity: 3, expiresAt: AGORA + PRAZO_RESERVA_MS }]);
  });

  // Retentativa de criação do mesmo pedido não pode somar duas reservas.
  it('substitui a reserva do mesmo pedido em vez de somar', () => {
    const p = produto(10, [{ orderId: 'O1', quantity: 2, expiresAt: AGORA + 1000 }]);

    const lista = comReservaEstoque(p, 'O1', 5, AGORA);

    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ orderId: 'O1', quantity: 5 });
  });

  // A checagem de disponibilidade não pode contar a própria reserva do
  // pedido como concorrente — senão uma retentativa do mesmo checkout
  // recusaria a si mesma.
  it('exclui a própria reserva do pedido ao checar disponível', () => {
    const p = produto(10, [{ orderId: 'O1', quantity: 8, expiresAt: AGORA + 1000 }]);

    expect(estoqueDisponivel(p, 'O1', AGORA)).toBe(10);
  });

  it('libera só a reserva do pedido indicado', () => {
    const p = produto(10, [
      { orderId: 'O1', quantity: 2, expiresAt: AGORA + 1000 },
      { orderId: 'O2', quantity: 3, expiresAt: AGORA + 1000 },
    ]);

    const lista = semReservaEstoque(p, 'O1', AGORA);

    expect(lista).toHaveLength(1);
    expect(lista[0].orderId).toBe('O2');
  });

  it('trata produto sem lista de reservas', () => {
    expect(estoqueDisponivel(produto(5), 'O1', AGORA)).toBe(5);
    expect(estoqueDisponivel(null, 'O1', AGORA)).toBe(0);
    expect(comReservaEstoque(null, 'O1', 2, AGORA)).toHaveLength(1);
  });

  it('nunca devolve disponível negativo', () => {
    const p = produto(1, [{ orderId: 'O1', quantity: 5, expiresAt: AGORA + 1000 }]);

    expect(estoqueDisponivel(p, 'O2', AGORA)).toBe(0);
  });
});
