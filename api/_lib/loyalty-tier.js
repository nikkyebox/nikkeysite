// Níveis de pontos: histórico de compra do cliente.
//
// Calcula quanto o cliente gastou em mercadoria (só) nos últimos 3 meses
// para determinar seu multiplicador de pontos. Usa um recorte por
// mês-calendário (o mês atual + os 2 anteriores), não 90 dias corridos.

import { productSpendInWindowYen } from '../../shared/points.js';

/**
 * Gasto total em mercadoria (fora frete, fora taxa do personal shopper)
 * nos pedidos PAGOS dentro da janela de 3 meses do cliente.
 *
 * Se o filtro composto (userId + data + status) não tem índice, cai para
 * fallback em memória — é o mesmo padrão que `customRequestService.getAll`
 * usa quando falta índice composto. Sem um índice a consulta nega-se a rodar;
 * com um índice, a busca é rápida. Aqui prefiro não inventar um novo índice
 * (que viria ao custo de manutenção) e deixar o fallback em memória fazer o
 * trabalho — ordem é milissegundos numa query apenas por userId.
 */
export async function recentProductSpendYen(db, userId, now = new Date()) {
  if (!db || !userId) return 0;
  try {
    // Uma consulta simples por dono inclui pedidos antigos que ainda não tinham
    // `paymentConfirmed`. O helper compartilhado reconhece também status pagos
    // e aplica exatamente a mesma janela exibida no perfil.
    const snap = await db.collection('orders').where('userId', '==', String(userId)).get();
    return productSpendInWindowYen(snap.docs.map((document) => document.data()), now);
  } catch {
    // Falhar para Bronze é mais seguro do que prometer/creditar multiplicador
    // sem conseguir comprovar as compras pagas.
    return 0;
  }
}

