import { safeStorage } from '@/utils/storage';
/**
 * Order Management Service
 * Gerencia pedidos - lê do Firestore com fallback para safeStorage
 */

import { firebaseSyncService } from '@/services/firebaseSyncService';
import type { OrderPageCursor } from '@/services/firebaseSyncService';
import { ensureAdminAuth } from '@/utils/adminAuth';
import type { Order } from '@/types';
import { authenticatedFetch } from '@/services/authenticatedFetch';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};

export interface OrderStatus {
  status: 'pending' | 'processing' | 'packing' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  updatedAt: string;
  updatedBy?: string;
}

export interface OrdersPage {
  items: Order[];
  nextCursor: OrderPageCursor | null;
  hasMore: boolean;
}

export const orderService = {
  /**
   * Registra uma VENDA POSTERIOR (manual) — produtos cobrados fora do fluxo
   * normal do site (Wise/PIX direto), mas que devem entrar como receita.
   * Cria um pedido já confirmado/pago no Firestore.
   */
  createManualSale: async (sale: {
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    items: { productName: string; priceYen: number }[];
    paymentMethod: string;        // 'wise' | 'pix' | ...
    currency?: string;            // moeda exibida (default JPY)
    linkedRequestId?: string;     // pedido personalizado de origem
    note?: string;
    createdBy?: string;
  }): Promise<{ ok: boolean; orderNumber?: string; error?: string }> => {
    try {
      await ensureAdminAuth();
      const totalYen = sale.items.reduce((s, it) => s + (it.priceYen || 0), 0);
      const now = new Date().toISOString();
      const orderNumber = `VP-${Date.now().toString(36).toUpperCase()}`;

      const order = {
        orderNumber,
        orderDate: now,
        date: now,
        status: 'confirmed',
        paymentMethod: sale.paymentMethod,
        paymentConfirmed: true,
        paymentConfirmedAt: now,
        items: sale.items.map((it) => ({
          productName: it.productName,
          name: it.productName,
          price: it.priceYen,
          priceYen: it.priceYen,
          quantity: 1,
          size: 'small',
        })),
        totalAmount: totalYen,
        totalPrice: totalYen,
        grandTotalYen: totalYen,
        currency: sale.currency || 'JPY',
        customerName: sale.customerName,
        customerEmail: (sale.customerEmail || '').toLowerCase(),
        customerPhone: sale.customerPhone || '',
        customerType: 'manual',
        source: 'venda_posterior',
        linkedRequestId: sale.linkedRequestId || '',
        adminNote: sale.note || '',
        createdBy: sale.createdBy || '',
      };

      await firebaseSyncService.syncOrderToFirestore('manual-sale', order);
      return { ok: true, orderNumber };
    } catch (e: any) {
      devError('❌ [ORDER] createManualSale falhou:', e);
      return { ok: false, error: e?.message || 'Erro ao registrar venda' };
    }
  },

  /**
   * Busca uma página limitada e ordenada de pedidos para o painel.
   * O cursor é produzido pelo serviço Firestore e deve ser tratado como opaco.
   */
  getOrdersPage: async (
    pageSize = 25,
    cursor: OrderPageCursor | null = null
  ): Promise<OrdersPage> => {
    const page = await firebaseSyncService.getOrdersPageFromFirestore(pageSize, cursor);
    const items: Order[] = page.items.map((order) => ({
      ...order,
      orderDate: order.orderDate || order.date || order.syncedAt,
      totalPrice: order.totalPrice || order.totalAmount || 0,
    }));
    return { ...page, items };
  },


  // Atualiza o status no Firestore e no armazenamento local.
  updateOrderStatus: async (
    orderNumber: string,
    status: OrderStatus['status'],
    options: { customerConfirmation?: boolean } = {}
  ): Promise<boolean> => {
    let updated = false;

    if (status === 'delivered' && options.customerConfirmation) {
      const response = await authenticatedFetch('/api/orders?action=mark-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderNumber }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível confirmar o recebimento.');
      }
      updated = true;
    } else {
      // Os demais status continuam restritos ao fluxo administrativo existente.
      try {
        await ensureAdminAuth();
        await firebaseSyncService.updateOrderStatus(orderNumber, status);
        updated = true;
      } catch (err) {
        devError('❌ [ORDER] Firestore status update failed:', err);
      }
    }

    const users = JSON.parse(safeStorage.getItem('japan-express-users') || '{}');
    Object.keys(users).forEach((email) => {
      const user = users[email];
      if (user.orders && user.orders.length > 0) {
        user.orders.forEach((order, orderIndex: number) => {
          if (order.orderNumber === orderNumber) {
            users[email].orders[orderIndex].status = status;
            users[email].orders[orderIndex].updatedAt = new Date().toISOString();
            updated = true;
          }
        });
      }
    });
    safeStorage.setItem('japan-express-users', JSON.stringify(users));
    return updated;
  },

  // Confirma pagamento do pedido (marca como recebido pelo admin)
  // Confirma pagamentos manuais no servidor; a mesma transação idempotente
  // aplicada pelo webhook Stripe cuida de estoque, promoções e benefícios.
  confirmPayment: async (orderNumber: string, _adminEmail: string): Promise<boolean> => {
    try {
      const response = await authenticatedFetch('/api/confirm-manual-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: orderNumber, reference: '' }),
      });
      if (!response.ok) {
        devError('❌ [ORDER] Server payment confirmation failed:', response.status);
        return false;
      }
      return true;
    } catch (error) {
      devError('❌ [ORDER] Server payment confirmation failed:', error);
      return false;
    }
  },

  // Exclui o pedido de verdade (localStorage + Firestore)
  deleteOrder: async (orderNumber: string): Promise<boolean> => {
    let deletedLocal = false;

    const users = JSON.parse(safeStorage.getItem('japan-express-users') || '{}');
    Object.keys(users).forEach((email) => {
      const user = users[email];
      if (user.orders && user.orders.length > 0) {
        const orderIndex = user.orders.findIndex((order: any) =>
          order.orderNumber === orderNumber
        );
        if (orderIndex !== -1) {
          users[email].orders.splice(orderIndex, 1);
          deletedLocal = true;
        }
      }
    });
    if (deletedLocal) {
      safeStorage.setItem('japan-express-users', JSON.stringify(users));
    }

    // Exclui de verdade no Firestore (deleteDoc), não apenas marca como cancelado
    let deletedRemote = false;
    try {
      await ensureAdminAuth();
      deletedRemote = await firebaseSyncService.deleteOrderFromFirestore(orderNumber);
    } catch (err) {
      devError('❌ [ORDER] Firestore delete failed:', err);
    }

    return deletedLocal || deletedRemote;
  },

  // RESET TOTAL: apaga TODO o histórico de pedidos (localStorage + Firestore).
  // Retorna quantos pedidos foram removidos do Firestore.
  clearAllOrders: async (): Promise<number> => {
    let firestoreDeleted = 0;

    // 1) Firestore — apaga todos os docs da coleção 'orders'
    try {
      await ensureAdminAuth();
      const { collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('@/config/firebase');
      if (db) {
        const snap = await getDocs(collection(db, 'orders'));
        for (const d of snap.docs) {
          await deleteDoc(doc(db, 'orders', d.id));
          firestoreDeleted++;
        }
      }
    } catch (err) {
      devError('❌ [ORDER] clearAllOrders Firestore falhou:', err);
    }

    // 2) localStorage — chaves orders_*, sakura_orders e .orders de cada usuário
    try {
      safeStorage.keys().forEach((key) => {
        if (key.startsWith('orders_')) safeStorage.removeItem(key);
      });
      safeStorage.removeItem('sakura_orders');

      const users = JSON.parse(safeStorage.getItem('japan-express-users') || '{}');
      Object.keys(users).forEach((email) => {
        if (users[email] && Array.isArray(users[email].orders)) {
          users[email].orders = [];
        }
      });
      safeStorage.setItem('japan-express-users', JSON.stringify(users));
    } catch (err) {
      devError('❌ [ORDER] clearAllOrders localStorage falhou:', err);
    }

    return firestoreDeleted;
  },

  // Update order tracking info (both Firestore and safeStorage)
  updateOrderTracking: async (orderNumber: string, trackingNumber: string, trackingUrl: string, carrier: string): Promise<boolean> => {
    let updated = false;

    // Update in Firestore
    try {
      await ensureAdminAuth();
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/config/firebase');
      if (db) {
        const orderRef = doc(db, 'orders', orderNumber);
        await updateDoc(orderRef, {
          trackingNumber,
          trackingUrl,
          carrier,
          status: 'shipped',
          updatedAt: new Date().toISOString()
        });
        updated = true;
        devLog('✅ [ORDER] Tracking saved to Firestore:', orderNumber);
      }
    } catch (err) {
      devError('❌ [ORDER] Firestore tracking update failed:', err);
    }

    // Also update in safeStorage
    const users = JSON.parse(safeStorage.getItem('japan-express-users') || '{}');
    Object.keys(users).forEach((email) => {
      const user = users[email];
      if (user.orders && user.orders.length > 0) {
        user.orders.forEach((order: any, orderIndex: number) => {
          if (order.orderNumber === orderNumber) {
            users[email].orders[orderIndex].trackingNumber = trackingNumber;
            users[email].orders[orderIndex].trackingUrl = trackingUrl;
            users[email].orders[orderIndex].carrier = carrier;
            users[email].orders[orderIndex].status = 'shipped';
            users[email].orders[orderIndex].updatedAt = new Date().toISOString();
            updated = true;
          }
        });
      }
    });
    safeStorage.setItem('japan-express-users', JSON.stringify(users));

    // Also update per-user orders storage
    const allKeys = safeStorage.keys();
    allKeys.forEach(key => {
      if (key.startsWith('orders_')) {
        try {
          const userOrders = JSON.parse(safeStorage.getItem(key) || '[]');
          let changed = false;
          userOrders.forEach((order: any, idx: number) => {
            if (order.orderNumber === orderNumber) {
              userOrders[idx].trackingNumber = trackingNumber;
              userOrders[idx].trackingUrl = trackingUrl;
              userOrders[idx].carrier = carrier;
              userOrders[idx].status = 'shipped';
              changed = true;
            }
          });
          if (changed) safeStorage.setItem(key, JSON.stringify(userOrders));
        } catch (e) { /* ignore */ }
      }
    });

    return updated;
  },
};
