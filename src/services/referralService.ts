import { db } from '@/config/firebase';
import { firebaseSyncService } from '@/services/firebaseSyncService';


export const referralService = {
  // Gera o link de indicação do usuário
  getReferralLink(userId: string): string {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://nikkeybox-store.com';
    return `${base}?ref=${userId}`;
  },

  // Lê o ref da URL e salva em sessionStorage para usar no cadastro
  captureReferral(): string | null {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) sessionStorage.setItem('jp_referral', ref);
    return ref || sessionStorage.getItem('jp_referral');
  },

  // Recupera o referral capturado (para usar no register)
  getPendingReferral(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('jp_referral');
  },

  clearPendingReferral(): void {
    if (typeof window !== 'undefined') sessionStorage.removeItem('jp_referral');
  },

  // Chamado após cadastro: vincula referredBy ao novo usuário
  async linkReferral(newUserId: string, referrerId: string): Promise<void> {
    if (!db || newUserId === referrerId) return;
    try {
      await firebaseSyncService.syncUserToFirestore(newUserId, { referredBy: referrerId });
    } catch { /* silent */ }
  },

};
