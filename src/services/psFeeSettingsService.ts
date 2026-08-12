// Taxa de Personal Shopper (¥ por item) — editável pelo admin em vez de fixa
// no código. Mesmo padrão de src/services/paymentSettingsService.ts:
// leitura pública, escrita só admin (regras do Firestore).
import { db } from '@/config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ensureAdminAuth } from '@/utils/adminAuth';

const isDev = import.meta.env.DEV;
const devWarn = isDev ? console.warn.bind(console) : () => {};

export interface PsFeeSettings {
  psFeeUnitYen: number; // ¥ cobrado por item (antes fixo em 1000)
}

// 1000 continua sendo o padrão inicial — só deixou de ser fixo no código.
export const DEFAULT_PS_FEE_UNIT_YEN = 1000;

const DEFAULT: PsFeeSettings = { psFeeUnitYen: DEFAULT_PS_FEE_UNIT_YEN };

export const psFeeSettingsService = {
  async get(): Promise<PsFeeSettings> {
    if (!db) return DEFAULT;
    try {
      const snap = await getDoc(doc(db, 'settings', 'psFee'));
      if (!snap.exists()) return DEFAULT;
      const data = snap.data() as Partial<PsFeeSettings>;
      const value = Number(data.psFeeUnitYen);
      return { psFeeUnitYen: Number.isFinite(value) && value >= 0 ? value : DEFAULT_PS_FEE_UNIT_YEN };
    } catch (e) {
      devWarn('[psFee] get falhou:', e);
      return DEFAULT;
    }
  },

  async save(settings: PsFeeSettings): Promise<void> {
    if (!db) throw new Error('Firebase indisponível');
    await ensureAdminAuth();
    await setDoc(doc(db, 'settings', 'psFee'), {
      ...settings,
      updatedAt: new Date().toISOString(),
    });
  },
};
