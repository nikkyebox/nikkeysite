// Camada única de analytics de conversão (GA4 via Firebase Analytics + Meta
// Pixel + Google Ads/Merchant Center via gtag.js).
//
// Por que Firebase Analytics em vez de gtag.js solto: o projeto já tem um
// measurementId real vinculado em src/config/firebase.ts, então getAnalytics(app)
// já fala com a MESMA propriedade GA4 que gtag.js falaria — carregar os dois
// duplicaria pageviews/sessões. Meta Pixel não existe em nenhum lugar do
// projeto, então é carregado do zero aqui, também via script.
//
// Consentimento: nada aqui inicializa ou dispara SEM `consent === 'accepted'`
// (mesmo gate do CookieBanner/useCookieConsent). Todas as funções são no-op
// seguro se: sem consentimento, sem Firebase, sem VITE_META_PIXEL_ID, ou sem
// VITE_GOOGLE_ADS_TAG_ID configurados — nunca lança erro, nunca quebra a navegação.

import type { Analytics } from 'firebase/analytics';
import { app } from '@/config/firebase';
import { getCookieConsent } from '@/hooks/useCookieConsent';

const isDev = import.meta.env.DEV;
const devWarn = isDev ? console.warn.bind(console) : () => {};

const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
const GOOGLE_ADS_TAG_ID = import.meta.env.VITE_GOOGLE_ADS_TAG_ID as string | undefined;

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; callMethod?: (...args: unknown[]) => void };
    _fbq?: Window['fbq'];
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

let analyticsInstance: Analytics | null = null;
let analyticsInitPromise: Promise<Analytics | null> | null = null;
let pixelReady = false;
let googleAdsTagReady = false;

function consentGiven(): boolean {
  return getCookieConsent() === 'accepted';
}

/** Carrega o SDK do Firebase Analytics (GA4) uma única vez, sob consentimento. */
async function ensureGa(): Promise<Analytics | null> {
  if (!consentGiven() || !app) return null;
  if (analyticsInstance) return analyticsInstance;
  if (!analyticsInitPromise) {
    analyticsInitPromise = import('firebase/analytics')
      .then(({ getAnalytics }) => {
        analyticsInstance = getAnalytics(app!);
        return analyticsInstance;
      })
      .catch((error) => {
        devWarn('[analytics] Falha ao inicializar GA4:', error);
        return null;
      });
  }
  return analyticsInitPromise;
}

/** Injeta o script base do Meta Pixel uma única vez, sob consentimento. */
function ensureMetaPixel(): void {
  if (!consentGiven() || !META_PIXEL_ID || pixelReady || typeof window === 'undefined') return;
  if (window.fbq) {
    pixelReady = true;
    window.fbq('init', META_PIXEL_ID);
    return;
  }

  // Bootstrap padrão do Meta Pixel (equivalente ao snippet oficial). O corpo
  // usa `fbq`, já tipado, em vez do nome da própria função: dentro dela o TS
  // infere `(...args) => void`, que não conhece `callMethod` nem `queue` —
  // os dois só passam a existir quando o fbevents.js carrega e troca o stub.
  const fbq = function fbqStub(...args: unknown[]) {
    const alvo = fbq as NonNullable<Window['fbq']>;
    (alvo.callMethod ? alvo.callMethod : (alvo.queue = alvo.queue || []).push).apply(alvo, args as never);
  } as NonNullable<Window['fbq']>;
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  fbq!.queue = [];

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  script.onerror = () => devWarn('[analytics] Falha ao carregar Meta Pixel');
  document.head.appendChild(script);

  pixelReady = true;
  window.fbq('init', META_PIXEL_ID);
}

/**
 * Injeta o Google tag (gtag.js) do Google Ads/Merchant Center — o GT-… gerado
 * em Merchant Center → Conversões → Origens de rastreamento → tag do Google —
 * para o evento-chave de compra alimentar a atribuição de conversão dos
 * anúncios/vitrines gratuitas.
 *
 * Reaproveita o script gtag.js se o Firebase Analytics (GA4) já inseriu um
 * (mesmo dataLayer/gtag global dos dois, é assim que o Google projeta multi-
 * tag): não duplica a tag nem o download. O que evita misturar as duas é o
 * `send_to` em cada chamada — o `logEvent` do Firebase já se restringe à
 * própria measurementId (ver node_modules/@firebase/analytics), e o evento
 * de compra desta tag faz o mesmo em sentido contrário (fireGoogleAdsPurchase).
 */
