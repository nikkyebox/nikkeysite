// Configuração/vencedores públicos ficam em `raffles/active`. Dados de contato
// e verificação social dos ganhadores ficam separados em `raffle_admin/active`,
// legíveis somente por administradores.
import { db } from '@/config/firebase';
import { collection, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { ensureAdminAuth } from '@/utils/adminAuth';

const isDev = import.meta.env.DEV;
const devWarn = isDev ? console.warn.bind(console) : () => {};

const RAFFLE_DOC = 'active';
const COL = 'raffles';
const ADMIN_COL = 'raffle_admin';
export const MAX_RAFFLE_PRIZES = 100;

export interface RafflePrize {
  rank: number;                 // posição no pódio, começa em 1
  type: 'product' | 'points';
  productId?: string;
  productName?: string;
  productImage?: string;
  productUrl?: string;          // rota interna do produto (/produto/:id)
  points?: number;
}

/** Shape público: nunca inclui e-mail, UID ou estado das redes sociais. */
export interface RaffleWinner {
  rank: number;
  userName: string;
}

export interface RaffleAdminWinner extends RaffleWinner {
  userId: string;
  userEmail: string;
  followsInstagram: boolean;
  followsTiktok: boolean;
}

export interface Raffle {
  rules: string;
  prizeCount: number;
  prizes: RafflePrize[];
  winners: RaffleWinner[];
  drawnAt: string | null;
  published: boolean;
}

export interface RaffleParticipant {
  id: string;
  name: string;
  email: string;
  followsInstagram: boolean;
  followsTiktok: boolean;
}

const DEFAULT_RAFFLE: Raffle = {
  rules: '',
  prizeCount: 3,
  prizes: [],
  winners: [],
  drawnAt: null,
  published: false,
};

// O doc pode ter sido gravado por uma versão anterior sem alguns campos;
// normaliza sempre para o shape completo antes de entregar à UI.
// Valida e normaliza dados vindos do Firestore. snap.data() é unknown,
// então buscamos os campos conhecidos com type guards mínimos.
const normalize = (data: unknown): Raffle => {
  if (!data || typeof data !== 'object') return DEFAULT_RAFFLE;
  const record = data as Record<string, unknown>;
  
  const rules = typeof record.rules === 'string' ? record.rules : '';
  const rawCount = Number(record.prizeCount);
  const prizeCount = Number.isFinite(rawCount)
    ? Math.max(1, Math.min(MAX_RAFFLE_PRIZES, Math.floor(rawCount)))
    : 3;
  const prizes = Array.isArray(record.prizes) ? record.prizes : [];
  const winners = Array.isArray(record.winners)
    ? record.winners.flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const winner = value as Record<string, unknown>;
        const rank = Math.floor(Number(winner.rank));
        const userName = typeof winner.userName === 'string' ? winner.userName : '';
        return rank > 0 && userName ? [{ rank, userName }] : [];
      })
    : [];
  const drawnAt = typeof record.drawnAt === 'string' ? record.drawnAt : null;
  const published = Boolean(record.published);

  return { rules, prizeCount, prizes: prizes as RafflePrize[], winners, drawnAt, published };
};

