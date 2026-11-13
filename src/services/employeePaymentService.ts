import { db } from '@/config/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

export interface EmployeePayment {
  id?: string;
  employeeId: string;
  employeeName: string;
  date: string;
  amount: number;
  currency: 'BRL' | 'JPY';
  description?: string;
  createdAt?: string;
}

export const EMPLOYEE_PAYMENTS_COLLECTION = 'employee_payments';

export async function getEmployeePayments(): Promise<EmployeePayment[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, EMPLOYEE_PAYMENTS_COLLECTION), orderBy('date', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as EmployeePayment));
  } catch { return []; }
}
