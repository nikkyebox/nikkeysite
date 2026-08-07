// Web Push (VAPID) — inscreve o cliente para notificações push nativas do
// navegador e mantém a inscrição sincronizada no Firestore (`push_subscriptions`).
// É Web Push "puro" (PushManager + service worker dedicado em /push-sw.js), não
// Firebase Cloud Messaging — funciona em qualquer navegador compatível com a
// API padrão (Chrome/Edge/Firefox desktop e Android; Safari só a partir do
// macOS 13 / iOS 16.4 e instalado como PWA na tela de início).
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const SW_PATH = '/push-sw.js';
const SW_SCOPE = '/push/';

export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window &&
  !!VAPID_PUBLIC_KEY;

// Converte a chave pública VAPID (base64url) para Uint8Array — formato exigido por applicationServerKey.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_PATH, { scope: SW_SCOPE });
}

// Um documento por APARELHO, não por endpoint.
//
// O id vinha do hash do endpoint, e o endpoint muda quando o navegador refaz a
// inscrição: cada reinscrição criava um documento NOVO e deixava o antigo para
// trás. O painel passava a contar dois clientes onde havia um, e o envio para o
// endpoint velho é aceito pelo provedor (HTTP 201) sem nunca aparecer na tela,
// então nem a limpeza por 404/410 do servidor dava conta dele.
const DEVICE_KEY = 'jp_push_device';

function deviceId(): string {
  try {
    const salvo = localStorage.getItem(DEVICE_KEY);
    if (salvo) return salvo;
    const novo = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem(DEVICE_KEY, novo);
    return novo;
  } catch {
    // Sem localStorage cai no hash do endpoint: pior para deduplicar, mas ainda
    // inscreve o aparelho.
    return '';
  }
}

/** Doc id estável por aparelho; hash do endpoint como reserva. */
function subscriptionDocId(endpoint: string): string {
  const device = deviceId();
  if (device) return device;
  let hash = 0;
  for (let i = 0; i < endpoint.length; i++) hash = (hash * 31 + endpoint.charCodeAt(i)) | 0;
  return 'sub-' + Math.abs(hash).toString(36);
}

export const pushService = {
  isSupported: isPushSupported,

  /** Permissão atual do navegador. */
  permission(): NotificationPermission | 'unsupported' {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  },

  /** true se já existe uma inscrição push ativa neste navegador/dispositivo. */
  async isSubscribed(): Promise<boolean> {
    if (!isPushSupported()) return false;
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
      if (!reg) return false;
      const sub = await reg.pushManager.getSubscription();
      return !!sub;
    } catch {
      return false;
    }
  },

  /** Pede permissão (se necessário), cria a inscrição e salva no Firestore ligada ao cliente. */
  async subscribe(customer: { email: string; name?: string }): Promise<{ ok: boolean; error?: string }> {
    if (!isPushSupported()) return { ok: false, error: 'Notificações push não suportadas neste navegador' };
    if (!db) return { ok: false, error: 'Firebase indisponível' };
    const customerEmail = customer.email.trim().toLowerCase();
    if (!customerEmail) return { ok: false, error: 'Faça login para ativar notificações' };
    try {
      if (Notification.permission === 'denied') {
        return { ok: false, error: 'Notificações bloqueadas nas configurações do navegador' };
      }
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') return { ok: false, error: 'Permissão negada' };

      const reg = await getRegistration();
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
        });
      }

      const json = sub.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) {
        throw new Error('Inscrição push sem chaves válidas');
      }
      const id = subscriptionDocId(sub.endpoint);
      await setDoc(doc(db, 'push_subscriptions', id), {
        endpoint: sub.endpoint,
        keys: {
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
        customerEmail,
        customerName: customer.name || '',
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp(),
      });

      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  /**
   * Reconcilia navegador ↔ Firestore. Chamado no carregamento do app.
   *
   * O registro em '/push/' pode desaparecer sem avisar ninguém — era o que a
   * recuperação de chunk error fazia a cada deploy, e limpar dados do site tem o
   * mesmo efeito. Quando isso acontece o silêncio é total: o documento continua
   * em `push_subscriptions`, o painel conta o cliente como inscrito, o provedor
   * aceita o envio com HTTP 201 e nada aparece na tela.
   *
   * Só age quando a permissão JÁ está concedida: nunca abre diálogo por conta
   * própria — pedir permissão sem o cliente clicar em nada é o caminho para ele
   * bloquear notificações para sempre.
   */
  async resync(customer: { email: string; name?: string }): Promise<{ ok: boolean; recriada: boolean; error?: string }> {
    if (!isPushSupported() || !db || !customer.email) return { ok: false, recriada: false };
    if (Notification.permission !== 'granted') return { ok: false, recriada: false };
    try {
      const registro = await navigator.serviceWorker.getRegistration(SW_SCOPE);
      const inscricao = registro ? await registro.pushManager.getSubscription() : null;
      // `subscribe` já registra o service worker, inscreve se preciso e grava o
      // documento — aqui basta reaproveitá-lo e informar se houve recriação.
      const resultado = await this.subscribe(customer);
      return { ...resultado, recriada: !inscricao };
    } catch (e) {
      return { ok: false, recriada: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  /** Cancela a inscrição no navegador e remove do Firestore. */
  async unsubscribe(): Promise<{ ok: boolean; error?: string }> {
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const id = subscriptionDocId(sub.endpoint);
        await sub.unsubscribe();
        if (db) await deleteDoc(doc(db, 'push_subscriptions', id)).catch(() => {});
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
