import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getAuthMock: vi.fn(),
  getDbMock: vi.fn(),
}));

vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => mocks.getAuthMock(),
  adminDb: () => mocks.getDbMock(),
}));

const { requireAdmin, requireCronSecret, superAdminEmail } = await import('./auth.js');
const { HttpError } = await import('./http.js');

describe('superAdminEmail', () => {
  beforeEach(() => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.VITE_ADMIN_EMAIL;
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.VITE_ADMIN_EMAIL;
  });

  it('lança 503 admin_not_configured quando nenhuma env var está configurada', () => {
    expect(() => superAdminEmail()).toThrow(HttpError);
    try {
      superAdminEmail();
      expect.fail('deveria ter lançado');
    } catch (error) {
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('admin_not_configured');
    }
  });

  it('retorna ADMIN_EMAIL normalizado se configurado', () => {
    process.env.ADMIN_EMAIL = '  Paula@EXEMPLO.com  ';
    const email = superAdminEmail();
    expect(email).toBe('paula@exemplo.com');
  });

  it('retorna VITE_ADMIN_EMAIL normalizado se ADMIN_EMAIL não está', () => {
    process.env.VITE_ADMIN_EMAIL = '  BOB@STORE.com  ';
    const email = superAdminEmail();
    expect(email).toBe('bob@store.com');
  });

  it('prefere ADMIN_EMAIL sobre VITE_ADMIN_EMAIL', () => {
    process.env.ADMIN_EMAIL = 'alice@test.com';
    process.env.VITE_ADMIN_EMAIL = 'bob@test.com';
    const email = superAdminEmail();
    expect(email).toBe('alice@test.com');
  });
});

describe('requireAdmin', () => {
  beforeEach(() => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.VITE_ADMIN_EMAIL;
    mocks.verifyIdToken.mockClear();
    mocks.getAuthMock.mockClear();
    mocks.getDbMock.mockClear();
  });

  afterEach(() => {
    delete process.env.ADMIN_EMAIL;
    delete process.env.VITE_ADMIN_EMAIL;
  });

  it('rejeita com 403 forbidden se e-mail não está configurado e não há claims admin nem doc em admins', async () => {
    // Sem ADMIN_EMAIL, a branch de bootstrap é pulada.
    // User não tem claims admin e não está em admins/{uid}.
    const req = {
      headers: { authorization: 'Bearer fake-token' },
    };
    mocks.verifyIdToken.mockResolvedValue({
      uid: 'user123',
      // Justamente o endereço que era o fallback hardcoded: sem ADMIN_EMAIL
      // configurado ele não vale mais nada.
      email: 'dracko2007@gmail.com',
      email_verified: true,
      admin: false,
      role: 'user',
      adminRole: 0,
    });
    const auth = {
      verifyIdToken: mocks.verifyIdToken,
    };
    mocks.getAuthMock.mockReturnValue(auth);
    const db = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: false }),
        }),
      }),
    };
    mocks.getDbMock.mockReturnValue(db);

    try {
      await requireAdmin(req);
      expect.fail('deveria ter lançado HttpError 403');
    } catch (error) {
      expect(error instanceof HttpError).toBe(true);
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('forbidden');
    }
  });

  it('retorna user se tem claims admin mesmo sem ADMIN_EMAIL configurado', async () => {
    const req = {
      headers: { authorization: 'Bearer fake-token' },
    };
    const user = {
      uid: 'admin456',
      email: 'admin@internal.com',
      admin: true, // Já tem claim admin
      role: 'admin',
      adminRole: 0,
    };
    mocks.verifyIdToken.mockResolvedValue(user);
    const auth = { verifyIdToken: mocks.verifyIdToken };
    mocks.getAuthMock.mockReturnValue(auth);

    const result = await requireAdmin(req);
    expect(result).toEqual(user);
    // Nunca consulta Firebase quando tem claim admin
    expect(mocks.getDbMock).not.toHaveBeenCalled();
  });

  it('reconhece super-admin via e-mail verificado quando ADMIN_EMAIL está configurado', async () => {
    process.env.ADMIN_EMAIL = 'paula@store.com';
    const req = {
      headers: { authorization: 'Bearer fake-token' },
    };
    const user = {
      uid: 'paula-uid',
      email: 'paula@store.com',
      email_verified: true,
      admin: false,
      role: 'user',
      adminRole: 0,
    };
    mocks.verifyIdToken.mockResolvedValue(user);
    const auth = { verifyIdToken: mocks.verifyIdToken };
    mocks.getAuthMock.mockReturnValue(auth);

    const result = await requireAdmin(req);
    expect(result).toEqual(user);
    // Bootstrap via e-mail, não consulta banco
    expect(mocks.getDbMock).not.toHaveBeenCalled();
  });

  it('consulta admins/{uid} se nenhuma das branches anteriores concedeu', async () => {
    const req = {
      headers: { authorization: 'Bearer fake-token' },
    };
    const user = {
      uid: 'subadmin',
      email: 'sub@store.com',
      email_verified: true,
      admin: false,
      role: 'user',
      adminRole: 0,
    };
    mocks.verifyIdToken.mockResolvedValue(user);
    const auth = { verifyIdToken: mocks.verifyIdToken };
    mocks.getAuthMock.mockReturnValue(auth);
    
    // User encontrado em admins/{uid} com active: true
    const db = {
      collection: vi.fn().mockReturnValue({
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({
            exists: true,
            data: () => ({ active: true, role: 2 }),
          }),
        }),
      }),
    };
    mocks.getDbMock.mockReturnValue(db);

    const result = await requireAdmin(req);
    expect(result).toEqual(user);
  });
});

