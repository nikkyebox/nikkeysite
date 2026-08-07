// O nível de pontos que o perfil mostra e o que a revisão do pedido promete
// saem daqui. Errar para MAIS seria prometer 3x e creditar 1x, então o que
// estes testes prendem é sobretudo o que NÃO entra na conta.
import { describe, expect, it } from 'vitest';
import { recentProductSpendYen } from './loyaltySpend';
import { tierProgress } from '../../shared/points.js';

const AGORA = new Date('2026-08-01T12:00:00Z');

interface SpendItem { unitYen: number; quantity: number; freeGift?: boolean }
interface SpendOrder {
  orderDate?: string;
  status?: string;
  date?: string;
  fulfillmentState?: string;
  paymentConfirmed?: boolean;
  items?: SpendItem[];
}

const item = (unitYen: number, quantity = 1, freeGift = false): SpendItem => ({ unitYen, quantity, freeGift });
const pago = (iso: string, itens: SpendItem[]): SpendOrder => ({
  orderDate: iso,
  status: 'confirmed',
  paymentConfirmed: true,
  items: itens,
});
describe('gasto na janela de níveis', () => {
  it('soma mercadoria dos pedidos pagos', () => {
    const orders = [pago('2026-08-01T00:00:00Z', [item(31000, 2)])];
    expect(recentProductSpendYen(orders, AGORA)).toBe(62000);
  });

  it('ignora pedido não pago — pedido criado não é pedido pago', () => {
    const orders = [{ orderDate: '2026-08-01T00:00:00Z', status: 'pending', paymentConfirmed: false, items: [item(99000)] }];
    expect(recentProductSpendYen(orders, AGORA)).toBe(0);
  });

  it('ignora brinde: não foi pago, não conta para o nível', () => {
    const orders = [pago('2026-08-01T00:00:00Z', [item(10000), item(50000, 1, true)])];
    expect(recentProductSpendYen(orders, AGORA)).toBe(10000);
  });

  it('ignora item sem unitYen em vez de cair para a moeda do cliente', () => {
    // `price` está em BRL/USD; somar com ¥ inflaria o nível.
    const orders = [pago('2026-08-01T00:00:00Z', [{ quantity: 1, price: 999 } as never])];
    expect(recentProductSpendYen(orders, AGORA)).toBe(0);
  });

  // Em agosto no Japão, a janela começa em 1º de junho às 00:00 JST
  // (31/05 15:00 UTC), e não à meia-noite UTC.
  it('vira a janela na meia-noite do Japão', () => {
    const dentro = [pago('2026-05-31T15:00:00Z', [item(50000)])];
    const fora = [pago('2026-05-31T14:59:59Z', [item(50000)])];
    expect(recentProductSpendYen(dentro, AGORA)).toBe(50000);
    expect(recentProductSpendYen(fora, AGORA)).toBe(0);
  });

  it('reconhece pedidos pagos antigos por status e data brasileira', () => {
    const orders: SpendOrder[] = [{
      date: '01/06/2026',
      status: 'shipped',
      items: [item(50000)],
    }];
    expect(recentProductSpendYen(orders, AGORA)).toBe(50000);
  });

  it('lista vazia ou ausente não quebra', () => {
    expect(recentProductSpendYen([], AGORA)).toBe(0);
    expect(recentProductSpendYen(undefined, AGORA)).toBe(0);
  });
});

describe('gasto vira nível na tela', () => {
  it('¥62.000 em compras pagas mostra Prata e o que falta para Ouro', () => {
    const gasto = recentProductSpendYen([pago('2026-08-01T00:00:00Z', [item(31000, 2)])], AGORA);
    const progresso = tierProgress(gasto);

    expect(progresso.tier.id).toBe('prata');
    expect(progresso.tier.multiplier).toBe(2);
    expect(progresso.next?.id).toBe('ouro');
    expect(progresso.remainingYen).toBe(38000);
  });

  it('sem compras na janela volta para Bronze', () => {
    const gasto = recentProductSpendYen([pago('2026-01-05T00:00:00Z', [item(200000)])], AGORA);
    expect(gasto).toBe(0);
    expect(tierProgress(gasto).tier.id).toBe('bronze');
  });
});
