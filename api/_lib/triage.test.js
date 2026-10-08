import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { triageCustomRequest } from './triage.js';

describe('triageCustomRequest', () => {
  const original = process.env.TYPESAFE_API_KEY;

  beforeEach(() => {
    delete process.env.TYPESAFE_API_KEY;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = original;
  });

  it('retorna null sem chamar o Jev quando TYPESAFE_API_KEY não está definida', async () => {
    await expect(triageCustomRequest({ productDesc: 'biscoito' })).resolves.toBeNull();
  });
});
