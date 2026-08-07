/**
 * waServerService
 *
 * Cliente do servidor local de WhatsApp (whatsapp-server/, whatsapp-web.js).
 * Envia mensagens transacionais ao cliente quando o status do pedido muda.
 *
 * Config no painel admin: Configurações → WhatsApp (salvo no localStorage).
 * Separado do whatsappService (Twilio) para não conflitar com o fluxo legado.
 */

const STORAGE_KEY = 'whatsappServer';

export interface WaServerConfig {
  enabled: boolean;
  serverUrl: string; // ex: "http://localhost:3220"
  authToken: string;
}

const DEFAULT_CONFIG: WaServerConfig = {
  enabled: false,
  serverUrl: 'http://localhost:3220',
  authToken: 'japan-express-whatsapp-token-2024',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrderLike = any;

const getPhone = (order: OrderLike): string =>
  order?.customerPhone || order?.shippingAddress?.phone || order?.phone || '';

const getFirstName = (order: OrderLike): string => {
  const full = order?.shippingAddress?.name || order?.customerName || '';
  return full.trim().split(/\s+/)[0] || 'Cliente';
};

/** Mensagem: pagamento confirmado (preparo começa em 2-3 dias). */
export const msgPaymentConfirmed = (order: OrderLike): string =>
  `Olá ${getFirstName(order)}! 🎌\n\n` +
  `Seu pagamento do pedido *${order.orderNumber}* foi confirmado! ✅\n\n` +
  `O preparo (Personal Shopper) começa em até *2-3 dias úteis*. ` +
  `Avisaremos aqui assim que iniciarmos a separação. Obrigado! 🛍️\n\n` +
  `_NikkeyBox — Importados do Japão_`;

/** Mensagem: pedido sendo preparado. */
export const msgPreparing = (order: OrderLike): string =>
  `Olá ${getFirstName(order)}! 📦\n\n` +
  `Boas notícias: começamos a *preparar* o seu pedido *${order.orderNumber}*! 🎉\n\n` +
  `Em breve ele será enviado e você receberá o código de rastreio por aqui.\n\n` +
  `_NikkeyBox — Importados do Japão_`;

/** Mensagem: pedido enviado, com itens e rastreio. */
export const msgShipped = (order: OrderLike, trackingNumber: string, trackingUrl: string, carrier: string): string => {
  const items = (order.items || [])
    .map((i: OrderLike) => `• ${i.quantity}x ${i.productName || i.name}${i.size ? ` (${i.size})` : ''}`)
    .join('\n');
  let msg =
    `Olá ${getFirstName(order)}! ✈️\n\n` +
    `Seu pedido *${order.orderNumber}* foi *ENVIADO*! 🚚\n\n` +
    `*Itens:*\n${items}\n\n`;
  if (trackingNumber) {
    msg += `*Código de rastreio:* ${trackingNumber}\n`;
    if (carrier) msg += `*Transportadora:* ${carrier}\n`;
    if (trackingUrl) msg += `*Rastrear:* ${trackingUrl}\n`;
    msg += '\n';
  }
  msg +=
    `Qualquer dúvida é só responder aqui. Obrigado pela compra! 🙏\n\n` +
    `_NikkeyBox — Importados do Japão_`;
  return msg;
};

export const waServer = {
  getConfig(): WaServerConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_CONFIG;
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_CONFIG;
    }
  },

  saveConfig(config: WaServerConfig): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  },

  /** online = servidor responde; ready = WhatsApp conectado (QR já escaneado). */
  async checkStatus(): Promise<{ online: boolean; ready: boolean }> {
    const cfg = this.getConfig();
    if (!cfg.enabled) return { online: false, ready: false };
    try {
      const res = await fetch(`${cfg.serverUrl}/health`, {
        headers: { 'x-wa-token': cfg.authToken },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return { online: false, ready: false };
      const body = await res.json().catch(() => ({}));
      return { online: true, ready: !!(body as { ready?: boolean }).ready };
    } catch {
      return { online: false, ready: false };
    }
  },

  /** Envio bruto. Nunca lança — retorna { ok, error }. */
  async sendMessage(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
    const cfg = this.getConfig();
    if (!cfg.enabled) return { ok: false, error: 'WhatsApp não ativado' };
    if (!phone) return { ok: false, error: 'Cliente sem telefone' };
    try {
      const res = await fetch(`${cfg.serverUrl}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-wa-token': cfg.authToken },
        body: JSON.stringify({ phone, message }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: (body as { error?: string }).error || `HTTP ${res.status}` };
      }
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  notifyPaymentConfirmed(order: OrderLike) {
    return this.sendMessage(getPhone(order), msgPaymentConfirmed(order));
  },
  notifyPreparing(order: OrderLike) {
    return this.sendMessage(getPhone(order), msgPreparing(order));
  },
  notifyShipped(order: OrderLike, trackingNumber: string, trackingUrl: string, carrier: string) {
    return this.sendMessage(getPhone(order), msgShipped(order, trackingNumber, trackingUrl, carrier));
  },
};
