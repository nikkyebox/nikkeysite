import { authenticatedFetch } from '@/services/authenticatedFetch';

const isDev = import.meta.env.DEV;
const devWarn = isDev ? console.warn.bind(console) : () => {};

type AccountMailType = 'welcome' | 'verify' | 'verify-admin';

/** Resultado detalhado do envio — o motivo importa para diagnosticar. */
export interface MailResult {
  ok: boolean;
  /** Código devolvido pelo servidor, ou 'sem_sessao' quando nem chegamos a chamar. */
  error?: string;
  status?: number;
}

async function sendDetailed(to: string, type: AccountMailType, name?: string): Promise<MailResult> {
  let response: Response;
  try {
    response = await authenticatedFetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, type, name: name || '' }),
    });
  } catch (error) {
    // `authenticatedFetch` lança quando não há sessão Firebase: sem token, a
    // requisição nem sai. É um estado bem diferente de "o servidor recusou", e
    // antes os dois viravam o mesmo `false` mudo.
    devWarn('[EMAIL] /api/send-email não chegou a ser chamado:', error);
    return { ok: false, error: 'sem_sessao' };
  }

  if (response.ok) return { ok: true };

  // Códigos que o servidor pode devolver:
  //   unauthorized          → token ausente ou expirado
  //   forbidden             → o token não é de um admin (ou e-mail não confere)
  //   email_not_configured  → falta NOREPLY_EMAIL_PASSWORD na Vercel
  //   email_auth_failed     → o Gmail recusou a credencial (535): SMTP_USER é
  //                           alias, ou a App Password não é da conta que autentica
  //   email_rejected_by_smtp→ o Gmail recusou o destinatário
  //   rate_limited          → estourou o limite por hora
  const corpo = await response.json().catch(() => ({}));
  const error = String(corpo?.error || 'sem_codigo');
  devWarn(`[EMAIL] /api/send-email falhou (${response.status}):`, error);
  return { ok: false, error, status: response.status };
}

export const sendConfirmationEmail = async (to: string, name?: string): Promise<boolean> =>
  (await sendDetailed(to, 'welcome', name)).ok;

export const sendVerificationEmail = async (to: string, name?: string): Promise<boolean> =>
  (await sendDetailed(to, 'verify', name)).ok;

/**
 * Reenvia a confirmação para um cliente já cadastrado, autenticando como admin.
 *
 * Não depende da sessão do cliente — que é justamente o que falha no caminho
 * normal e deixa a conta criada sem nenhum e-mail enviado, sem aviso a ninguém.
 * Devolve o resultado detalhado porque quem clica é o dono da loja: ele precisa
 * saber SE falhou e POR QUÊ, não só que "não deu".
 */
export const resendVerificationAsAdmin = (to: string, name?: string): Promise<MailResult> =>
  sendDetailed(to, 'verify-admin', name);

/**
 * Pede o e-mail de redefinicao de senha pelo mailer da loja.
 *
 * Usa `fetch` puro, e nao `authenticatedFetch`: quem esqueceu a senha nao tem
 * sessao para assinar a requisicao — a ausencia de token e a premissa do fluxo,
 * nao um erro. O servidor protege o endpoint por limite de IP e de e-mail.
 *
 * Responde igual para conta existente e inexistente, de proposito: a diferenca
 * revelaria quais e-mails tem cadastro na loja.
 */
export async function requestPasswordReset(to: string): Promise<MailResult> {
  let response: Response;
  try {
    response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, type: 'password-reset' }),
    });
  } catch (error) {
    devWarn('[EMAIL] /api/send-email (reset) nao chegou a ser chamado:', error);
    return { ok: false, error: 'rede' };
  }

  if (response.ok) return { ok: true };

  const corpo = await response.json().catch(() => ({}));
  const error = String(corpo?.error || 'sem_codigo');
  devWarn(`[EMAIL] reset de senha falhou (${response.status}):`, error);
  return { ok: false, error, status: response.status };
}

export interface EmailSubscription {
  ok: boolean;
  subscribed: boolean;
  error?: string;
}

/**
 * Estado real da inscrição de e-mail.
 *
 * Mora no servidor (`email_optout`), o MESMO registro que o link "Cancelar
 * inscrição" do rodapé escreve. Ler uma flag do perfil local mentiria para quem
 * cancelou pelo e-mail: o perfil diria "ativado" e nenhuma promoção chegaria.
 *
 * Em caso de falha devolve `subscribed: true` — mostrar "ativado" quando não se
 * sabe é o erro certo: leva o cliente a clicar em desativar, e aí o servidor
 * responde de verdade. O contrário esconderia o botão de quem quer cancelar.
 */
export async function getEmailSubscription(): Promise<EmailSubscription> {
  try {
    const response = await authenticatedFetch('/api/email-preference');
    const corpo = await response.json().catch(() => ({}));
    if (!response.ok) {
      devWarn(`[EMAIL] preferência não lida (${response.status}):`, corpo?.error);
      return { ok: false, subscribed: true, error: String(corpo?.error || 'sem_codigo') };
    }
    return { ok: true, subscribed: corpo?.subscribed !== false };
  } catch (error) {
    devWarn('[EMAIL] /api/email-preference não chegou a ser chamado:', error);
    return { ok: false, subscribed: true, error: 'sem_sessao' };
  }
}

export async function setEmailSubscription(subscribed: boolean): Promise<EmailSubscription> {
  try {
    const response = await authenticatedFetch('/api/email-preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribed }),
    });
    const corpo = await response.json().catch(() => ({}));
    if (!response.ok) {
      devWarn(`[EMAIL] preferência não salva (${response.status}):`, corpo?.error);
      return { ok: false, subscribed: !subscribed, error: String(corpo?.error || 'sem_codigo') };
    }
    return { ok: true, subscribed: corpo?.subscribed === true };
  } catch (error) {
    devWarn('[EMAIL] /api/email-preference não chegou a ser chamado:', error);
    return { ok: false, subscribed: !subscribed, error: 'sem_sessao' };
  }
}
