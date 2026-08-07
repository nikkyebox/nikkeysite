// Configurações de pagamento editáveis pelo admin (link Wise/Wisetag).
// Guardado em settings/payments — leitura pública, escrita só admin (regras).
import { db } from '@/config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ensureAdminAuth } from '@/utils/adminAuth';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


export interface PaymentSettings {
  wiseLink: string;        // link de cobrança Wise ou Wisetag
  wiseEnabled: boolean;    // mostra a opção Wise no checkout
  pixKey: string;          // chave PIX (e-mail, CPF, telefone ou aleatória)
  pixReceiverName: string; // nome do recebedor PIX, máx 25 caracteres
  pixCity: string;         // cidade do recebedor PIX, máx 15 caracteres
  pixEnabled: boolean;     // mostra a opção PIX no checkout internacional
  cardEnabled: boolean;    // mostra a opção Cartão (Stripe) no checkout internacional
  // Japan payment — Yucho Bank & contact
  yuchoKigo: string;       // 記号 (símbolo da conta ゆうちょ)
  yuchoNumber: string;     // 番号 (número da conta ゆうちょ)
  yuchoName: string;       // 口座名義 (nome do titular)
  contactPhone: string;    // telefone doméstico japonês (ex: 070-1367-1679) usado no WhatsApp e PayPay
}

const DEFAULT: PaymentSettings = {
  wiseLink: '',
  wiseEnabled: false,
  pixKey: '',
  pixReceiverName: 'NikkeyBox',
  pixCity: 'Sao Paulo',
  pixEnabled: false,
  cardEnabled: true,
  yuchoKigo: '',
  yuchoNumber: '',
  yuchoName: '',
  contactPhone: '',
};

export const paymentSettingsService = {
  async get(): Promise<PaymentSettings> {
    if (!db) return DEFAULT;
    try {
      const snap = await getDoc(doc(db, 'settings', 'payments'));
      if (!snap.exists()) return DEFAULT;
      return { ...DEFAULT, ...(snap.data() as Partial<PaymentSettings>) };
    } catch (e) {
      devWarn('[payments] get falhou:', e);
      return DEFAULT;
    }
  },

  async save(settings: PaymentSettings): Promise<void> {
    if (!db) throw new Error('Firebase indisponível');
    await ensureAdminAuth();
    await setDoc(doc(db, 'settings', 'payments'), {
      ...settings,
      updatedAt: new Date().toISOString(),
    });
  },
};
