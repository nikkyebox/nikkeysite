import { signInAnonymously } from 'firebase/auth';
import { auth } from '@/config/firebase';

export type CheckoutPaymentMethod = 'bank' | 'paypay' | 'yucho' | 'wise' | 'pix' | 'card';

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
    order?: AuthoritativeCheckoutOrder;
    clientSecret?: string | null;
  };
  if (!response.ok) throw new Error(payload.error || 'Não foi possível criar o pedido.');
  if (!payload.order?.orderNumber) throw new Error('Resposta inválida ao criar o pedido.');
  if (draft.paymentMethod === 'card' && !payload.clientSecret) throw new Error('Pagamento por cartão não foi inicializado.');
  return { order: payload.order, clientSecret: payload.clientSecret || null };
}
