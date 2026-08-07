import { authenticatedFetch } from '@/services/authenticatedFetch';

export type RewardNetwork = 'instagram' | 'facebook' | 'tiktok' | 'x';

export interface UserRewardResult {
  ok: true;
  awarded: number;
  total: number;
  alreadyClaimed: boolean;
}

async function claimReward(body: Record<string, string>): Promise<UserRewardResult> {
  const response = await authenticatedFetch('/api/user-rewards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'reward_request_failed');
  }
  if (
    payload?.ok !== true
    || !Number.isFinite(payload.awarded)
    || !Number.isFinite(payload.total)
    || typeof payload.alreadyClaimed !== 'boolean'
  ) {
    throw new Error('invalid_reward_response');
  }
  return payload as UserRewardResult;
}

export const userRewardsService = {
  claimSocialFollow(network: RewardNetwork) {
    return claimReward({ action: 'social-follow', network });
  },

  claimBirthday() {
    return claimReward({ action: 'birthday' });
  },

  claimProductReview(productId: string) {
    return claimReward({ action: 'product-review', productId });
  },
};
