import { submitPublicForm } from '@/services/publicSubmissionService';

const isDev = import.meta.env.DEV;
const devWarn = isDev ? console.warn.bind(console) : () => {};

export type LeadSource = 'exit_intent' | 'newsletter_footer' | 'guide' | 'cart_reminder';

export interface LeadCapture {
  email: string;
  source: LeadSource;
}

/**
 * Serviço de captura de leads (e-mails de quem ainda não comprou).
 * Idempotente por e-mail: se o lead já existe, apenas atualiza a origem e a
 * data — nunca duplica. Falhas de rede/Firestore são silenciosas para não
 * prejudicar a experiência de quem está preenchendo o formulário.
 */
class NewsletterService {
  async capture(lead: LeadCapture): Promise<boolean> {
    const email = lead.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false;

    const result = await submitPublicForm('newsletter', {
      email,
      source: lead.source,
    });
    if (!result.ok) {
      devWarn('⚠️ [NEWSLETTER] Falha ao salvar lead:', result.error);
    }
    return result.ok;
  }
}

export const newsletterService = new NewsletterService();
