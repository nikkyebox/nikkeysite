// Sistema de pontos de fidelidade.
// Regras:
//  - 1 ponto por avaliação (nota 1–5 + comentário), 1 por produto, qualquer nota.
//  - Vídeo de review: 5 pontos por minuto (1 min = 5, 2 min = 10), 1 vídeo por produto,
//    liberado SÓ após o admin validar (pode mandar vídeo que não é review).
//  - 1 ponto a cada 100 ¥ em produtos. Frete e taxa do personal shopper não
//    contam; cupom e desconto de pagamento NÃO cortam ponto (vale o valor
//    cheio da mercadoria). Só o que foi pago com pontos sai da base.
//  - Aniversário: 1000 pontos para a próxima compra.
//  - Resgate: 1 ponto = ¥1 de desconto.
import {
  currentTier,
  earnedPointsForOrder,
  pointsForSpendYen,
  pointsMultiplierForSpend,
  spendWindowStart,
  tierProgress,
  TIERS,
  POINTS_PER_100_YEN,
  YEN_PER_POINT,
} from '../../shared/points.js';
import { db } from '@/config/firebase';
import { collection, deleteDoc, doc, getDoc, getDocs, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { safeStorage } from '@/utils/storage';
import { ensureAdminAuth } from '@/utils/adminAuth';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


export const POINTS = {
  perReview: 1,
  perVideoMinute: 5,
  per100YenSpent: POINTS_PER_100_YEN,
  birthday: 1000,
  yenPerPoint: YEN_PER_POINT, // 1 ponto = ¥1 de desconto
  minRedeem: 1000,            // mínimo para resgatar
};

export type VideoReviewStatus = 'pending' | 'approved' | 'rejected';

export interface VideoReview {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  productId: string;
  productName: string;
  videoUrl: string;
  status: VideoReviewStatus;
  submittedAt: string;
  minutes?: number;       // preenchido pelo admin ao validar
  pointsAwarded?: number; // pontos concedidos na validação
}

const COL = 'video_reviews';
const LOCAL = 'jp_video_reviews';

// `pointsForSpendYen` e `earnedPointsForOrder` vêm de `shared/points.js` — a
// mesma função que `api/_lib/commerce.js` usa para creditar. Reimplementar aqui
// foi o que fez a tela prometer 100 e o servidor pagar 85.
export { currentTier, earnedPointsForOrder, pointsForSpendYen, pointsMultiplierForSpend, spendWindowStart, tierProgress, TIERS };

/** Pontos por minutos de vídeo: 5 por minuto iniciado (mín. 1 min). */
export const pointsForVideoMinutes = (minutes: number): number => {
  const m = Math.max(1, Math.floor(minutes || 0));
  return m * POINTS.perVideoMinute;
};

function readLocal(): VideoReview[] {
  try { return JSON.parse(safeStorage.getItem(LOCAL) || '[]'); } catch { return []; }
}
function writeLocal(list: VideoReview[]) {
  safeStorage.setItem(LOCAL, JSON.stringify(list));
}

export const pointsService = {
  POINTS,

  /** Cliente envia um vídeo de review para validação (1 por produto). */
  async submitVideo(entry: Omit<VideoReview, 'id' | 'status' | 'submittedAt' | 'minutes' | 'pointsAwarded'>): Promise<{ ok: boolean; error?: string }> {
    const id = `vr-${entry.userId}-${entry.productId}`; // 1 por usuário+produto
    const rec: VideoReview = {
      id,
      userId: entry.userId,
      userName: entry.userName,
      userEmail: entry.userEmail,
      productId: entry.productId,
      productName: entry.productName,
      videoUrl: entry.videoUrl,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      minutes: 0,
      pointsAwarded: 0,
    };
    // cache local
    const local = readLocal().filter((v) => v.id !== id);
    local.push(rec);
    writeLocal(local);
    if (!db) return { ok: true };
    try {
      await setDoc(doc(db, COL, id), rec);
      return { ok: true };
    } catch (e: unknown) {
      devWarn('[points] submitVideo falhou:', e);
      return { ok: false, error: e instanceof Error ? e.message : 'Falha ao enviar vídeo' };
    }
  },

  /** Já existe vídeo (pendente/aprovado) deste usuário para o produto? */
  async hasVideoForProduct(userId: string, productId: string): Promise<boolean> {
    const id = `vr-${userId}-${productId}`;
    if (readLocal().some((v) => v.id === id)) return true;
    if (!db) return false;
    try {
      const snap = await getDoc(doc(db, COL, id));
      return snap.exists();
    } catch { return false; }
  },

  /** Lista de vídeos (admin). */
  async getVideoReviews(): Promise<VideoReview[]> {
    if (!db) return readLocal();
    try {
      const snap = await getDocs(collection(db, COL));
      const list: VideoReview[] = [];
      snap.forEach((d) => list.push(d.data() as VideoReview));
      return list.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
    } catch (e) {
      devWarn('[points] getVideoReviews falhou:', e);
      return readLocal();
    }
  },

  /** Admin aprova e credita pontos atomicamente; repetir a ação não duplica crédito. */
  async approveVideo(v: VideoReview, minutes: number): Promise<{ ok: boolean; points: number; error?: string }> {
    const approvedMinutes = Math.min(180, Math.max(1, Math.floor(Number(minutes) || 1)));
    const points = pointsForVideoMinutes(approvedMinutes);
    try {
      if (!db) throw new Error('Firebase indisponível');
      await ensureAdminAuth();
      let creditedPoints = points;
      await runTransaction(db, async (transaction) => {
        const videoRef = doc(db, COL, v.id);
        const videoSnapshot = await transaction.get(videoRef);
        if (!videoSnapshot.exists()) throw new Error('Vídeo não encontrado');

        const video = videoSnapshot.data() as VideoReview;
        if (video.status === 'approved') {
          creditedPoints = Number(video.pointsAwarded || 0);
          return;
        }
        if (video.status !== 'pending') throw new Error('Vídeo não está pendente');

        const userRef = doc(db, 'users', video.userId);
        const userSnapshot = await transaction.get(userRef);
        if (!userSnapshot.exists()) throw new Error('Usuário não encontrado');
        const current = Number(userSnapshot.data()?.points || 0);
        const currentPoints = Number.isFinite(current) ? Math.max(0, current) : 0;

        transaction.update(userRef, { points: currentPoints + points });
        transaction.update(videoRef, {
          status: 'approved',
          minutes: approvedMinutes,
          pointsAwarded: points,
        });
      });
      writeLocal(readLocal().map((entry) => (
        entry.id === v.id
          ? { ...entry, status: 'approved', minutes: approvedMinutes, pointsAwarded: creditedPoints }
          : entry
      )));
      return { ok: true, points: creditedPoints };
    } catch (e: unknown) {
      return { ok: false, points: 0, error: e instanceof Error ? e.message : 'Falha ao aprovar vídeo' };
    }
  },

  /** Admin rejeita o vídeo (não concede pontos). */
  async rejectVideo(v: VideoReview): Promise<boolean> {
    try {
      if (db) await updateDoc(doc(db, COL, v.id), { status: 'rejected' });
      writeLocal(readLocal().map((x) => (x.id === v.id ? { ...x, status: 'rejected' } : x)));
      return true;
    } catch { return false; }
  },

  async removeVideo(id: string): Promise<boolean> {
    try {
      if (db) await deleteDoc(doc(db, COL, id));
      writeLocal(readLocal().filter((x) => x.id !== id));
      return true;
    } catch { return false; }
  },

};
