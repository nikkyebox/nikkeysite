import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claimBirthday,
  claimProductReview,
  claimSocialFollow,
} from '../user-rewards.js';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock('./firebase-admin.js', () => ({
  adminAuth: () => ({ getUser: mocks.getUser }),
  adminDb: vi.fn(),
}));
function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

class FakeQuery {
  constructor(db, collectionName, filters = [], max = Infinity) {
    this.db = db;
    this.collectionName = collectionName;
    this.filters = filters;
    this.max = max;
  }

  where(field, operator, value) {
    if (operator !== '==') throw new Error('unsupported_operator');
    return new FakeQuery(this.db, this.collectionName, [...this.filters, { field, value }], this.max);
  }

  limit(max) {
    return new FakeQuery(this.db, this.collectionName, this.filters, max);
  }

  async get() {
    const prefix = `${this.collectionName}/`;
    const docs = [];
    for (const [path, value] of this.db.docs) {
      if (!path.startsWith(prefix) || path.slice(prefix.length).includes('/')) continue;
      if (!this.filters.every((filter) => value?.[filter.field] === filter.value)) continue;
      const id = path.slice(prefix.length);
      docs.push({ id, exists: true, data: () => clone(value) });
      if (docs.length >= this.max) break;
    }
    return { docs, empty: docs.length === 0 };
  }
}

class FakeDb {
  constructor(initial) {
    this.docs = new Map(Object.entries(initial).map(([path, value]) => [path, clone(value)]));
  }

  collection(name) {
    const query = new FakeQuery(this, name);
    query.doc = (id) => ({ path: `${name}/${id}`, id: String(id) });
    return query;
  }

  snapshot(ref, docs = this.docs) {
    const value = docs.get(ref.path);
    return { ref, id: ref.id, exists: value !== undefined, data: () => clone(value) };
  }

  async runTransaction(callback) {
    const working = new Map([...this.docs].map(([path, value]) => [path, clone(value)]));
    const transaction = {
      get: async (ref) => this.snapshot(ref, working),
      create: (ref, value) => {
        if (working.has(ref.path)) throw new Error('already_exists');
        working.set(ref.path, clone(value));
      },
      update: (ref, value) => {
        if (!working.has(ref.path)) throw new Error('not_found');
        working.set(ref.path, { ...working.get(ref.path), ...clone(value) });
      },
    };
    const result = await callback(transaction);
    this.docs = working;
    return result;
  }

  get(path) {
    return clone(this.docs.get(path));
  }
}

const user = { uid: 'u1', email: 'buyer@example.com' };

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

beforeEach(() => {
  // Por padrão, conta criada há 365 dias (passa na validação de idade mínima)
  const oldTime = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  mocks.getUser.mockResolvedValue({ metadata: { creationTime: oldTime } });
});