export const raffleService = {
  async getRaffle(): Promise<Raffle> {
    if (!db) return DEFAULT_RAFFLE;
    try {
      const snap = await getDoc(doc(db, COL, RAFFLE_DOC));
      if (!snap.exists()) return DEFAULT_RAFFLE;
      return normalize(snap.data());
    } catch (e) {
      devWarn('raffleService.getRaffle falhou:', e);
      return DEFAULT_RAFFLE;
    }
  },

  // Listener em tempo real (mesmo padrão de negotiationService.listenById).
  //
  // `onError` não é opcional por capricho: sem ele, quem chama fica preso no
  // estado de "carregando" quando o Firestore recusa a leitura (regra não
  // publicada, rede caída), porque o callback de sucesso nunca roda. Em
  // produção o `devWarn` é no-op, então a tela trava sem nem um log.
  subscribe(cb: (raffle: Raffle) => void, onError?: (err: unknown) => void): () => void {
    if (!db) {
      onError?.(new Error('Firebase indisponível'));
      return () => undefined;
    }
    return onSnapshot(
      doc(db, COL, RAFFLE_DOC),
      (snap) => cb(snap.exists() ? normalize(snap.data()) : DEFAULT_RAFFLE),
      (err) => {
        devWarn('raffleService.subscribe falhou:', err);
        onError?.(err);
      }
    );
  },

  async getAdminWinners(): Promise<RaffleAdminWinner[]> {
    if (!db) return [];
    await ensureAdminAuth();
    const snap = await getDoc(doc(db, ADMIN_COL, RAFFLE_DOC));
    const values = snap.exists() && Array.isArray(snap.data()?.winners) ? snap.data().winners : [];
    return values.flatMap((value: unknown) => {
      if (!value || typeof value !== 'object') return [];
      const winner = value as Record<string, unknown>;
      const rank = Math.floor(Number(winner.rank));
      const userId = typeof winner.userId === 'string' ? winner.userId : '';
      const userName = typeof winner.userName === 'string' ? winner.userName : '';
      if (!(rank > 0) || !userId || !userName) return [];
      return [{
        rank,
        userId,
        userName,
        userEmail: typeof winner.userEmail === 'string' ? winner.userEmail : '',
        followsInstagram: winner.followsInstagram === true,
        followsTiktok: winner.followsTiktok === true,
      }];
    });
  },

  async saveConfig(partial: Partial<Raffle>): Promise<void> {
    if (!db) throw new Error('Firebase indisponível');
    await ensureAdminAuth();
    const safe: Partial<Raffle> = { ...partial };
    if (safe.prizeCount !== undefined) {
      safe.prizeCount = Math.max(1, Math.min(MAX_RAFFLE_PRIZES, Math.floor(Number(safe.prizeCount)) || 1));
    }
    if (safe.prizes) safe.prizes = safe.prizes.slice(0, MAX_RAFFLE_PRIZES);
    const changesPrizes = safe.prizeCount !== undefined || safe.prizes !== undefined;
    if (!changesPrizes) {
      await setDoc(doc(db, COL, RAFFLE_DOC), { ...safe, updatedAt: serverTimestamp() }, { merge: true });
      return;
    }
    await runTransaction(db, async (transaction) => {
      const raffleRef = doc(db, COL, RAFFLE_DOC);
      const snapshot = await transaction.get(raffleRef);
      if (snapshot.exists() && (snapshot.data()?.drawnAt
        || (Array.isArray(snapshot.data()?.winners) && snapshot.data().winners.length > 0))) {
        throw new Error('Inicie um novo sorteio antes de alterar os prêmios.');
      }
      transaction.set(raffleRef, { ...safe, updatedAt: serverTimestamp() }, { merge: true });
    });
  },

  // Todos os cadastrados entram no sorteio. Lê só a coleção `users` — de
  // propósito não usa customerService.getAllCustomersAsync(), que também
  // varre `orders` inteira (custo de leitura alto) e não devolve o id do doc.
  async listParticipants(): Promise<RaffleParticipant[]> {
    if (!db) return [];
    try {
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map((d) => {
        const data = d.data() as unknown;
        if (!data || typeof data !== 'object') {
          return { id: d.id, name: '', email: '', followsInstagram: false, followsTiktok: false };
        }
        const record = data as Record<string, unknown>;
        const follows = (record.socialFollows as unknown) ?? {};
        const followsRecord = typeof follows === 'object' && follows !== null 
          ? (follows as Record<string, unknown>) 
          : {};
        return {
          id: d.id,
          name: (typeof record.name === 'string' ? record.name : '') || (typeof record.email === 'string' ? record.email : '') || 'Sem nome',
          email: typeof record.email === 'string' ? record.email : '',
          followsInstagram: Boolean(followsRecord.instagram),
          followsTiktok: Boolean(followsRecord.tiktok),
        };
      });
    } catch (e) {
      devWarn('raffleService.listParticipants falhou:', e);
      return [];
    }
  },

  // Sorteia sem repetição com Web Crypto. O resultado público não carrega PII;
  // a cópia completa, usada para contato/avisos, vai ao documento privado.
  async draw(prizes: RafflePrize[], participants: RaffleParticipant[]): Promise<RaffleAdminWinner[]> {
    if (!db) throw new Error('Firebase indisponível');
    if (!globalThis.crypto?.getRandomValues) throw new Error('Sorteio seguro indisponível neste navegador');
    const pool = [...participants];
    const random = new Uint32Array(1);
    for (let i = pool.length - 1; i > 0; i -= 1) {
      globalThis.crypto.getRandomValues(random);
      const j = Math.floor((random[0] / 0x1_0000_0000) * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const ordered = [...prizes]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_RAFFLE_PRIZES);
    const adminWinners: RaffleAdminWinner[] = ordered.slice(0, pool.length).map((prize, index) => ({
      rank: prize.rank,
      userId: pool[index].id,
      userName: pool[index].name,
      userEmail: pool[index].email,
      followsInstagram: pool[index].followsInstagram,
      followsTiktok: pool[index].followsTiktok,
    }));
    const eligibleWinners = adminWinners.filter(
      (winner) => winner.followsInstagram && winner.followsTiktok,
    );
    const publicWinners: RaffleWinner[] = eligibleWinners.map(
      ({ rank, userName }) => ({ rank, userName }),
    );
    const awards = eligibleWinners.flatMap((winner) => {
      const prize = ordered.find((entry) => entry.rank === winner.rank);
      const points = prize?.type === 'points' ? Math.max(0, Math.floor(Number(prize.points || 0))) : 0;
      return points > 0 ? [{ userId: winner.userId, points }] : [];
    });

    await ensureAdminAuth();
    await runTransaction(db, async (transaction) => {
      const raffleRef = doc(db, COL, RAFFLE_DOC);
      const adminRef = doc(db, ADMIN_COL, RAFFLE_DOC);
      const userRefs = awards.map(({ userId }) => doc(db, 'users', userId));
      const [raffleSnapshot, ...userSnapshots] = await Promise.all([
        transaction.get(raffleRef),
        ...userRefs.map((ref) => transaction.get(ref)),
      ]);
      if (raffleSnapshot.exists() && (raffleSnapshot.data()?.drawnAt
        || (Array.isArray(raffleSnapshot.data()?.winners) && raffleSnapshot.data().winners.length > 0))) {
        throw new Error('Este sorteio já foi realizado. Inicie um novo sorteio antes de sortear novamente.');
      }
      const now = new Date().toISOString();
      for (let index = 0; index < userSnapshots.length; index += 1) {
        const snapshot = userSnapshots[index];
        if (!snapshot.exists()) throw new Error(`Usuário do prêmio ${index + 1} não encontrado`);
        const current = Number(snapshot.data()?.points || 0);
        transaction.update(userRefs[index], {
          points: (Number.isFinite(current) ? Math.max(0, current) : 0) + awards[index].points,
          updatedAt: now,
        });
      }
      transaction.set(
        raffleRef,
        { winners: publicWinners, drawnAt: now, updatedAt: serverTimestamp() },
        { merge: true },
      );
      transaction.set(
        adminRef,
        { winners: adminWinners, drawnAt: now, updatedAt: serverTimestamp() },
        { merge: true },
      );
    });
    return adminWinners;
  },

  async resetDraw(): Promise<void> {
    if (!db) throw new Error('Firebase indisponível');
    await ensureAdminAuth();
    await runTransaction(db, async (transaction) => {
      transaction.set(
        doc(db, COL, RAFFLE_DOC),
        { winners: [], drawnAt: null, published: false, updatedAt: serverTimestamp() },
        { merge: true },
      );
      transaction.set(
        doc(db, ADMIN_COL, RAFFLE_DOC),
        { winners: [], drawnAt: null, updatedAt: serverTimestamp() },
        { merge: true },
      );
    });
  },

  async publish(flag: boolean): Promise<void> {
    await this.saveConfig({ published: flag });
  },
};