function ensureGoogleAdsTag(): void {
  if (!consentGiven() || !GOOGLE_ADS_TAG_ID || googleAdsTagReady || typeof window === 'undefined') return;

  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
  }

  if (!document.querySelector('script[src*="googletagmanager.com/gtag/js"]')) {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?l=dataLayer&id=${GOOGLE_ADS_TAG_ID}`;
    script.onerror = () => devWarn('[analytics] Falha ao carregar Google tag (Ads/Merchant Center)');
    document.head.appendChild(script);
  }

  googleAdsTagReady = true;
  window.gtag('js', new Date());
  window.gtag('config', GOOGLE_ADS_TAG_ID);
}

/** Chamado uma vez quando o consentimento vira 'accepted' (ou no boot, se já aceito). */
export function initAnalytics(): void {
  if (!consentGiven()) return;
  void ensureGa();
  ensureMetaPixel();
  ensureGoogleAdsTag();
}

/** Dispara pageview no GA4 e no Meta Pixel. Chamar a cada mudança de rota (SPA). */
export function trackPageview(path: string): void {
  if (!consentGiven()) return;
  void ensureGa().then((analytics) => {
    if (!analytics) return;
    import('firebase/analytics').then(({ logEvent }) => {
      logEvent(analytics, 'page_view', {
        page_path: path,
        page_location: typeof window !== 'undefined' ? window.location.href : path,
        page_title: typeof document !== 'undefined' ? document.title : undefined,
      });
    });
  });
  if (window.fbq && pixelReady) window.fbq('track', 'PageView');
}

export interface AnalyticsItem {
  item_id: string;
  item_name: string;
  price?: number;
  quantity?: number;
  item_category?: string;
}

interface EcommercePayload {
  currency?: string;
  value?: number;
  items?: AnalyticsItem[];
  transaction_id?: string;
  [key: string]: unknown;
}

/**
 * Dispara um evento de e-commerce nas duas plataformas com o vocabulário
 * correto de cada uma (GA4 usa snake_case tipo `add_to_cart`; Meta usa
 * PascalCase tipo `AddToCart`). `metaName` omitido = evento não vai pro Meta.
 */
function fireEvent(gaName: string, metaName: string | null, payload: EcommercePayload): void {
  if (!consentGiven()) return;

  void ensureGa().then((analytics) => {
    if (!analytics) return;
    import('firebase/analytics').then(({ logEvent }) => logEvent(analytics, gaName, payload));
  });

  if (metaName && window.fbq && pixelReady) {
    window.fbq('track', metaName, {
      currency: payload.currency,
      value: payload.value,
      content_ids: payload.items?.map((i) => i.item_id),
      contents: payload.items?.map((i) => ({ id: i.item_id, quantity: i.quantity || 1 })),
      content_type: 'product',
    });
  }
}

/**
 * Envia o "purchase" (key event de conversão) só para a tag do Google
 * Ads/Merchant Center, isolado via `send_to` — sem isso o evento cairia no
 * dataLayer compartilhado e contaria como conversão em qualquer outra tag
 * configurada nele (GA4 incluso). Só a compra é key event no Merchant
 * Center; o resto do funil (view_item, add_to_cart, begin_checkout) fica
 * só no GA4/Meta, como já era.
 */
function fireGoogleAdsPurchase(payload: EcommercePayload): void {
  if (!consentGiven() || !GOOGLE_ADS_TAG_ID || !googleAdsTagReady || typeof window.gtag !== 'function') return;
  window.gtag('event', 'purchase', { ...payload, send_to: GOOGLE_ADS_TAG_ID });
}

export const trackSignUp = (method: string): void =>
  fireEvent('sign_up', 'CompleteRegistration', { method });

export const trackLogin = (method: string): void =>
  fireEvent('login', null, { method });

export const trackViewItem = (item: AnalyticsItem, currency: string): void =>
  fireEvent('view_item', 'ViewContent', { currency, value: item.price, items: [item] });

export const trackAddToCart = (item: AnalyticsItem, currency: string): void =>
  fireEvent('add_to_cart', 'AddToCart', {
    currency,
    value: (item.price || 0) * (item.quantity || 1),
    items: [item],
  });

export const trackBeginCheckout = (currency: string, value: number, items: AnalyticsItem[]): void =>
  fireEvent('begin_checkout', 'InitiateCheckout', { currency, value, items });

export const trackPurchase = (
  orderId: string,
  currency: string,
  value: number,
  items: AnalyticsItem[],
): void => {
  const payload = { transaction_id: orderId, currency, value, items };
  fireEvent('purchase', 'Purchase', payload);
  fireGoogleAdsPurchase(payload);
};
