/**
 * cpfGuardService — verificações anti-fraude baseadas em CPF
 *
 * Usa a coleção `cpf_index/{cpf}` no Firestore para registrar:
 *   - productIds: produtos já comprados com esse CPF
 *   - affiliateCodes: cupons de afiliado já usados com esse CPF
 *
 * Leitura é pública (doc não contém dados pessoais, só arrays de IDs).
 * Escrita exige auth (incluindo anônimo via signInAnonymously).
 *
 * Chamado em dois momentos:
 *   1. Antes de abrir o modal de pagamento (verificação)
 *   2. Após finalizar o pedido (registro)
 */

import { db } from '@/config/firebase';
import { doc, getDoc, setDoc, addDoc, collection } from 'firebase/firestore';

const COL = 'cpf_index';

/** Remove formatação do CPF, retorna só os 11 dígitos. */
export const normalizeCPF = (cpf: string) => cpf.replace(/\D/g, '');

interface CpfIndexDoc {
  productIds: string[];
  affiliateCodes: string[];
}

async function getIndex(cpf: string): Promise<CpfIndexDoc> {
  if (!db) return { productIds: [], affiliateCodes: [] };
  try {
    const snap = await getDoc(doc(db, COL, cpf));
    if (!snap.exists()) return { productIds: [], affiliateCodes: [] };
    const d = snap.data() as Partial<CpfIndexDoc>;
    return { productIds: d.productIds || [], affiliateCodes: d.affiliateCodes || [] };
  } catch {
    return { productIds: [], affiliateCodes: [] };
  }
}

export const cpfGuardService = {
  /**
   * Verifica se o CPF já comprou algum dos produtos listados.
   * Usado para bloquear burla do limite "1 por pessoa" via guest.
   */
  async checkProductLimit(
    cpfRaw: string,
    productIds: string[]
  ): Promise<{ blocked: boolean; reason?: string }> {
    const cpf = normalizeCPF(cpfRaw);
    if (cpf.length !== 11 || productIds.length === 0) return { blocked: false };

    const index = await getIndex(cpf);
    const conflict = productIds.find(id => index.productIds.includes(id));
    if (conflict) {
      return {
        blocked: true,
        reason: 'Limite atingido: este CPF já possui um pedido com este produto. Cada CPF pode adquirir apenas 1 unidade.',
      };
    }
    return { blocked: false };
  },

  /**
   * Verifica se o CPF já usou desconto de afiliado em compra anterior.
   * Desconto de afiliado é válido apenas na primeira compra.
   */
  async hasUsedAffiliateDiscount(
    cpfRaw: string
  ): Promise<{ used: boolean; code?: string }> {
    const cpf = normalizeCPF(cpfRaw);
    if (cpf.length !== 11) return { used: false };

    const index = await getIndex(cpf);
    if (index.affiliateCodes.length > 0) {
      return { used: true, code: index.affiliateCodes[0] };
    }
    return { used: false };
  },

  /**
   * Registra os dados do pedido no índice de CPF.
   * Chamado APÓS o pedido ser salvo com sucesso.
   */
  async registerOrder(params: {
    cpfRaw: string;
    productIds: string[];
    affiliateCode?: string;
  }): Promise<void> {
    const cpf = normalizeCPF(params.cpfRaw);
    if (!db || cpf.length !== 11) return;

    try {
      const current = await getIndex(cpf);

      // Acumula sem duplicar
      const newProductIds = Array.from(new Set([...current.productIds, ...params.productIds]));
      const newAffiliateCodes = params.affiliateCode
        ? Array.from(new Set([...current.affiliateCodes, params.affiliateCode.toUpperCase()]))
        : current.affiliateCodes;

      await setDoc(doc(db, COL, cpf), {
        productIds: newProductIds,
        affiliateCodes: newAffiliateCodes,
      }, { merge: true });
    } catch {
      // Falha silenciosa — não bloqueia a finalização do pedido
    }
  },

  /**
   * Registra uma tentativa de fraude bloqueada para o dashboard admin.
   * Falha silenciosa para não expor ao usuário.
   */
  async logFraudAttempt(params: {
    cpfRaw: string;
    attemptType: 'product_limit' | 'affiliate_reuse';
    productId?: string;
    affiliateCode?: string;
    customerEmail?: string;
    customerName?: string;
  }): Promise<void> {
    if (!db) return;
    const cpf = normalizeCPF(params.cpfRaw);
    if (cpf.length !== 11) return;
    try {
      await addDoc(collection(db, 'fraud_attempts'), {
        cpf: cpf.slice(0, 3) + '***' + cpf.slice(6),  // mascarado para log
        cpfFull: cpf,
        attemptType: params.attemptType,
        productId: params.productId || '',
        affiliateCode: params.affiliateCode || '',
        customerEmail: params.customerEmail || '',
        customerName: params.customerName || '',
        blockedAt: new Date().toISOString(),
      });
    } catch { /* silencioso */ }
  },

  normalizeCPF,
};
