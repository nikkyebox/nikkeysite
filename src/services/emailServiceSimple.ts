import { authenticatedFetch } from '@/services/authenticatedFetch';

interface OrderEmailData {
  orderNumber?: string;
  id?: string;
  [key: string]: unknown;
}


type OrderMailType = 'order' | 'store' | 'tracking';

async function sendOrderEmail(type: OrderMailType, orderId: string): Promise<boolean> {
  if (!orderId) return false;
  try {
    const response = await authenticatedFetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, orderId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const emailServiceSimple = {
  sendOrderConfirmation: async (orderData: OrderEmailData): Promise<boolean> =>
    sendOrderEmail('order', orderData.orderNumber || orderData.id || ''),

  sendStoreNotification: async (orderData: OrderEmailData): Promise<boolean> =>
    sendOrderEmail('store', orderData.orderNumber || orderData.id || ''),

  sendTrackingNotification: async (orderData: OrderEmailData): Promise<boolean> =>
    sendOrderEmail('tracking', orderData.orderNumber || orderData.id || ''),
};
