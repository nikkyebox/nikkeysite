import { productSpendInWindowYen } from '../../shared/points.js';

// Gasto em mercadoria na janela de níveis de pontos, a partir do histórico que
// o cliente já tem carregado.
//
// Mesmo critério de `api/_lib/loyalty-tier.js`: só pedido pago, só mercadoria,
// sempre em ienes. A conta vive aqui, e não copiada dentro de cada tela, porque
// a revisão do pedido e o perfil precisam prometer o MESMO nível — foi
// exatamente esse tipo de cópia que já fez a tela dizer 100 pontos e o servidor
// creditar 85.

/** Só o que o cálculo precisa: qualquer pedido do app satisfaz por estrutura. */
interface SpendOrder {
  orderDate?: string;
  date?: string;
  status?: string;
  paymentConfirmed?: boolean;
  items?: Array<{ unitYen?: number; quantity?: number; freeGift?: boolean }>;
}

/**
 * Pedido sem `unitYen` (histórico local antigo) conta zero: `price` está na
 * moeda do cliente, e somar BRL com ¥ inflaria o nível. O helper compartilhado
 * também reconhece datas antigas `dd/mm/aaaa` sem mantê-las válidas para sempre.
 */
export function recentProductSpendYen(orders: SpendOrder[] | undefined | null, now = new Date()): number {
  return productSpendInWindowYen(orders, now);
}
