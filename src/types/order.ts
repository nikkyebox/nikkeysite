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
  paymentMethod: 'bank' | 'paypay' | 'yucho' | 'wise' | 'pix' | 'card';
  deliveryTime?: string;
  couponDiscount?: number;
  appliedCoupon?: { code: string; discount: number; [key: string]: any };
  coupon?: { code: string; discount: number; [key: string]: any };
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
  paymentMethod: 'bank' | 'paypay' | 'yucho' | 'wise' | 'pix' | 'card';
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
