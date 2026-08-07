import { describe, expect, it } from 'vitest';
import { COMPANY_PROFILE } from './companyProfile';

describe('official fulfillment origin', () => {
  it('uses the confirmed Fukuyama, Hiroshima address everywhere', () => {
    expect(COMPANY_PROFILE.fulfillmentOrigin).toMatchObject({
      postalCode: '720-1143',
      addressLine1: '257-18 Shimoyamamori, Ekiya-cho',
      city: 'Fukuyama-shi',
      prefecture: 'Hiroshima-ken',
      country: 'Japan',
    });
    expect(COMPANY_PROFILE.fulfillmentOrigin.formattedJa).toBe(
      '〒720-1143 広島県福山市駅家町下山守257-18',
    );
  });
});
