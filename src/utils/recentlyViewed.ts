import { safeStorage } from '@/utils/storage';

const STORAGE_KEY = 'japan-express-recently-viewed';
const MAX_ITEMS = 10;

/** Histórico local (por navegador) de produtos visitados — usado para a seção "Visto Recentemente". */
export const recentlyViewed = {
  getIds(): string[] {
    try {
      const raw = safeStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  track(productId: string): void {
    try {
      const ids = recentlyViewed.getIds().filter((id) => id !== productId);
      ids.unshift(productId);
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_ITEMS)));
    } catch {
      /* noop */
    }
  },
};
