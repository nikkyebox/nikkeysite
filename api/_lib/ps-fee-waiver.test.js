import { beforeEach, describe, expect, it } from 'vitest';
import { issuePsFeeWaiver, PS_FEE_WAIVER_TTL_MS, verifyPsFeeWaiver } from './ps-fee-waiver.js';

describe('autorização da isenção da taxa PS', () => {
  beforeEach(() => {
    process.env.PS_FEE_WAIVER_SECRET = 'segredo-da-isencao';
  });

  it('vincula a autorização ao usuário e ao prazo de uma hora', () => {
    const issued = issuePsFeeWaiver('uid-1', 1_000);
    expect(issued.expiresAt).toBe(1_000 + PS_FEE_WAIVER_TTL_MS);
    expect(verifyPsFeeWaiver(issued.token, 'uid-1', 2_000)).toEqual({
      id: issued.id,
      expiresAt: issued.expiresAt,
    });
    expect(verifyPsFeeWaiver(issued.token, 'outro-uid', 2_000)).toBeNull();
    expect(verifyPsFeeWaiver(issued.token, 'uid-1', issued.expiresAt)).toBeNull();
  });

  it('rejeita qualquer alteração no conteúdo ou na assinatura', () => {
    const issued = issuePsFeeWaiver('uid-1', 1_000);
    const last = issued.token.at(-1);
    const tampered = `${issued.token.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`;
    expect(verifyPsFeeWaiver(tampered, 'uid-1', 2_000)).toBeNull();
  });
});
