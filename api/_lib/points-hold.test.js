import { describe, expect, it } from 'vitest';
import { PRAZO_RESERVA_MS, comReserva, pontosDisponiveis, pontosReservados, semReserva } from './points-hold.js';

// Regressão do MEDIO 2 do AUDITORIA.md: o saldo era conferido fora de transação
// e só debitado no fulfillment, então dois checkouts simultâneos do mesmo
// cliente passavam com o mesmo saldo e o segundo estourava depois de cobrado.

const AGORA = 1_800_000_000_000;

function usuario(points, holds = []) {
  return { points, pointsHolds: holds };
}

describe('reserva de pontos', () => {
  it('desconta do disponível o que outro pedido já segurou', () => {
    const u = usuario(1000, [{ orderId: 'O1', points: 400, expiresAt: AGORA + 1000 }]);

    expect(pontosReservados(u, AGORA)).toBe(400);
    expect(pontosDisponiveis(u, AGORA)).toBe(600);
  });

  // Sem prazo a reserva vazaria: não existe endpoint de cancelamento de pedido,
  // então um checkout abandonado seguraria os pontos do cliente para sempre.
  it('ignora reserva vencida', () => {
    const u = usuario(1000, [
      { orderId: 'velho', points: 900, expiresAt: AGORA - 1 },
      { orderId: 'novo', points: 100, expiresAt: AGORA + 1000 },
    ]);

    expect(pontosDisponiveis(u, AGORA)).toBe(900);
  });

  it('poda as vencidas ao gravar uma nova', () => {
    const u = usuario(1000, [{ orderId: 'velho', points: 900, expiresAt: AGORA - 1 }]);

    const lista = comReserva(u, 'O2', 300, AGORA);

    expect(lista).toEqual([{ orderId: 'O2', points: 300, expiresAt: AGORA + PRAZO_RESERVA_MS }]);
  });

  // Retentativa de criação do mesmo pedido não pode somar duas reservas.
  it('substitui a reserva do mesmo pedido em vez de somar', () => {
    const u = usuario(1000, [{ orderId: 'O1', points: 200, expiresAt: AGORA + 1000 }]);

    const lista = comReserva(u, 'O1', 500, AGORA);

    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ orderId: 'O1', points: 500 });
  });

  it('libera só a reserva do pedido indicado', () => {
    const u = usuario(1000, [
      { orderId: 'O1', points: 200, expiresAt: AGORA + 1000 },
      { orderId: 'O2', points: 300, expiresAt: AGORA + 1000 },
    ]);

    const lista = semReserva(u, 'O1', AGORA);

    expect(lista).toHaveLength(1);
    expect(lista[0].orderId).toBe('O2');
  });

  it('trata usuário sem lista de reservas', () => {
    expect(pontosDisponiveis({ points: 500 }, AGORA)).toBe(500);
    expect(pontosDisponiveis(null, AGORA)).toBe(0);
    expect(comReserva(null, 'O1', 100, AGORA)).toHaveLength(1);
  });

  it('nunca devolve disponível negativo', () => {
    const u = usuario(100, [{ orderId: 'O1', points: 500, expiresAt: AGORA + 1000 }]);

    expect(pontosDisponiveis(u, AGORA)).toBe(0);
  });
});
