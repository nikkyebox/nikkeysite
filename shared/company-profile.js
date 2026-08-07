import profile from './company-profile.json' with { type: 'json' };

export const COMPANY_PROFILE = Object.freeze({
  ...profile,
  whatsapp: Object.freeze(profile.whatsapp),
  fulfillmentOrigin: Object.freeze(profile.fulfillmentOrigin),
});
