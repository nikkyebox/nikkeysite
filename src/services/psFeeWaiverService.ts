import { checkoutToken } from '@/services/checkoutService';

interface IssuedPsFeeWaiver {
  token: string;
  expiresAt: number;
}

/** Solicita ao servidor a autorização assinada e vinculada à sessão Firebase. */
export async function requestPsFeeWaiver(): Promise<IssuedPsFeeWaiver> {
  const token = await checkoutToken();
  const response = await fetch('/api/ps-fee-waiver', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({})) as Partial<IssuedPsFeeWaiver> & { error?: string };
  if (!response.ok) throw new Error(payload.error || 'Não foi possível liberar a taxa.');
  if (typeof payload.token !== 'string' || !payload.token || !Number.isFinite(payload.expiresAt)) {
    throw new Error('Autorização de taxa inválida.');
  }
  return { token: payload.token, expiresAt: Number(payload.expiresAt) };
}
