/**
 * Quem é "a mesma pessoa" para efeito de limite de promoção.
 *
 * Os limites de campanha ("1 por pessoa", código de uso único) sempre foram
 * ancorados só no CPF: `cpf_index/{cpf}` e `promo_usage/{code}_{cpf}`. O CPF é
 * exigido pela aduana brasileira, mas é **opcional** no checkout — quem compra
 * de Portugal, do Japão ou dos EUA não preenche. Para esses, os dois guardas
 * viravam `null` em 04/08/2026 e o limite simplesmente não existia: dava para
 * repetir a promoção à vontade.
 *
 * A saída é cair para o `uid` da conta quando não há CPF. É mais fraco — conta
 * é de graça, CPF não — mas é infinitamente melhor do que não ter guarda, e não
 * custa nada para quem já informa o CPF.
 *
 * O prefixo `uid_` não colide com CPF: `parseCustomer` só aceita CPF com
 * exatamente 11 dígitos, então nenhum id de CPF começa com letra. Isso deixa as
 * duas chaves convivendo na mesma coleção sem migrar o que já está gravado.
 */

/**
 * Id do documento em `cpf_index`. `null` quando não há nem CPF nem conta —
 * aí não existe âncora nenhuma e o chamador não deve gravar índice.
 */
export function indiceDePessoaId({ cpf = '', userId = '' } = {}) {
  const digitos = String(cpf || '').replace(/\D/g, '');
  if (digitos.length === 11) return digitos;
  const uid = String(userId || '').trim();
  return uid ? `uid_${uid}` : null;
}

/**
 * Id do documento em `promo_usage`, no formato `{code}_{pessoa}`.
 * `null` quando falta o código da promoção ou a âncora de pessoa.
 */
export function promoUsageId(promoCode, pessoa) {
  const code = String(promoCode || '').trim();
  if (!code) return null;
  const id = indiceDePessoaId(pessoa);
  return id ? `${code}_${id}` : null;
}
