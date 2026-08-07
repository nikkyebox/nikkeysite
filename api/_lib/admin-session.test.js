import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  adminAuth: {
    createCustomToken: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    setCustomUserClaims: vi.fn(),
  },
  adminDb: {
    collection: vi.fn(),
    batch: vi.fn(),
  },
}));

vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => mocks.adminAuth,
  adminDb: () => mocks.adminDb,
}));

vi.mock('./rate-limit.js', () => ({
  enforceRateLimit: vi.fn(),
}));

import { handleSession as adminSessionHandler } from '../admin.js';

function mockReq(method, body, headers = {}) {
  return {
    method,
    headers: { origin: 'https://nikkeybox-store.com', ...headers },
    body: body ? JSON.stringify(body) : undefined,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    json(data) { this.body = data; return this; },
    end() { return this; },
  };
  return res;
}

/** Mocks `db.collection('admins')` for the "migrated" (already Firebase-backed) lookup. */
function mockMigratedQuery({ empty, doc } = { empty: true }) {
  return {
    where: vi.fn(() => ({
      limit: vi.fn(() => ({
        get: vi.fn(async () => (empty
          ? { empty: true, docs: [] }
          : { empty: false, docs: [{ id: doc.id, data: () => doc.data }] })),
      })),
    })),
    doc: vi.fn(),
  };
}

describe('admin-session endpoint (sub-admin auth only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.adminAuth.createCustomToken.mockResolvedValue('custom-token-abc');
    process.env.FIREBASE_WEB_API_KEY = 'fake-key';
    globalThis.fetch = vi.fn();
  });

  it('rejects GET method', async () => {
    const req = mockReq('GET', null);
    const res = mockRes();
    await adminSessionHandler(req, res);
    expect([405, 403]).toContain(res.statusCode);
  });

  it('rejects unknown username with 401 (no migrated or legacy record)', async () => {
    mocks.adminDb.collection.mockImplementation((name) => {
      expect(name).toBe('admins');
      return {
        where: vi.fn(() => ({ limit: vi.fn(() => ({ get: vi.fn(async () => ({ empty: true, docs: [] })) })) })),
        doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: false })) })),
      };
    });
    const req = mockReq('POST', { identifier: 'ghost', password: 'whatever' });
    const res = mockRes();
    await adminSessionHandler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('authenticates an already-migrated sub-admin and returns a custom token', async () => {
    const doc = { id: 'uid-migrated', data: { username: 'joao', authEmail: 'admin-x@auth.nikkeybox-store.com', active: true, name: 'Joao', role: 2 } };
    mocks.adminDb.collection.mockReturnValue(mockMigratedQuery({ empty: false, doc }));
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ localId: 'uid-migrated' }) });

    const req = mockReq('POST', { identifier: 'joao', password: 'correct-password' });
    const res = mockRes();
    await adminSessionHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.customToken).toBe('custom-token-abc');
    expect(res.body.admin.role).toBe(2);
  });

  it('rejects a migrated sub-admin when the Identity Toolkit UID does not match the stored doc id (impersonation guard)', async () => {
    const doc = { id: 'uid-migrated', data: { username: 'joao', authEmail: 'admin-x@auth.nikkeybox-store.com', active: true, name: 'Joao', role: 2 } };
    mocks.adminDb.collection.mockReturnValue(mockMigratedQuery({ empty: false, doc }));
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ localId: 'someone-else-uid' }) });

    const req = mockReq('POST', { identifier: 'joao', password: 'correct-password' });
    const res = mockRes();
    await adminSessionHandler(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('rejects a deactivated migrated sub-admin', async () => {
    const doc = { id: 'uid-migrated', data: { username: 'joao', authEmail: 'admin-x@auth.nikkeybox-store.com', active: false, name: 'Joao', role: 1 } };
    mocks.adminDb.collection.mockReturnValue(mockMigratedQuery({ empty: false, doc }));

    const req = mockReq('POST', { identifier: 'joao', password: 'whatever' });
    const res = mockRes();
    await adminSessionHandler(req, res);

    expect(res.statusCode).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // Regressão do ALTO 4 do AUDITORIA.md. Antes, um doc `admins/{username}` com
  // o campo `password` em CLARO era aceito no login e migrado para o Firebase
  // Auth. Isso obrigava o servidor a saber ler senha em claro, e qualquer dump
  // (ou restauração de backup antigo) do Firestore entregava o painel.
  //
  // Agora o caminho não existe: só autentica quem tem `authEmail` e conta no
  // Firebase Auth. Estes dois testes existem para impedir que ele volte.
  it('recusa doc legado com senha em claro, mesmo com a senha certa', async () => {
    const docLegado = { active: true, password: 'senha-em-claro', name: 'Legacy Joao', role: 1 };
    mocks.adminDb.collection.mockImplementation(() => ({
      // Nenhum registro migrado: só existe o doc legado, indexado por username.
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: vi.fn(async () => ({ empty: true, docs: [] })) })) })),
      doc: vi.fn((id) => ({ get: vi.fn(async () => ({ exists: true, data: () => docLegado })), path: `admins/${id}` })),
    }));

    const req = mockReq('POST', { identifier: 'legacy-joao', password: 'senha-em-claro' });
    const res = mockRes();
    await adminSessionHandler(req, res);

    expect(res.statusCode).toBe(401);
    // O ponto do teste: a senha batia. Ainda assim não entra, não cria conta no
    // Firebase Auth e não escreve nada.
    expect(mocks.adminAuth.createUser).not.toHaveBeenCalled();
    expect(mocks.adminAuth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(mocks.adminDb.batch).not.toHaveBeenCalled();
  });

  it('recusa doc legado com senha errada', async () => {
    const docLegado = { active: true, password: 'senha-real', name: 'Legacy Joao', role: 1 };
    mocks.adminDb.collection.mockImplementation(() => ({
      where: vi.fn(() => ({ limit: vi.fn(() => ({ get: vi.fn(async () => ({ empty: true, docs: [] })) })) })),
      doc: vi.fn(() => ({ get: vi.fn(async () => ({ exists: true, data: () => docLegado })) })),
    }));

    const req = mockReq('POST', { identifier: 'legacy-joao', password: 'senha-errada' });
    const res = mockRes();
    await adminSessionHandler(req, res);

    expect(res.statusCode).toBe(401);
    expect(mocks.adminAuth.createUser).not.toHaveBeenCalled();
  });
});
