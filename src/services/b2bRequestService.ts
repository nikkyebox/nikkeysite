// Cotações B2B / atacado (Pessoa Jurídica). Empresa envia (mesmo sem login);
// admin lê e negocia frete/valores (inclui envio por container).
import { db } from '@/config/firebase';
import { doc, collection, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { ensureAdminAuth } from '@/utils/adminAuth';
import { submitPublicForm } from '@/services/publicSubmissionService';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


export type B2BShipping = 'aereo' | 'maritimo' | 'container' | 'combinar';

export interface B2BRequest {
  id: string;
  razaoSocial: string;
  cnpj: string;
  responsavel: string;   // nome do responsável
  contact: string;       // WhatsApp / e-mail
  email?: string;
  country?: string;
  productDesc: string;   // o que querem comprar
  estimatedQty: string;  // quantidade/volume estimado
  shipping: B2BShipping;  // preferência de envio
  notes?: string;
  status: 'new' | 'negotiating' | 'closed';
  createdAt: string;
}

const COL = 'b2b_requests';

export const b2bRequestService = {
  async create(data: Omit<B2BRequest, 'id' | 'status' | 'createdAt'>): Promise<boolean> {
    const result = await submitPublicForm('b2b_request', data);
    if (!result.ok) devError('[b2b] create falhou:', result.error);
    return result.ok;
  },

  async getAll(): Promise<B2BRequest[]> {
    if (!db) return [];
    try {
      await ensureAdminAuth();
      const snap = await getDocs(collection(db, COL));
      const list: B2BRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } catch (e) {
      devError('[b2b] getAll falhou:', e);
      return [];
    }
  },

  async updateStatus(id: string, status: B2BRequest['status']): Promise<boolean> {
    if (!db) return false;
    try {
      await ensureAdminAuth();
      await updateDoc(doc(db, COL, id), { status, updatedAt: new Date().toISOString() });
      return true;
    } catch (e) {
      devError('[b2b] updateStatus falhou:', e);
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
      devError('[b2b] remove falhou:', e);
      return false;
    }
  },
};
