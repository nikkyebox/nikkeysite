import { safeStorage } from '@/utils/storage';
import type { Coupon } from '@/types';
import { authenticatedFetch } from '@/services/authenticatedFetch';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


const STORAGE_KEY = 'japan-express-coupons';
const FIRESTORE_COUPONS = 'coupons';

// ==================== FIRESTORE HELPERS ====================

// Sync a single coupon to Firestore
const syncCouponToFirestore = async (coupon: Coupon) => {
  try {
    const { doc, setDoc } = await import('firebase/firestore');
    const { db } = await import('@/config/firebase');
    if (!db) return;
    await setDoc(doc(db, FIRESTORE_COUPONS, coupon.code), {
      ...coupon,
      updatedAt: new Date().toISOString(),
    });
    devLog('✅ [COUPON] Synced to Firestore:', coupon.code);
  } catch (err) {
    devWarn('⚠️ [COUPON] Failed to sync coupon to Firestore:', err);
  }
};

// Delete coupon from Firestore
const deleteCouponFromFirestore = async (code: string) => {
  try {
    const { doc, deleteDoc } = await import('firebase/firestore');
    const { db } = await import('@/config/firebase');
    if (!db) return;
    await deleteDoc(doc(db, FIRESTORE_COUPONS, code));
    devLog('✅ [COUPON] Deleted from Firestore:', code);
  } catch (err) {
    devWarn('⚠️ [COUPON] Failed to delete coupon from Firestore:', err);
  }
};

// Load all coupons from Firestore and merge with safeStorage
const loadCouponsFromFirestore = async (): Promise<Coupon[]> => {
  try {
    const { collection, getDocs } = await import('firebase/firestore');
    const { db } = await import('@/config/firebase');
    if (!db) return [];
    
    const snapshot = await getDocs(collection(db, FIRESTORE_COUPONS));
    const firestoreCoupons: Coupon[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      firestoreCoupons.push({
        code: data.code || doc.id,
        discount: data.discount || 0,
        discountPercent: data.discountPercent,
        type: data.type || 'percent',
        expiryDate: data.expiryDate,
        isActive: data.isActive !== false,
        usageLimit: data.usageLimit,
        usedCount: data.usedCount || 0,
        description: data.description || '',
        createdAt: data.createdAt || new Date().toISOString(),
        targetType: data.targetType || 'all',
        targetEmails: data.targetEmails || undefined,
        minOrders: data.minOrders || undefined,
        freeShipping: data.freeShipping || false,
      });
    });
    
    // Merge: Firestore takes priority, then add local-only ones
    const localCoupons = couponService.getAll();
    const map = new Map<string, Coupon>();
    firestoreCoupons.forEach(c => map.set(c.code, c));
    localCoupons.forEach(c => { if (!map.has(c.code)) map.set(c.code, c); });
    
    const merged = Array.from(map.values());
    // Update safeStorage with merged data
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    
    devLog('✅ [COUPON] Loaded from Firestore:', firestoreCoupons.length, 'coupons');
    return merged;
  } catch (err) {
    devWarn('⚠️ [COUPON] Failed to load coupons from Firestore:', err);
    return couponService.getAll();
  }
};

