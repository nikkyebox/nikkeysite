import { db } from '@/config/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

export interface MarketingExpense {
  id?: string;
  date: string;
  amount: number;
  currency: 'BRL' | 'JPY';
  type: 'ads' | 'influencer';
  platform: string;
  description?: string;
  createdAt?: string;
}

export const MARKETING_EXPENSES_COLLECTION = 'marketing_expenses';

export async function getMarketingExpenses(): Promise<MarketingExpense[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, MARKETING_EXPENSES_COLLECTION), orderBy('date', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as MarketingExpense));
  } catch { return []; }
}
