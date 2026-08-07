import { db } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { userRewardsService } from '@/services/userRewardsService';

export type SocialNetwork = 'instagram' | 'facebook' | 'tiktok' | 'x';

export const SOCIAL_POINTS = 500;

export const SOCIAL_CONFIG: Record<SocialNetwork, { label: string; url: string; color: string }> = {
  instagram: { label: 'Instagram', url: 'https://www.instagram.com/japan_express_official/', color: 'bg-pink-500' },
  facebook:  { label: 'Facebook',  url: 'https://www.facebook.com/japanexpressoficial',   color: 'bg-blue-600' },
  tiktok:    { label: 'TikTok',    url: 'https://www.tiktok.com/@japanexpressoficial',    color: 'bg-gray-900' },
  x:         { label: 'X (Twitter)', url: 'https://x.com/japanexpress_of',                color: 'bg-black' },
};

export const socialFollowService = {
  async getFollowedNetworks(userId: string): Promise<Partial<Record<SocialNetwork, boolean>>> {
    if (!db) return {};
    try {
      const snap = await getDoc(doc(db, 'users', userId));
      return (snap.data()?.socialFollows as Partial<Record<SocialNetwork, boolean>>) || {};
    } catch { return {}; }
  },

  async confirmFollow(_userId: string, network: SocialNetwork): Promise<{ ok: boolean; alreadyClaimed: boolean }> {
    try {
      const reward = await userRewardsService.claimSocialFollow(network);
      return { ok: reward.awarded > 0, alreadyClaimed: reward.alreadyClaimed };
    } catch {
      return { ok: false, alreadyClaimed: false };
    }
  },
};