describe('requireCronSecret', () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('lança 503 cron_not_configured se CRON_SECRET não existe', () => {
    const req = { headers: { authorization: 'Bearer meu-segredo' } };
    try {
      requireCronSecret(req);
      expect.fail('deveria ter lançado');
    } catch (error) {
      expect(error instanceof HttpError).toBe(true);
      expect(error.statusCode).toBe(503);
      expect(error.code).toBe('cron_not_configured');
    }
  });

  it('aceita o segredo correto com Bearer prefix', () => {
    process.env.CRON_SECRET = 'meu-segredo-secreto';
    const req = { headers: { authorization: 'Bearer meu-segredo-secreto' } };
    // Não lança = OK
    expect(() => requireCronSecret(req)).not.toThrow();
  });

  it('rejeita com 401 se segredo está errado mas mesmo comprimento', () => {
    process.env.CRON_SECRET = 'meu-segredo-secreto';
    const req = { headers: { authorization: 'Bearer outro-segredo-errado' } };
    try {
      requireCronSecret(req);
      expect.fail('deveria ter lançado');
    } catch (error) {
      expect(error instanceof HttpError).toBe(true);
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('unauthorized');
    }
  });

  it('rejeita com 401 se segredo tem comprimento diferente (sem lançar ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH)', () => {
    process.env.CRON_SECRET = 'segredo-curto';
    const req = { headers: { authorization: 'Bearer segredo-muito-mais-longo-errado' } };
    try {
      requireCronSecret(req);
      expect.fail('deveria ter lançado');
    } catch (error) {
      expect(error instanceof HttpError).toBe(true);
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('unauthorized');
      // Importante: não é erro de timing.
      expect(error.message).not.toContain('ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH');
    }
  });

  it('rejeita se authorization header está vazio ou ausente', () => {
    process.env.CRON_SECRET = 'meu-segredo';
    const req = { headers: {} };
    try {
      requireCronSecret(req);
      expect.fail('deveria ter lançado');
    } catch (error) {
      expect(error instanceof HttpError).toBe(true);
      expect(error.statusCode).toBe(401);
    }
  });

  it('rejeita se authorization não tem formato Bearer', () => {
    process.env.CRON_SECRET = 'meu-segredo';
    const req = { headers: { authorization: 'BasicAuth meu-segredo' } };
    try {
      requireCronSecret(req);
      expect.fail('deveria ter lançado');
    } catch (error) {
      expect(error instanceof HttpError).toBe(true);
      expect(error.statusCode).toBe(401);
    }
  });
});