describe('server-defined user rewards', () => {
  it('awards each social network once and ignores replay', async () => {
    const db = new FakeDb({ 'users/u1': { points: 100, socialFollows: {} } });

    await expect(claimSocialFollow(db, user, { action: 'social-follow', network: 'instagram', points: 999999 }))
      .rejects.toMatchObject({ statusCode: 400 });

    const first = await claimSocialFollow(db, user, { action: 'social-follow', network: 'instagram' });
    const replay = await claimSocialFollow(db, user, { action: 'social-follow', network: 'instagram' });

    expect(first).toEqual({ ok: true, awarded: 500, total: 600, alreadyClaimed: false });
    expect(replay).toEqual({ ok: true, awarded: 0, total: 600, alreadyClaimed: true });
    expect(db.get('users/u1')).toMatchObject({ points: 600, socialFollows: { instagram: true } });
  });

  it('derives birthday eligibility in Tokyo and awards once per year', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-14T15:30:00.000Z'));
    const db = new FakeDb({ 'users/u1': { points: 10, birthdate: '1990-01-15' } });

    const first = await claimBirthday(db, user, { action: 'birthday' });
    const replay = await claimBirthday(db, user, { action: 'birthday' });

    expect(first).toEqual({ ok: true, awarded: 1000, total: 1010, alreadyClaimed: false });
    expect(replay).toEqual({ ok: true, awarded: 0, total: 1010, alreadyClaimed: true });
    expect(db.get('users/u1')).toMatchObject({ points: 1010, birthdayBonusYear: 2026 });
  });

  it('rejects a birthday reward on any other Tokyo date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-13T15:30:00.000Z'));
    const db = new FakeDb({ 'users/u1': { points: 10, birthdate: '1990-01-15' } });

    await expect(claimBirthday(db, user, { action: 'birthday' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'birthday_unavailable' });
    expect(db.get('users/u1').points).toBe(10);
  });

  it('recusa o bônus de aniversário quando a conta tem menos de 30 dias', async () => {
    vi.useFakeTimers();
    // UTC time que resulta em 2026-01-15 em Tóquio (UTC+9)
    vi.setSystemTime(new Date('2026-01-14T15:30:00.000Z'));
    // Conta criada há apenas 10 dias
    const recentTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    mocks.getUser.mockResolvedValue({ metadata: { creationTime: recentTime } });
    const db = new FakeDb({ 'users/u1': { points: 10, birthdate: '1990-01-15' } });

    await expect(claimBirthday(db, user, { action: 'birthday' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'birthday_unavailable' });
    // Garante que nenhum ponto foi creditado
    expect(db.get('users/u1').points).toBe(10);
  });

  // O caso que a trava dos 30 dias atropelava: a pessoa se cadastra NO dia do
  // próprio aniversário — muitas vezes por causa do próprio brinde — e levava
  // um "indisponível". Conta nova e golpista olham igual no cadastro; o que
  // separa os dois é ter comprado de verdade. Ninguém paga um pedido para
  // levar ¥1.000 de desconto.
  it('libera na hora para conta nova que já tem compra paga', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-14T15:30:00.000Z'));
    // Cadastrou hoje, e hoje é o aniversário dela.
    mocks.getUser.mockResolvedValue({ metadata: { creationTime: new Date().toISOString() } });
    const db = new FakeDb({
      'users/u1': { points: 10, birthdate: '1990-01-15' },
      'orders/o1': { userId: 'u1', paymentConfirmed: true, items: [{ productId: 'p1' }] },
    });

    const resultado = await claimBirthday(db, user, { action: 'birthday' });

    expect(resultado).toEqual({ ok: true, awarded: 1000, total: 1010, alreadyClaimed: false });
  });

  // Pedido criado mas não pago não vale: senão bastava abrir um checkout e
  // abandonar para destravar o brinde, que é de graça.
  it('pedido não pago não destrava a conta nova', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-14T15:30:00.000Z'));
    mocks.getUser.mockResolvedValue({ metadata: { creationTime: new Date().toISOString() } });
    const db = new FakeDb({
      'users/u1': { points: 10, birthdate: '1990-01-15' },
      'orders/o1': { userId: 'u1', status: 'pending_payment', paymentConfirmed: false },
    });

    await expect(claimBirthday(db, user, { action: 'birthday' }))
      .rejects.toMatchObject({ statusCode: 409, code: 'birthday_unavailable' });
    expect(db.get('users/u1').points).toBe(10);
  });

  // Convidado que comprou antes de criar conta fica preso ao e-mail, sem
  // `userId`. Ignorar esse caminho puniria justamente o cliente mais antigo.
  it('conta a compra feita como convidado, pelo e-mail', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-14T15:30:00.000Z'));
    mocks.getUser.mockResolvedValue({ metadata: { creationTime: new Date().toISOString() } });
    const db = new FakeDb({
      'users/u1': { points: 10, birthdate: '1990-01-15' },
      'orders/o1': { customerEmail: 'buyer@example.com', paymentConfirmed: true },
    });

    const resultado = await claimBirthday(db, user, { action: 'birthday' });

    expect(resultado.awarded).toBe(1000);
  });

  // A primeira versão desta trava comparava `NaN < 30`, que é `false` — ou
  // seja, conta sem data de criação legível passava direto e ganhava o bônus.
  // Checagem de segurança precisa recusar quando não consegue decidir.
  it('recusa quando não dá para saber a idade da conta', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-14T15:30:00.000Z'));
    const db = new FakeDb({ 'users/u1': { points: 10, birthdate: '1990-01-15' } });

    for (const metadata of [{}, { creationTime: undefined }, { creationTime: 'nao-e-data' }]) {
      mocks.getUser.mockResolvedValue({ metadata });
      await expect(claimBirthday(db, user, { action: 'birthday' }))
        .rejects.toMatchObject({ statusCode: 409, code: 'birthday_unavailable' });
    }
    expect(db.get('users/u1').points).toBe(10);
  });

  it('credita 1000 pontos no primeiro resgate do ano para conta antiga', async () => {
    vi.useFakeTimers();
    // UTC time que resulta em 2026-03-20 em Tóquio (UTC+9)
    vi.setSystemTime(new Date('2026-03-19T15:30:00.000Z'));
    const db = new FakeDb({ 'users/u1': { points: 10, birthdate: '1990-03-20' } });

    const first = await claimBirthday(db, user, { action: 'birthday' });

    expect(first).toEqual({ ok: true, awarded: 1000, total: 1010, alreadyClaimed: false });
    expect(db.get('users/u1')).toMatchObject({ points: 1010, birthdayBonusYear: 2026 });
  });

  it('não credita de novo quando birthdayBonusYear já é o ano corrente', async () => {
    vi.useFakeTimers();
    // UTC time que resulta em 2026-05-22 em Tóquio (UTC+9)
    vi.setSystemTime(new Date('2026-05-21T15:30:00.000Z'));
    const db = new FakeDb({
      'users/u1': { points: 1010, birthdate: '1990-05-22', birthdayBonusYear: 2026 },
    });

    const replay = await claimBirthday(db, user, { action: 'birthday' });

    expect(replay).toEqual({ ok: true, awarded: 0, total: 1010, alreadyClaimed: true });
    expect(db.get('users/u1').points).toBe(1010);
  });

  it('requires a paid product order and credits one review point once', async () => {
    const db = new FakeDb({
      'users/u1': { points: 50 },
      'orders/O1': {
        userId: 'u1',
        customerEmail: 'buyer@example.com',
        paymentConfirmed: true,
        items: [{ productId: 'p1' }],
      },
    });

    const first = await claimProductReview(db, user, { action: 'product-review', productId: 'p1' });
    const replay = await claimProductReview(db, user, { action: 'product-review', productId: 'p1' });

    expect(first).toEqual({ ok: true, awarded: 1, total: 51, alreadyClaimed: false });
    expect(replay).toEqual({ ok: true, awarded: 0, total: 51, alreadyClaimed: true });
    expect(db.get('users/u1').points).toBe(51);
  });

  it('does not reward a review for an unpaid order', async () => {
    const db = new FakeDb({
      'users/u1': { points: 50 },
      'orders/O1': {
        userId: 'u1',
        status: 'pending_payment',
        paymentConfirmed: false,
        items: [{ productId: 'p1' }],
      },
    });

    await expect(claimProductReview(db, user, { action: 'product-review', productId: 'p1' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'verified_purchase_required' });
    expect(db.get('users/u1').points).toBe(50);
  });
});
