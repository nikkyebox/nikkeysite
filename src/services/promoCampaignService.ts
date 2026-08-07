// Campanhas promocionais (notificação por e-mail/push): criação (admin),
// validação pública por código (qualquer visitante resgata) e controle de uso
// por CPF (anti-abuso: 1 resgate por CPF, como o cupom de afiliado).
import { db } from '@/config/firebase';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { ensureAdminAuth } from '@/utils/adminAuth';
import type { PromoCampaign } from '@/types/promoCampaign';
import { safeStorage } from '@/utils/storage';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};

const COL = 'promo_campaigns';
const USAGE = 'promo_usage';

// Normaliza um código de resgate (lockstep em create/validate/hasUsed/recordUsage).
const norm = (code: string) => (code || '').trim().toUpperCase();

export const promoCampaignService = {
  /** Admin: cria a campanha (doc id = código minúsculo). Idempotente. */
  async create(c: PromoCampaign): Promise<void> {
    if (!db) return;
    await ensureAdminAuth();
    const id = norm(c.code).toLowerCase();
    // O SDK client do Firestore rejeita campos undefined (o Admin SDK os ignora) —
    // removemos antes de gravar para não abortar a criação da campanha.
    const payload = Object.fromEntries(
      Object.entries({ ...c, code: norm(c.code) }).filter(([, v]) => v !== undefined)
    );
    await setDoc(doc(db, COL, id), payload);
    devLog('[promoCampaign] criada:', c.code, c.mechanic);
    // Publica no feed de notificações do perfil (siteContent/promoNotifications).
    // siteContent já tem leitura pública nas regras — nenhum deploy de regras a mais.
    // Falha aqui não aborta a campanha (o resgate por link continua valendo).
    try {
      const feedRef = doc(db, 'siteContent', 'promoNotifications');
      const feedSnap = await getDoc(feedRef);
      // Doc externo: narrowing runtime em vez de cast inline.
      const feedData: unknown = feedSnap.exists() ? feedSnap.data() : null;
      const prev = feedData && typeof feedData === 'object' && 'items' in feedData && Array.isArray(feedData.items)
        ? feedData.items
        : [];
      const item = Object.fromEntries(
        Object.entries({
          code: norm(c.code), mechanic: c.mechanic, headline: c.headline,
          tagline: c.tagline, description: c.description, badge: c.badge,
          productId: c.productId, productName: c.productName, productImage: c.productImage,
          createdAt: c.createdAt, expiresAt: c.expiresAt,
        }).filter(([, v]) => v !== undefined)
      );
      await setDoc(feedRef, { items: [item, ...prev].slice(0, 10), updatedAt: Date.now() });
    } catch (e) {
      devWarn('[promoCampaign] feed não publicado:', e instanceof Error ? e.message : e);
    }
  },

  /** Valida o código pendente (?promo=) e ARMA os efeitos locais: preço original
   *  (promo_full_price), brinde (pending_promo_gift) e pontos. Idempotente —
   *  chamado pela página do produto E pelo carrinho, aí a página já exibe o
   *  preço coerente com o que será cobrado. */
  async armPending(): Promise<PromoCampaign | null> {
    const code = safeStorage.getItem('pending_promo');
    if (!code) return null;
    const res = await this.validate(code);
    if (!res.valid || !res.campaign) return null;
    const c = res.campaign;
    safeStorage.setItem('promo_applied', norm(c.code));
    if (c.productId && !c.keepProductDiscount) {
      safeStorage.setItem('promo_full_price', JSON.stringify({ code: norm(c.code), productId: c.productId }));
    } else {
      safeStorage.removeItem('promo_full_price');
    }
    if (c.mechanic === 'bogo' || c.mechanic === 'bogo_other') {
      safeStorage.setItem('pending_promo_gift', JSON.stringify({
        code: norm(c.code),
        productId: c.productId,
        giftProductId: c.mechanic === 'bogo' ? c.productId : c.giftProductId,
      }));
    } else if (c.mechanic === 'points') {
      safeStorage.setItem('pending_promo_points', JSON.stringify({ code: norm(c.code), points: c.points || 0 }));
    }
    window.dispatchEvent(new Event('promo-pricing-changed'));
    return c;
  },

  /** Admin: apaga TODAS as campanhas, usos por CPF e zera o feed de notificações
   *  (mantém cadastros) — usado pelo RESET COMPLETO DO SITE. */
  async deleteAllCampaignData(): Promise<void> {
    if (!db) return;
    await ensureAdminAuth();
    const [camps, uses] = await Promise.all([
      getDocs(collection(db, COL)),
      getDocs(collection(db, USAGE)),
    ]);
    await Promise.all([...camps.docs, ...uses.docs].map((d) => deleteDoc(d.ref)));
    await setDoc(doc(db, 'siteContent', 'promoNotifications'), { items: [], updatedAt: Date.now() });
  },

  /** Validação pública: ativa e não expirada. */
  async validate(code: string): Promise<{ valid: boolean; campaign?: PromoCampaign; error?: string }> {
    if (!db) return { valid: false, error: 'Firestore indisponível' };
    try {
      const snap = await getDoc(doc(db, COL, norm(code).toLowerCase()));
      if (!snap.exists()) return { valid: false, error: 'Código de promoção inválido' };
      const c = snap.data() as PromoCampaign;
      if (!c.active) return { valid: false, error: 'Promoção inativa' };
      if (c.expiresAt && c.expiresAt < Date.now()) return { valid: false, error: 'Promoção expirada' };
      return { valid: true, campaign: c };
    } catch (e) {
      devWarn('[promoCampaign] validate falhou:', e instanceof Error ? e.message : e);
      return { valid: false, error: 'Não foi possível validar a promoção' };
    }
  },

  /** Limite por CPF: já resgatou esta campanha? */
  async hasUsed(code: string, cpfRaw: string): Promise<boolean> {
    if (!db) return false;
    const cpf = (cpfRaw || '').replace(/\D/g, '');
    if (cpf.length !== 11) return false;
    try {
      const snap = await getDoc(doc(db, USAGE, `${norm(code)}_${cpf}`));
      return snap.exists();
    } catch {
      return false;
    }
  },

  /** Registra o uso (idempotente) — chamado no checkout ao confirmar o pedido. */
  async recordUsage(code: string, cpfRaw: string, email: string, orderId: string): Promise<void> {
    if (!db) return;
    const cpf = (cpfRaw || '').replace(/\D/g, '');
    if (cpf.length !== 11) return;
    try {
      await setDoc(doc(db, USAGE, `${norm(code)}_${cpf}`), {
        code: norm(code), cpf, email: email || '', orderId, usedAt: Date.now(),
      });
    } catch (e) {
      devWarn('[promoCampaign] recordUsage falhou:', e instanceof Error ? e.message : e);
    }
  },
};
