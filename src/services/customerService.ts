import { safeStorage } from '@/utils/storage';
// Serviço para gerenciar dados de clientes e estatísticas
import { firebaseSyncService } from '@/services/firebaseSyncService';
import { collection, getCountFromServer, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ensureAdminAuth } from '@/utils/adminAuth';
import { toYen } from '@/utils/currency';
import { authenticatedFetch } from '@/services/authenticatedFetch';

export interface CustomerVerification {
  verified: boolean;
  lastSignIn: string | null;
}

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


export interface CustomerStats {
  email: string;
  name: string;
  phone: string;
  gender?: 'masculino' | 'feminino' | 'outro';
  birthdate?: string; // "YYYY-MM" format
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderDate: string | null;
  socialFollows?: {
    instagram?: boolean;
    tiktok?: boolean;
  };
  favoriteProducts: Array<{
    name: string;
    quantity: number;
    total: number;
  }>;
  orderHistory: Array<{
    orderNumber: string;
    date: string;
    total: number;
    status: string;
  }>;
}

export const customerService = {
  // Obtém todos os clientes com suas estatísticas
  getAllCustomers(): CustomerStats[] {
    const usersData = safeStorage.getItem('japan-express-users');
    if (!usersData) return [];

    const users = JSON.parse(usersData);
    const customers: CustomerStats[] = [];

    // Itera sobre cada usuário
    Object.keys(users).forEach(email => {
      const user = users[email];
      const orders = user.orders || [];

      if (orders.length === 0) {
        customers.push({
          email,
          name: user.name || 'N/A',
          phone: user.phone || 'N/A',
          gender: user.gender,
          birthdate: user.birthdate,
          totalOrders: 0,
          totalSpent: 0,
          averageOrderValue: 0,
          lastOrderDate: null,
          favoriteProducts: [],
          orderHistory: [],
        });
        return;
      }

      // Calcula totais
      let totalSpent = 0;
      const productMap: Record<string, { quantity: number; total: number }> = {};
      const orderHistory: Array<{ orderNumber: string; date: string; total: number; status: string }> = [];

      orders.forEach((order: any) => {
        // Normaliza tudo para ¥ (pedidos podem estar em R$/€) para o painel admin.
        const oc = order.currency;
        totalSpent += toYen(order.totalPrice || 0, oc);

        orderHistory.push({
          orderNumber: order.orderNumber,
          date: order.date,
          total: toYen(order.totalPrice || 0, oc),
          status: order.status || 'pending',
        });

        // Conta produtos
        order.items.forEach((item: any) => {
          if (!productMap[item.name]) {
            productMap[item.name] = { quantity: 0, total: 0 };
          }
          productMap[item.name].quantity += item.quantity;
          productMap[item.name].total += toYen(item.price * item.quantity, oc);
        });
      });

      // Ordena produtos por quantidade
      const favoriteProducts = Object.entries(productMap)
        .map(([name, data]) => ({
          name,
          quantity: data.quantity,
          total: data.total,
        }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5); // Top 5 produtos

      // Ordena pedidos por data (mais recente primeiro)
      orderHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      customers.push({
        email,
        name: user.name || 'N/A',
        phone: user.phone || 'N/A',
        gender: user.gender,
        birthdate: user.birthdate,
        totalOrders: orders.length,
        totalSpent,
        averageOrderValue: totalSpent / orders.length,
        lastOrderDate: orderHistory[0]?.date || null,
        favoriteProducts,
        orderHistory,
      });
    });

    // Ordena por total gasto (maiores clientes primeiro)
    return customers.sort((a, b) => b.totalSpent - a.totalSpent);
  },

  // Obtém estatísticas gerais de clientes
  getCustomerOverview() {
    const customers = this.getAllCustomers();
    
    const totalCustomers = customers.length;
    const activeCustomers = customers.filter(c => c.totalOrders > 0).length;
    const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    const totalOrders = customers.reduce((sum, c) => sum + c.totalOrders, 0);
    const averageOrdersPerCustomer = activeCustomers > 0 ? totalOrders / activeCustomers : 0;
    const averageRevenuePerCustomer = activeCustomers > 0 ? totalRevenue / activeCustomers : 0;

    // Top clientes (Top 10)
    const topCustomers = customers
      .filter(c => c.totalOrders > 0)
      .slice(0, 10);

    return {
      totalCustomers,
      activeCustomers,
      inactiveCustomers: totalCustomers - activeCustomers,
      totalRevenue,
      totalOrders,
      averageOrdersPerCustomer,
      averageRevenuePerCustomer,
      topCustomers,
    };
  },

  // Busca cliente por email
  getCustomerByEmail(email: string): CustomerStats | null {
    const customers = this.getAllCustomers();
    return customers.find(c => c.email === email) || null;
  },

  /** Só a CONTAGEM de clientes, sem trazer nenhum documento.
   *
   *  O painel exibe apenas um número e o badge de "novos", mas chamava
   *  `getAllCustomersAsync()` para isso — lendo a coleção `users` E a `orders`
   *  inteiras, a cada 30 segundos. Com o painel aberto isso consumia dezenas
   *  de milhares de leituras por hora e esgotava sozinho a cota diária do
   *  Firestore em pouco mais de uma hora, derrubando a loja inteira.
   *
   *  `getCountFromServer` é cobrado como 1 leitura por lote de 1000
   *  documentos: o mesmo número por ~1 leitura em vez de centenas. */
  async getCustomerCount(): Promise<number> {
    if (!db) throw new Error('Firestore not available');
    const snap = await getCountFromServer(collection(db, 'users'));
    return snap.data().count;
  },

  /** Mapa email(lower) → { verified, lastSignIn } vindo do Firebase Auth.
   *
   *  O Firestore não guarda emailVerified; o endpoint /api/admin?action=
   *  customers-verification é a única fonte. Retorna Map vazio em caso de
   *  falha (ex.: vite dev puro sem API) — o painel simplesmente omite o selo. */
  async getCustomerVerificationAsync(): Promise<Map<string, CustomerVerification>> {
    try {
      const res = await authenticatedFetch('/api/admin?action=customers-verification');
      if (!res.ok) {
        devWarn('⚠️ [CUSTOMER] verification fetch failed:', res.status);
        return new Map();
      }
      const data = await res.json() as { users?: Record<string, { verified?: boolean; lastSignIn?: string | null }> };
      const map = new Map<string, CustomerVerification>();
      for (const [email, v] of Object.entries(data.users || {})) {
        map.set(String(email).toLowerCase(), { verified: !!v.verified, lastSignIn: v.lastSignIn ?? null });
      }
      return map;
    } catch (error) {
      devWarn('⚠️ [CUSTOMER] verification unavailable:', error);
      return new Map();
    }
  },

  // Async version: fetches all users from Firestore + merges with safeStorage
  async getAllCustomersAsync(): Promise<CustomerStats[]> {
    try {
      if (!db) throw new Error('Firestore not available');
      
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const localCustomers = this.getAllCustomers();
      const customerMap = new Map<string, any>();

      // Add Firestore users
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        const email = data.email || doc.id;
        const orders = data.orders || [];

        let totalSpent = 0;
        const orderHistory: any[] = [];
        const productMap: Record<string, { quantity: number; total: number }> = {};

        orders.forEach((order: any) => {
          const oc = order.currency;
          totalSpent += toYen(order.totalPrice || order.totalAmount || 0, oc);
          orderHistory.push({
            orderNumber: order.orderNumber,
            date: order.date || order.orderDate,
            total: toYen(order.totalPrice || order.totalAmount || 0, oc),
            status: order.status || 'pending',
          });
          if (order.items) {
            order.items.forEach((item: any) => {
              const name = item.name || item.productName;
              if (!productMap[name]) productMap[name] = { quantity: 0, total: 0 };
              productMap[name].quantity += item.quantity;
              productMap[name].total += toYen((item.price || 0) * item.quantity, oc);
            });
          }
        });

        const favoriteProducts = Object.entries(productMap)
          .map(([name, d]) => ({ name, quantity: d.quantity, total: d.total }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5);

        orderHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        customerMap.set(email, {
          email,
          name: data.name || 'N/A',
          phone: data.phone || 'N/A',
          totalOrders: orders.length,
          totalSpent,
          averageOrderValue: orders.length > 0 ? totalSpent / orders.length : 0,
          lastOrderDate: orderHistory[0]?.date || null,
          socialFollows: data.socialFollows,
          favoriteProducts,
          orderHistory,
        });
      });

      // Also check Firestore orders collection for orders linked to users
      try {
        const ordersSnapshot = await getDocs(collection(db, 'orders'));
        ordersSnapshot.forEach((doc) => {
          const order = doc.data();
          const email = order.customerEmail;
          if (email && customerMap.has(email)) {
            const customer = customerMap.get(email);
            const existingOrder = customer.orderHistory.find((o: any) => o.orderNumber === order.orderNumber);
            if (!existingOrder) {
              customer.totalOrders += 1;
              customer.totalSpent += toYen(order.totalPrice || order.totalAmount || 0, order.currency);
              customer.orderHistory.push({
                orderNumber: order.orderNumber || doc.id,
                date: order.orderDate || order.date || order.syncedAt,
                total: toYen(order.totalPrice || order.totalAmount || 0, order.currency),
                status: order.status || 'pending',
              });
              customer.averageOrderValue = customer.totalOrders > 0 ? customer.totalSpent / customer.totalOrders : 0;
              customer.orderHistory.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
              customer.lastOrderDate = customer.orderHistory[0]?.date || null;
            }
          }
        });
      } catch (err) {
        devWarn('⚠️ [CUSTOMER] Could not fetch orders collection:', err);
      }

      // Add local-only customers not in Firestore
      localCustomers.forEach(c => {
        if (!customerMap.has(c.email)) {
          customerMap.set(c.email, c);
        }
      });

      return Array.from(customerMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);
    } catch (error) {
      devError('❌ [CUSTOMER SERVICE] Firestore fetch failed, using safeStorage:', error);
      return this.getAllCustomers();
    }
  },

  // Async customer overview
  async getCustomerOverviewAsync(): Promise<any> {
    const customers = await this.getAllCustomersAsync();

    const totalCustomers = customers.length;
    const activeCustomers = customers.filter(c => c.totalOrders > 0).length;
    const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    const totalOrders = customers.reduce((sum, c) => sum + c.totalOrders, 0);
    const averageOrdersPerCustomer = activeCustomers > 0 ? totalOrders / activeCustomers : 0;
    const averageRevenuePerCustomer = activeCustomers > 0 ? totalRevenue / activeCustomers : 0;

    const topCustomers = customers.filter(c => c.totalOrders > 0).slice(0, 10);

    return {
      totalCustomers,
      activeCustomers,
      inactiveCustomers: totalCustomers - activeCustomers,
      totalRevenue,
      totalOrders,
      averageOrdersPerCustomer,
      averageRevenuePerCustomer,
      topCustomers,
    };
  },

  // Delete um cliente específico (localStorage + Firestore)
  async deleteCustomer(email: string): Promise<boolean> {
    let deletedLocal = false;
    try {
      const usersData = safeStorage.getItem('japan-express-users');
      if (usersData) {
        const users = JSON.parse(usersData);
        if (users[email]) {
          delete users[email];
          safeStorage.setItem('japan-express-users', JSON.stringify(users));
          deletedLocal = true;
        }
      }
    } catch (error) {
      devError('❌ Erro ao deletar cliente (local):', error);
    }

    // Remove também do Firestore (senão reaparece ao recarregar)
    let deletedRemote = false;
    try {
      await ensureAdminAuth();
      deletedRemote = await firebaseSyncService.deleteUserByEmail(email);
    } catch (error) {
      devError('❌ Erro ao deletar cliente (Firestore):', error);
    }

    return deletedLocal || deletedRemote;
  },

  // Delete apenas os pedidos de um cliente (mantém cliente)
  async deleteCustomerOrders(email: string): Promise<boolean> {
    let updatedLocal = false;
    try {
      const usersData = safeStorage.getItem('japan-express-users');
      if (usersData) {
        const users = JSON.parse(usersData);
        if (users[email]) {
          users[email].orders = [];
          safeStorage.setItem('japan-express-users', JSON.stringify(users));
          updatedLocal = true;
        }
      }
    } catch (error) {
      devError('❌ Erro ao deletar histórico (local):', error);
    }

    // Limpa também no Firestore
    let updatedRemote = false;
    try {
      await ensureAdminAuth();
      updatedRemote = await firebaseSyncService.clearUserOrdersByEmail(email);
    } catch (error) {
      devError('❌ Erro ao deletar histórico (Firestore):', error);
    }

    return updatedLocal || updatedRemote;
  },

  // Delete todos os clientes (localStorage + Firestore)
  async deleteAllCustomers(): Promise<boolean> {
    try {
      safeStorage.setItem('japan-express-users', JSON.stringify({}));
    } catch (error) {
      devError('❌ Erro ao deletar todos os clientes (local):', error);
    }
    try {
      await ensureAdminAuth();
      await firebaseSyncService.deleteAllUsersFromFirestore();
    } catch (error) {
      devError('❌ Erro ao deletar todos os clientes (Firestore):', error);
    }
    return true;
  },

  // Delete todo o histórico (pedidos de todos os clientes, localStorage + Firestore)
  async deleteAllOrderHistory(): Promise<boolean> {
    // 1. Limpa orders no japan-express-users
    try {
      const usersData = safeStorage.getItem('japan-express-users');
      if (usersData) {
        const users = JSON.parse(usersData);
        Object.keys(users).forEach(email => {
          users[email].orders = [];
        });
        safeStorage.setItem('japan-express-users', JSON.stringify(users));
      }
    } catch (error) {
      devError('❌ Erro ao deletar histórico (local):', error);
    }
    // 2. Remove chaves orders_${userId} (storage por userId)
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('orders_')) keysToRemove.push(k);
      }
      keysToRemove.forEach(k => safeStorage.removeItem(k));
    } catch { /* ignora */ }
    // 3. Limpa sakura_orders
    safeStorage.removeItem('sakura_orders');
    // 4. Firestore
    try {
      await ensureAdminAuth();
      await firebaseSyncService.deleteAllOrdersFromFirestore();
      // Zera orders nos documentos de usuário no Firestore
      await firebaseSyncService.resetAllUsersData();
    } catch (error) {
      devError('❌ Erro ao deletar histórico (Firestore):', error);
    }
    return true;
  },
};
