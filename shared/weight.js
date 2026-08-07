// Peso de envio — o peso do produto MAIS a caixa e o plástico-bolha.
//
// O `weightGrams` do cadastro é o peso do produto nu, que é o que o admin tem
// na mão para digitar. A embalagem passa de 100 g e não estava em lugar nenhum:
// três "finos" de 303 g davam 909 g, caíam na faixa de 1 kg do Japan Post, e o
// pacote real estourava 1 kg — a loja cobrava uma faixa e pagava a seguinte.
//
// A soma acontece aqui, no cálculo, e não numa migração que reescrevesse o
// banco, por três motivos:
//   1. É idempotente. Rodar a conta duas vezes não vira 400 g de embalagem;
//      uma migração rodada duas vezes vira.
//   2. Vale automaticamente para todo produto cadastrado depois, sem ninguém
//      lembrar de somar nada.
//   3. `weightGrams` continua significando "peso do produto" — exatamente o que
//      o formulário do admin pede e o que o rótulo do fabricante diz.
//
// Mora em `shared/` pelo mesmo motivo que `points.js`: `src` não pode importar
// de `api/_lib` e o servidor não pode importar de `src/services`. O peso que a
// tela mostra e o peso que o servidor cobra têm que ser o mesmo número.

/** Embalagem (caixa + plástico-bolha) somada a cada unidade enviada. */
export const PACKING_PADDING_G = 200;

/**
 * A partir deste peso o cadastro já é peso embalado.
 *
 * Produto de 2 kg ou mais vem em caixa própria e foi cadastrado pesado como
 * chega — somar de novo seria cobrar embalagem duas vezes.
 */
export const PACKED_ALREADY_G = 2000;

/**
 * Peso de UMA unidade pronta para despachar, a partir do peso cadastrado.
 *
 * Peso ausente, zero, negativo ou não-numérico devolve 0: quem chama é que sabe
 * estimar por dimensão ou por categoria. Esta função não inventa peso — se
 * inventasse, o fallback de cada tela seria um número diferente.
 */
export function packedWeightG(weightGrams) {
  const peso = Number(weightGrams);
  if (!Number.isFinite(peso) || peso <= 0) return 0;
  if (peso >= PACKED_ALREADY_G) return peso;
  return peso + PACKING_PADDING_G;
}
