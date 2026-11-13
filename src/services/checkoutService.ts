import { signInAnonymously } from 'firebase/auth';
import { auth } from '@/config/firebase';

export type CheckoutPaymentMethod = 'pix' | 'card';

export interface CheckoutDraft {
  orderId: string;
  paymentMethod: CheckoutPaymentMethod;
  items: Array<{ productId: string; variantId: string; quantity: number }>;
  customer: {
    name: string;
    email: string;
    phone: string;
    cpf: string;
  };
  shippingAddress: {
    postalCode: string;
    prefecture: string;
    state?: string;
    city: string;
    address: string;
    building: string;
    country: string;
  };
  shippingCarrier: string;
  couponCode?: string;
  promoCode?: string;
  pointsToRedeem?: number;
  negotiationId?: string;
  psFeeWaiverToken?: string;
  /** Total que o cliente está vendo. Se o servidor calcular outro, nada é cobrado (409 `price_changed`). */
  expectedTotal?: number;
  /** Id da cotação com que a tela calculou os preços (`/api/wise-rate`). Opcional. */
  ratesId?: string;
}

/** Conta nova do servidor quando o total mudou (`price_changed`). */
export interface CheckoutQuote {
  currency: string;
  total: number;
  totalYen: number;
  ratesId: string;
  fxSource: string;
  rates: { BRL: number; EUR: number; USD: number };
}

/** Erro do checkout: `message` é o código do servidor; em `price_changed` traz a cotação nova. */
export class CheckoutError extends Error {
  code: string;
  quote: CheckoutQuote | null;

  constructor(code: string, quote: CheckoutQuote | null = null) {
    super(code);
    this.name = 'CheckoutError';
    this.code = code;
    this.quote = quote;
  }
}

export interface AuthoritativeCheckoutOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: CheckoutPaymentMethod;
  currency: string;
  total: number;
  totalPrice: number;
  totalAmount: number;
  totalYen: number;
  orderDate: string;
  trackingCode?: string;
  customerEmail: string;
  customerName: string;
  shippingAddress: CheckoutDraft['shippingAddress'];
  shipping: { carrier: string; cost: number; weightG?: number };
  psFeeYen?: number;
  taxAmount?: number;
  // Congelado no momento da compra (mesma conta que gerou `total`) — usar
  // isto na tela de confirmação, nunca reconverter ¥ com a cotação atual.
  priceBreakdown?: {
    subtotal: number;
    couponDiscount: number;
    pointsDiscount: number;
    /** Só em pedidos antigos (desconto de 5% que saiu em 2026). */
    paymentDiscount?: number;
    products: number;
    shipping: number;
    psFee: number;
    tax: number;
    /** Imposto de importação dos EUA pré-pago (DDP), somado ao total. */
    importDuty?: number;
    /** Taxa total do PIX (IOF + tarifa), somada ao total. */
    paymentFee?: number;
    pixIof?: number;
    pixBankFee?: number;
  };
  items: Array<{
    productId: string;
    requestedId: string;
    productName: string;
    image?: string;
    quantity: number;
    size: string;
    variantId: string;
    price: number;
    unitYen: number;
    freeGift?: boolean;
  }>;
  [key: string]: unknown;
}

export async function checkoutToken(): Promise<string> {
  if (!auth) throw new Error('Autenticação indisponível. Recarregue a página.');
  const currentUser = auth.currentUser || (await signInAnonymously(auth)).user;
  return currentUser.getIdToken();
}

export async function prepareCheckout(
  draft: CheckoutDraft,
): Promise<{ order: AuthoritativeCheckoutOrder; clientSecret: string | null }> {
  const token = await checkoutToken();
  const response = await fetch('/api/create-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      orderId: draft.orderId,
      items: draft.items,
      country: draft.shippingAddress.country,
      prefecture: draft.shippingAddress.prefecture,
      state: draft.shippingAddress.state || '',
      shippingCarrier: draft.shippingCarrier,
      paymentMethod: draft.paymentMethod,
      couponCode: draft.couponCode || '',
      redeemPoints: draft.pointsToRedeem || 0,
      negotiationId: draft.negotiationId || '',
      promoCode: draft.promoCode || '',
      psFeeWaiverToken: draft.psFeeWaiverToken || '',
      ...(Number.isFinite(draft.expectedTotal) ? { expectedTotal: draft.expectedTotal } : {}),
      ...(draft.ratesId ? { ratesId: draft.ratesId } : {}),
      customer: {
        ...draft.customer,
        postalCode: draft.shippingAddress.postalCode,
        city: draft.shippingAddress.city,
        address: draft.shippingAddress.address,
        building: draft.shippingAddress.building,
      },
    }),
  });
  const payload = await response.json().catch(() => ({})) as {
    error?: string;
    quote?: CheckoutQuote;
    order?: AuthoritativeCheckoutOrder;
    clientSecret?: string | null;
  };
  if (!response.ok) {
    const code = payload.error || 'Não foi possível criar o pedido.';
    throw new CheckoutError(code, code === 'price_changed' && payload.quote ? payload.quote : null);
  }
  if (!payload.order?.orderNumber) throw new Error('Resposta inválida ao criar o pedido.');
  if (draft.paymentMethod === 'card' && !payload.clientSecret) throw new Error('Pagamento por cartão não foi inicializado.');
  return { order: payload.order, clientSecret: payload.clientSecret || null };
}
