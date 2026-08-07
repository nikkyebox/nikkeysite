// Isenção da Taxa de Personal Shopper concedida pela oferta de saída.
// O navegador guarda só a autorização assinada pelo servidor; timestamp local
// sozinho não pode alterar o valor cobrado no pedido autoritativo.
const KEY = 'ps_fee_waiver_until';

export const PS_FEE_WAIVER_EVENT = 'psfee-waiver-changed';
const emitChange = (): void => {
  try { window.dispatchEvent(new Event(PS_FEE_WAIVER_EVENT)); } catch { /* SSR/no window */ }
};

const POINTS_COVER_ALL_KEY = 'checkout_points_cover_all';

export const checkoutPointsCoverage = {
  set(coversAll: boolean): void {
    try {
      sessionStorage.setItem(POINTS_COVER_ALL_KEY, coversAll ? '1' : '0');
    } catch {
      /* storage indisponível — o servidor ainda protege a taxa */
    }
  },

  coversAll(): boolean {
    try {
      return sessionStorage.getItem(POINTS_COVER_ALL_KEY) === '1';
    } catch {
      return false;
    }
  },

  clear(): void {
    try {
      sessionStorage.removeItem(POINTS_COVER_ALL_KEY);
    } catch {
      /* noop */
    }
  },
};

interface StoredWaiver {
  token: string;
  expiresAt: number;
}

function currentWaiver(): StoredWaiver | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) || 'null') as Partial<StoredWaiver> | null;
    if (!parsed || typeof parsed.token !== 'string' || !parsed.token || !Number.isFinite(parsed.expiresAt)) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    if (Date.now() >= Number(parsed.expiresAt)) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return { token: parsed.token, expiresAt: Number(parsed.expiresAt) };
  } catch {
    try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
    return null;
  }
}

export const psFeeWaiver = {
  grant(token: string, expiresAt: number): boolean {
    if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ token, expiresAt }));
      emitChange();
      return true;
    } catch {
      return false;
    }
  },

  token(): string {
    return currentWaiver()?.token || '';
  },

  isActive(): boolean {
    return currentWaiver() !== null;
  },

  clear(): void {
    try {
      sessionStorage.removeItem(KEY);
      emitChange();
    } catch {
      /* noop */
    }
  },
};