export const couponService = {
  // Check if a coupon is eligible for a given user based on targeting rules
  checkTargetEligibility: (coupon: Coupon, userEmail?: string, userBirthdate?: string, userTotalOrders?: number): boolean => {
    const targetType = coupon.targetType || 'all';
    
    if (targetType === 'all') return true;
    
    if (targetType === 'specific') {
      // Only specific emails can use this coupon
      if (!userEmail || !coupon.targetEmails?.length) return false;
      return coupon.targetEmails.some(e => e.toLowerCase() === userEmail.toLowerCase());
    }
    
    if (targetType === 'birthday') {
      // Only users whose birthday month matches current month
      if (!userBirthdate) return false;
      const now = new Date();
      const birthDate = new Date(userBirthdate);
      return birthDate.getMonth() === now.getMonth();
    }
    
    if (targetType === 'loyalty') {
      // Only users with at least N total orders
      const minOrders = coupon.minOrders || 1;
      return (userTotalOrders || 0) >= minOrders;
    }
    
    return true;
  },

  // Get all coupons from safeStorage (sync/fast)
  getAll: (): Coupon[] => {
    const stored = safeStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  // Get all coupons from Firestore + merge with safeStorage (async)
  getAllAsync: async (): Promise<Coupon[]> => {
    return await loadCouponsFromFirestore();
  },

  // Get active coupons (sync, from safeStorage)
  getActive: (): Coupon[] => {
    const coupons = couponService.getAll();
    const now = new Date();
    return coupons.filter(c => 
      c.isActive && 
      new Date(c.expiryDate) > now &&
      (!c.usageLimit || c.usedCount < c.usageLimit)
    );
  },

  // Get active coupons from Firestore (async)
  getActiveAsync: async (): Promise<Coupon[]> => {
    const coupons = await loadCouponsFromFirestore();
    const now = new Date();
    return coupons.filter(c => 
      c.isActive && 
      new Date(c.expiryDate) > now &&
      (!c.usageLimit || c.usedCount < c.usageLimit)
    );
  },

  // Validate and get coupon by code (with user email check)
  validateCoupon: (code: string, userEmail?: string, orderTotalYen?: number): { valid: boolean; coupon?: Coupon; error?: string } => {
    const coupons = couponService.getAll();
    const coupon = coupons.find(c => c.code.toUpperCase() === code.toUpperCase());

    if (!coupon) {
      return { valid: false, error: 'Cupom inválido' };
    }

    if (!coupon.isActive) {
      return { valid: false, error: 'Cupom desativado' };
    }

    const now = new Date();
    if (new Date(coupon.expiryDate) < now) {
      return { valid: false, error: 'Cupom expirado' };
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return { valid: false, error: 'Cupom esgotado' };
    }

    if (coupon.minOrderValue && orderTotalYen !== undefined && orderTotalYen < coupon.minOrderValue) {
      return { valid: false, error: `Pedido mínimo de ¥${coupon.minOrderValue.toLocaleString()} para usar este cupom.` };
    }

    // Check if user has already used this coupon
    if (userEmail) {
      const usedBy = couponService.getCouponUsage(code);
      if (usedBy.includes(userEmail)) {
        return { valid: false, error: 'Você já usou este cupom' };
      }
    }

    return { valid: true, coupon };
  },

  // Recarrega os cupons criados no painel antes de validar. O uso por cliente
  // NÃO é conferido aqui: `coupon_usage` é escrito e lido pelo servidor
  // (`api/_lib/fulfillment.js`), que recusa com `coupon_already_used`.
  validateCouponAsync: async (code: string, userEmail?: string, orderTotalYen?: number): Promise<{ valid: boolean; coupon?: Coupon; error?: string }> => {
    try {
      const request = userEmail ? authenticatedFetch : fetch;
      const response = await request('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, orderTotalYen: orderTotalYen || 0 }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok !== true || !payload.coupon) {
        return { valid: false, error: payload?.error || 'Cupom inválido ou indisponível.' };
      }
      return {
        valid: true,
        coupon: {
          ...payload.coupon,
          isActive: true,
          usedCount: 0,
          createdAt: '',
        } as Coupon,
      };
    } catch (error) {
      devWarn('[COUPON] Falha ao validar cupom:', error);
      return { valid: false, error: 'Não foi possível validar o cupom agora.' };
    }
  },

  // Calculate discount
  calculateDiscount: (coupon: Coupon, subtotal: number): number => {
    if (coupon.type === 'fixed') {
      return Math.min(coupon.discount, subtotal);
    } else {
      return Math.round(subtotal * (coupon.discountPercent || 0) / 100);
    }
  },

  // Marca o cupom como usado no armazenamento local (contador e lista de
  // e-mails). O registro que vale é o do servidor, gravado em `coupon_usage`
  // pela `fulfillment.js` quando o pagamento confirma.
  useCoupon: (code: string, userEmail: string): void => {
    const coupons = couponService.getAll();
    const index = coupons.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
    
    if (index !== -1) {
      coupons[index].usedCount += 1;
      
      // Track which users have used this coupon (safeStorage)
      const usageKey = `coupon_usage_${code.toUpperCase()}`;
      const usedBy = JSON.parse(safeStorage.getItem(usageKey) || '[]');
      if (!usedBy.includes(userEmail)) {
        usedBy.push(userEmail);
        safeStorage.setItem(usageKey, JSON.stringify(usedBy));
      }
      
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(coupons));
    }
  },

  // Get users who used a coupon
  getCouponUsage: (code: string): string[] => {
    const usageKey = `coupon_usage_${code.toUpperCase()}`;
    return JSON.parse(safeStorage.getItem(usageKey) || '[]');
  },

  // Create new coupon - saves to safeStorage AND Firestore
  create: (coupon: Omit<Coupon, 'createdAt' | 'usedCount'>): Coupon => {
    const coupons = couponService.getAll();
    
    const newCoupon: Coupon = {
      ...coupon,
      code: coupon.code.toUpperCase(),
      usedCount: 0,
      createdAt: new Date().toISOString(),
    };

    coupons.push(newCoupon);
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(coupons));
    
    // Sync to Firestore (fire-and-forget)
    syncCouponToFirestore(newCoupon);
    
    return newCoupon;
  },

  // Update coupon - saves to safeStorage AND Firestore
  update: (code: string, updates: Partial<Coupon>): boolean => {
    const coupons = couponService.getAll();
    const index = coupons.findIndex(c => c.code === code);
    
    if (index !== -1) {
      coupons[index] = { ...coupons[index], ...updates };
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(coupons));
      
      // Sync to Firestore (fire-and-forget)
      syncCouponToFirestore(coupons[index]);
      
      return true;
    }
    return false;
  },

  // Delete coupon - removes from safeStorage AND Firestore
  delete: (code: string): boolean => {
    const coupons = couponService.getAll();
    const filtered = coupons.filter(c => c.code !== code);
    
    if (filtered.length < coupons.length) {
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      
      // Delete from Firestore (fire-and-forget)
      deleteCouponFromFirestore(code);
      
      return true;
    }
    return false;
  },

  // Sync all local coupons to Firestore (useful for initial migration)
  syncAllToFirestore: async (): Promise<void> => {
    const coupons = couponService.getAll();
    for (const coupon of coupons) {
      await syncCouponToFirestore(coupon);
    }
    devLog('✅ [COUPON] All local coupons synced to Firestore');
  },

  // Load coupons from Firestore into safeStorage (for clients)
  loadFromFirestore: async (): Promise<Coupon[]> => {
    return await loadCouponsFromFirestore();
  },

  // Create default welcome coupon (only if no coupons exist anywhere)
  createDefaultCoupons: async (): Promise<void> => {
    // First try loading from Firestore
    const firestoreCoupons = await loadCouponsFromFirestore();
    
    if (firestoreCoupons.length === 0) {
      // No coupons anywhere - create the welcome coupon
      couponService.create({
        code: 'BEMVINDO10',
        discount: 0,
        discountPercent: 10,
        type: 'percent',
        expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
        description: 'Cupom de boas-vindas - 10% de desconto',
      });
    }
  }
};

// Initialize: load coupons from Firestore on startup
if (typeof window !== 'undefined') {
  couponService.createDefaultCoupons();
}
