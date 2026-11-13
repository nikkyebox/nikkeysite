// Compatibilidade: a conta do checkout agora mora em `shared/money.js`
// (servidor, carrinho, checkout e revisão usam a mesma). Este arquivo só
// reexporta, para quem ainda importa pelo nome antigo.
export * from './money.js';
export { roundYen } from './pricing.js';
export { yenToDisplay as convertYen } from './money.js';

/** Valor na moeda do cliente: JPY inteiro, demais com 2 casas (só para estimativas informativas). */
export function normalizeMoney(value, currency) {
  return currency === 'JPY' ? Math.round(value) : Math.round(value * 100) / 100;
}
