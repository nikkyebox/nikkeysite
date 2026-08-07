// Cliente do "cérebro" do KimiClaw. Chama a função serverless /api/kimiclaw,
// que guarda a chave do OpenRouter no servidor (não fica exposta no navegador).
// Se a IA não estiver configurada/disponível, retorna null → KimiClaw usa as regras.
import { auth } from '@/config/firebase';

export interface QwenMsg { role: 'user' | 'assistant'; content: string; }
export interface CatalogItem { name: string; category: string; priceYen: number; discount?: number; approxWeightGrams?: number; }

// Catálogo estendido enviado APENAS em sessões admin (inclui dados sensíveis de negócio).
export interface AdminCatalogItem extends CatalogItem {
  id: string;
  costYen?: number;                          // custo de aquisição
  weightGrams?: { small: number; large: number }; // peso estimado por variante
  hidden?: boolean;                          // produto oculto ao público
}

export interface Locale { country: string; currencyCode: string; currencySymbol: string; }

// KimiClaw: skills determinísticos (busca, carrinho, orçamento, frete, cupom, admin)
// continuam 100% por regras — a IA nunca calcula preço/frete/número de negócio,
// só entra pra conversa/recomendação quando nenhum skill determinístico bate.
// Ver api/kimiclaw.js (SYSTEM_PROMPT + containsUngroundedMoney) para as garantias
// contra alucinação de preço.
export const qwenEnabled = (): boolean => true;

export interface AskQwenOptions {
  isAdmin?: boolean;
  adminCatalog?: AdminCatalogItem[];
}

/** Pergunta ao Qwen via /api/kimiclaw, enviando o catálogo e a moeda/país do cliente. */
export async function askQwen(
  history: QwenMsg[],
  catalog?: CatalogItem[],
  locale?: Locale,
  options?: AskQwenOptions,
): Promise<string | null> {
  try {
    const body: Record<string, unknown> = {
      messages: history.slice(-12),
      catalog: (catalog || []).slice(0, 120),
      locale,
    };
    if (options?.isAdmin) {
      body.adminCatalog = (options.adminCatalog || []).slice(0, 200);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Manda o token sempre que há sessão — o SERVIDOR decide se é admin.
    // O adminCatalog (com custos) só vai se o frontend acredita ser admin,
    // pois esses dados são sensíveis e não devem trafegar para clientes comuns.
    if (auth) {
      try {
        await auth.authStateReady();
        if (auth.currentUser) {
          headers['x-firebase-token'] = await auth.currentUser.getIdToken();
        }
      } catch {
        // sem token → endpoint trata como não-admin
      }
    }

    const res = await fetch('/api/kimiclaw', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) return null; // 503 sem chave, 502 upstream, etc.
    const data = await res.json();
    return (data?.text as string) || null;
  } catch {
    return null;
  }
}
