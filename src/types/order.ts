/**
 * Type definitions for order-related data structures
 */

export interface Product {
  id: number;
  name: string;
  prices: {
    [key: string]: number;
  };
  image: string;
  description?: string;
}

export interface CartItem {
  product: Product;
  size: string;
  quantity: number;
}

export interface ShippingInfo {
  carrier: string;
  cost: number;
  estimatedDays: string;
}

export interface FormData {
  name: string;
  email: string;
  phone: string;
  postalCode: string;
  prefecture: string;
  city: string;
  address: string;
  building?: string;
}

export interface OrderData {
  formData: FormData;
  items: CartItem[];
  totalPrice: number;
  shipping?: ShippingInfo;
  paymentMethod: 'bank' | 'paypay' | 'yucho' | 'wise' | 'pix' | 'card'; // 'yucho': pedido antigo, só leitura
  deliveryTime?: string;
  couponDiscount?: number;
  appliedCoupon?: { code: string; discount: number; [key: string]: unknown };
  coupon?: { code: string; discount: number; [key: string]: unknown };
}

export interface OrderItem {
  productName: string;
  size: string;
  quantity: number;
  price: number;
}

export interface ShippingAddress {
  name: string;
  postalCode: string;
  prefecture: string;
  city: string;
  address: string;
  building?: string;
}

export interface Order {
  items: OrderItem[];
  totalAmount: number;
  paymentMethod: 'bank' | 'paypay' | 'yucho' | 'wise' | 'pix' | 'card'; // 'yucho': pedido antigo, só leitura
  status: 'pending' | 'processing' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  shippingAddress: ShippingAddress;
  orderNumber?: string;
  shipping?: ShippingInfo;
}

export interface ShippingLabelData {
  orderNumber: string;
  sender: {
    name: string;
    postalCode: string;
    address: string;
    phone: string;
  };
  recipient: {
    name: string;
    postalCode: string;
    prefecture: string;
    city: string;
    address: string;
    building?: string;
    phone: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    weight?: number;
  }>;
  deliveryTime?: string;
}

export interface EmailOrderData extends OrderData {
  orderNumber: string;
}

/** Item de pedido como o painel admin lê do Firestore. */
export interface AdminOrderItem {
  id?: string;
  productName?: string;
  productId?: string;
  priceJpy?: number;
  name?: string;
  label?: string;
  badge?: string;
  icon?: string;
  size?: string;
  quantity: number;
  price: number;
  unitYen?: number;
  freeGift?: boolean;
}

/** Endereço de entrega gravado no pedido (campos opcionais: pedidos antigos variam). */
export interface AdminShippingAddress {
  name?: string;
  phone?: string;
  postalCode?: string;
  prefecture?: string;
  city?: string;
  address?: string;
  building?: string;
  country?: string;
}

/**
 * Pedido como o painel admin lê do Firestore (gravado por `api/orders.js` e
 * `api/_lib/fulfillment.js`). Pedidos antigos e manuais têm formatos diferentes,
 * por isso quase todos os campos são opcionais.
 */
export interface AdminOrder {
  id?: string;
  orderNumber?: string;
  status?: string;
  orderDate?: string;
  date?: string;
  items: AdminOrderItem[];
  paymentMethod?: string;
  paymentConfirmed?: boolean;
  shippingAddress?: AdminShippingAddress;
  shipping?: { carrier?: string; cost?: number; estimatedDays?: string };
  shippingCarrier?: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  phone?: string;
  cpf?: string;
  name?: string;
  postalCode?: string;
  prefecture?: string;
  city?: string;
  address?: string;
  building?: string;
  totalAmount?: number;
  totalPrice?: number;
  total?: number;
  totalYen?: number;
  grandTotalYen?: number;
  currency?: string;
  couponCode?: string;
  couponDiscount?: number;
  priceBreakdown?: Record<string, number>;
  icmsTax?: number;
  federalTax?: number;
  taxAmount?: number;
  psFeeYen?: number;
  refundPending?: boolean;
  refundCurrency?: string;
  refundAmount?: number;
  refundReference?: string;
  fulfillmentError?: string;
}
