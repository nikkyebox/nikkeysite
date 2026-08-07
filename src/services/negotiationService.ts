import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  getDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, auth } from '@/config/firebase';
import { Negotiation } from '@/types/negotiation';

const COL = 'negotiations';
const EXPIRY_HOURS = 24;

type CreateNegotiationInput = Omit<
  Negotiation,
  | 'id'
  | 'userId'
  | 'userEmail'
  | 'status'
  | 'autoApproved'
  | 'approvedDiscountYen'
  | 'approvedBy'
  | 'approvedAt'
  | 'adminNote'
  | 'createdAt'
  | 'expiresAt'
  | 'resolvedAt'
  | 'clientNotified'
  | 'clientSeen'
>;

export const negotiationService = {
  async create(data: CreateNegotiationInput): Promise<Negotiation> {
    // A identidade e o estado inicial vêm da sessão e deste serviço, nunca do caller.
    const cur = auth?.currentUser;
    if (!cur) {
      throw new Error('É preciso estar logado para enviar a negociação.');
    }

    if (!Number.isFinite(data.requestedDiscountYen) || data.requestedDiscountYen <= 0) {
      throw new Error('O desconto solicitado deve ser maior que zero.');
    }
    if (
      !Number.isFinite(data.originalAmountYen)
      || data.requestedDiscountYen >= data.originalAmountYen
    ) {
      throw new Error('O desconto solicitado deve ser menor que o valor original.');
    }
    if (!Array.isArray(data.cartItems) || data.cartItems.length < 1 || data.cartItems.length > 100) {
      throw new Error('A negociação deve conter entre 1 e 100 itens.');
    }

    const now = new Date();
    const expires = new Date(now.getTime() + EXPIRY_HOURS * 60 * 60 * 1000);
    const ref = doc(collection(db, COL));
    const neg: Negotiation = {
      ...data,
      userId: cur.uid,
      userEmail: cur.email ?? '',
      status: 'pending',
      autoApproved: false,
      approvedDiscountYen: null,
      adminNote: '',
      approvedBy: '',
      approvedAt: null,
      resolvedAt: null,
      clientNotified: false,
      clientSeen: false,
      id: ref.id,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };
    await setDoc(ref, neg);
    return neg;
  },

  listenById(id: string, cb: (neg: Negotiation | null) => void): () => void {
    return onSnapshot(doc(db, COL, id), (snap) => {
      cb(snap.exists() ? (snap.data() as Negotiation) : null);
    });
  },

  listenAll(cb: (negs: Negotiation[]) => void): () => void {
    return onSnapshot(
      query(collection(db, COL), orderBy('createdAt', 'desc')),
      (snap) => cb(snap.docs.map((d) => d.data() as Negotiation)),
      (err) => console.error('[negotiations] listenAll error:', err)
    );
  },

  // Só o contador do sino do painel. Filtrado NO SERVIDOR de propósito: com
  // `listenAll`, abrir o painel baixava a coleção inteira de negociações só
  // para contar as pendentes, e cada documento carrega o carrinho e o
  // formulário de checkout completos — custo que cresce para sempre. Pendência
  // dura 24h, então este conjunto é pequeno por definição.
  //
  // Um único filtro de igualdade não exige índice composto.
  listenPending(cb: (pendentes: Negotiation[]) => void): () => void {
    return onSnapshot(
      query(collection(db, COL), where('status', '==', 'pending')),
      (snap) => cb(snap.docs.map((d) => d.data() as Negotiation)),
      (err) => console.error('[negotiations] listenPending error:', err)
    );
  },

  // userId pode ser o Firebase UID ou o email do usuário.
  // Sem orderBy para não exigir índice composto — ordena em JS.
  listenByUser(userId: string, cb: (negs: Negotiation[]) => void): () => void {
    const isEmail = userId.includes('@');
    // Quando userId é email, pode estar gravado em userEmail ou userId (legado)
    const field = isEmail ? 'userEmail' : 'userId';
    const q = query(collection(db, COL), where(field, '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const sorted = snap.docs
          .map(d => d.data() as Negotiation)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        cb(sorted);
      },
      (err) => console.error('[negotiations] listenByUser error:', err)
    );
  },

  async approve(id: string, approvedDiscountYen: number, adminNote: string, adminEmail: string): Promise<void> {
    await updateDoc(doc(db, COL, id), {
      status: 'approved',
      approvedDiscountYen,
      adminNote,
      approvedBy: adminEmail,
      approvedAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
      clientNotified: true,
    });
  },

  async reject(id: string, adminNote: string, adminEmail: string): Promise<void> {
    await updateDoc(doc(db, COL, id), {
      status: 'rejected',
      approvedDiscountYen: null,
      adminNote,
      approvedBy: adminEmail,
      approvedAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
      clientNotified: true,
    });
  },

  // Acionado somente pelo painel admin, cuja sessão satisfaz isAdmin().
  async expire(id: string): Promise<void> {
    await updateDoc(doc(db, COL, id), {
      status: 'expired',
      resolvedAt: new Date().toISOString(),
      clientNotified: true,
    });
  },

  async markSeen(id: string): Promise<void> {
    await updateDoc(doc(db, COL, id), { clientSeen: true });
  },

  // A transição para 'used' é feita PELO SERVIDOR, em api/_lib/fulfillment.js
  // (Admin SDK, que ignora estas regras), no instante em que o pedido é
  // finalizado. Não existe markUsed no lado cliente de propósito: a regra de
  // update de /negotiations/ só deixa o dono mudar `clientSeen`, então qualquer
  // escrita de status/resolvedAt/usedInOrderId partiria daqui seria sempre
  // rejeitada. Se precisar marcar como usada, faça pelo caminho do pedido
  // (servidor), não direto pelo cliente.

  async getById(id: string): Promise<Negotiation | null> {
    const snap = await getDoc(doc(db, COL, id));
    return snap.exists() ? (snap.data() as Negotiation) : null;
  },

  isExpired(neg: Negotiation): boolean {
    if (neg.status === 'used' || neg.status === 'rejected' || neg.status === 'expired') return false;
    return neg.status === 'pending' && new Date(neg.expiresAt) < new Date();
  },

  async deleteNegotiation(id: string): Promise<void> {
    await deleteDoc(doc(db, COL, id));
  },

  async deleteAllNegotiations(): Promise<void> {
    const snap = await getDocs(collection(db, COL));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  },

  async deleteNegotiationsByEmail(email: string): Promise<void> {
    const q = query(collection(db, COL), where('userEmail', '==', email));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  },
};
