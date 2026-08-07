// Pedidos personalizados ("Faça seu Pedido") — encomendas de produtos que não
// estão no catálogo. Cliente envia (mesmo sem login); admin lê e responde.
import { db } from '@/config/firebase';
import { doc, collection, getCountFromServer, getDocs, deleteDoc, updateDoc, query, orderBy, where } from 'firebase/firestore';
import { ensureAdminAuth } from '@/utils/adminAuth';
import { submitPublicForm } from '@/services/publicSubmissionService';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


export interface CustomRequest {
  id: string;
  name: string;
  contact: string;        // WhatsApp / e-mail / telefone
  country?: string;
  productDesc: string;    // o que a pessoa quer
  referenceLink?: string; // link de referência (opcional)
  quantity?: string;
  status: 'new' | 'quoted' | 'closed';
  createdAt: string;
  adminNote?: string;
}

const COL = 'custom_requests';

export const customRequestService = {
  async create(
    data: Omit<CustomRequest, 'id' | 'status' | 'createdAt' | 'adminNote'>,
  ): Promise<boolean> {
    const result = await submitPublicForm('custom_request', data);
    if (!result.ok) devError('[customRequest] create falhou:', result.error);
    return result.ok;
  },

  async getAll(): Promise<CustomRequest[]> {
    if (!db) return [];
    try {
      await ensureAdminAuth();
      let snap;
      try {
        snap = await getDocs(query(collection(db, COL), orderBy('createdAt', 'desc')));
      } catch {
        snap = await getDocs(collection(db, COL)); // fallback sem índice
      }
      const list: CustomRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<CustomRequest, 'id'>) }));
      return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (e) {
      devError('[customRequest] getAll falhou:', e);
      return [];
    }
  },

  async getPendingCount(): Promise<number> {
    if (!db) throw new Error('Firebase indisponível');
    await ensureAdminAuth();
    const snapshot = await getCountFromServer(query(collection(db, COL), where('status', '==', 'new')));
    return snapshot.data().count;
  },

  async updateStatus(id: string, status: CustomRequest['status'], adminNote?: string): Promise<boolean> {
    if (!db) return false;
    try {
      await ensureAdminAuth();
      await updateDoc(doc(db, COL, id), {
        status,
        ...(adminNote !== undefined ? { adminNote } : {}),
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch (e) {
      devError('[customRequest] updateStatus falhou:', e);
      return false;
    }
  },

  async remove(id: string): Promise<boolean> {
    if (!db) return false;
    try {
      await ensureAdminAuth();
      await deleteDoc(doc(db, COL, id));
      return true;
    } catch (e) {
      devError('[customRequest] remove falhou:', e);
      return false;
    }
  },
};
