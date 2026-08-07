import { describe, expect, it } from 'vitest';
import { indiceDePessoaId, promoUsageId } from './promo-identity.js';

// Regressão do MEDIO 3 do AUDITORIA.md: os limites de promoção eram ancorados
// só no CPF, que é opcional no checkout. Cliente de fora do Brasil não informa
// CPF, e para ele os guardas viravam `null` — a promoção não tinha limite.

describe('âncora de pessoa para limite de promoção', () => {
  it('usa o CPF quando existe', () => {
    expect(indiceDePessoaId({ cpf: '11144477735', userId: 'u1' })).toBe('11144477735');
  });

  it('cai para a conta quando não há CPF', () => {
    expect(indiceDePessoaId({ cpf: '', userId: 'u1' })).toBe('uid_u1');
  });

  it('ignora CPF malformado em vez de aceitar chave torta', () => {
    expect(indiceDePessoaId({ cpf: '123', userId: 'u1' })).toBe('uid_u1');
  });

  it('aceita CPF com pontuação, como o formulário manda', () => {
    expect(indiceDePessoaId({ cpf: '111.444.777-35', userId: 'u1' })).toBe('11144477735');
  });

  // A âncora por conta divide coleção com a de CPF. Só é seguro porque CPF é
  // sempre 11 dígitos e o prefixo `uid_` começa com letra.
  it('não colide com um id de CPF', () => {
    const porConta = indiceDePessoaId({ userId: '11144477735' });

    expect(porConta).toBe('uid_11144477735');
    expect(porConta).not.toBe(indiceDePessoaId({ cpf: '11144477735' }));
  });

  it('devolve null quando não há âncora nenhuma', () => {
    expect(indiceDePessoaId({})).toBeNull();
    expect(promoUsageId('BLACK', {})).toBeNull();
  });

  it('monta a chave de uso da promoção com as duas âncoras', () => {
    expect(promoUsageId('BLACK', { cpf: '11144477735' })).toBe('BLACK_11144477735');
    expect(promoUsageId('BLACK', { userId: 'u1' })).toBe('BLACK_uid_u1');
  });

  it('sem código de promoção não há chave', () => {
    expect(promoUsageId('', { cpf: '11144477735' })).toBeNull();
  });
});
