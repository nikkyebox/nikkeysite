import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartItem } from '@/types';
import { checkoutPointsCoverage } from '@/utils/psFeeWaiver';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { pathname: '/checkout' },
  toast: vi.fn(),
  requestPsFeeWaiver: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.location,
}));
vi.mock('@/context/UserContext', () => ({
  useUser: () => ({ isAuthenticated: true }),
}));
vi.mock('@/context/CartContext', () => ({
  useCart: () => ({
    items: [{
      product: { id: 'produto-1', prices: { small: 1450 }, noPsFee: false },
      size: 'small',
      quantity: 1,
    } as unknown as CartItem],
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/services/newsletterService', () => ({
  newsletterService: { subscribe: vi.fn() },
}));
vi.mock('@/services/psFeeWaiverService', () => ({
  requestPsFeeWaiver: mocks.requestPsFeeWaiver,
}));

import ExitIntentPopup from './ExitIntentPopup';

function triggerDesktopExit() {
  act(() => { vi.advanceTimersByTime(6001); });
  fireEvent.mouseOut(document, { clientY: 0, relatedTarget: null });
}

describe('ExitIntentPopup com resgate de pontos', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'));
    localStorage.clear();
    sessionStorage.clear();
    mocks.requestPsFeeWaiver.mockReset().mockResolvedValue({
      token: 'autorizacao-assinada',
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('não oferece zerar a taxa PS quando cupom e pontos cobrem toda a mercadoria', () => {
    localStorage.setItem('redeem_points', '1000');
    checkoutPointsCoverage.set(true);
    render(<ExitIntentPopup />);

    triggerDesktopExit();

    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Finalize seu pedido');
    expect(screen.queryByText('Finalize agora e a taxa sai de graça!')).toBeNull();
  });

  // A oferta de isenção da taxa PS ("reservar Personal Shopper") está
  // DESATIVADA por pedido (ver PS_OFFER_POPUP_ENABLED em
  // src/components/ExitIntentPopup.tsx) — mesmo sem cobertura total por
  // pontos, o popup de saída cai no lembrete genérico (`retention`), nunca
  // no `ps_offer`.
  it('nunca oferece a isenção da taxa PS enquanto PS_OFFER_POPUP_ENABLED for false', () => {
    localStorage.setItem('redeem_points', '1000');
    checkoutPointsCoverage.set(false);
    render(<ExitIntentPopup />);

    triggerDesktopExit();

    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Finalize seu pedido');
    expect(screen.queryByText('Oferta: taxa de Personal Shopper grátis')).toBeNull();
  });

  // O fluxo de aceitar a isenção (requestPsFeeWaiver → psFeeWaiver.grant)
  // continua no código para religar depois — sem o popup, ele só não é
  // acionado pela UI. Cobertura do fluxo em si fica para quando for reativado.
});
