import { useState, useEffect } from 'react';

export type CookieConsent = 'accepted' | 'declined' | null;

const KEY = 'cookie_consent';

export const getCookieConsent = (): CookieConsent => {
  try {
    const val = localStorage.getItem(KEY);
    if (val === 'accepted' || val === 'declined') return val;
  } catch { /* ignore */ }
  return null;
};

export const setCookieConsent = (value: 'accepted' | 'declined') => {
  try { localStorage.setItem(KEY, value); } catch { /* ignore */ }
};

export const useCookieConsent = () => {
  const [consent, setConsentState] = useState<CookieConsent>(getCookieConsent);

  const accept = () => {
    setCookieConsent('accepted');
    setConsentState('accepted');
  };

  const decline = () => {
    setCookieConsent('declined');
    setConsentState('declined');
  };

  return { consent, accept, decline };
};
