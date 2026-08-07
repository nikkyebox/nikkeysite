import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CartItem, Product } from '@/types';

// Regressão do CRÍTICO #2 do AUDITORIA.md: `getSpaceUsed()` do CartContext
// devolve um objeto novo a cada chamada. Chamá-lo direto no corpo do render
// (sem memoizar) invalidava `calculateBoxes` → `shippingOptions` a cada
// render; o efeito então chamava `onShippingSelect`, o pai (Cart/Checkout,
// aqui simulado pelo harness abaixo) atualizava estado real, o filho
// recebia novas props, recalculava de novo — "Maximum update depth
// exceeded" ao clicar num carrier no checkout. Um `onShippingSelect`
// mockado com `vi.fn()` NÃO fecha esse ciclo (não é setState de verdade),
// por isso o harness usa `useState` como o app real faz.

const produto: Product = {
  id: 'p1',
  name: 'Produto Teste',
  category: 'cosmeticos',
  prices: { small: 3000 },
  weightGrams: 300,
  images: [],
  description: '',
  stock: { unlimited: true },
} as unknown as Product;

const item: CartItem = { product: produto, size: 'small', quantity: 1 };
// Array estável entre renders — o CartContext real guarda os itens em estado,
// então a referência só muda quando o carrinho muda de verdade.
const itens: CartItem[] = [item];

// Referência estável entre renders, replicando o `useCallback(..., [items])`
// do CartContext real — isolando o teste ao que `ShippingCalculator` faz com
// o resultado, não a estabilidade do próprio hook do contexto.
const getSpaceUsedEstavel = () => ({ small: 1, large: 0, totalSmallEquivalent: 1 });

vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'pt' }),
}));

vi.mock('@/context/CartContext', () => ({
  useCart: () => ({ items: itens, getSpaceUsed: getSpaceUsedEstavel }),
}));

import ShippingCalculator from './ShippingCalculator';

function CheckoutHarness() {
  const [selectedShipping, setSelectedShipping] = useState<unknown>(null);
  return (
    <>
      <ShippingCalculator destinationCountry="Brasil" onShippingSelect={setSelectedShipping} />
      <output data-testid="selecionado">{JSON.stringify(selectedShipping)}</output>
    </>
  );
}

describe('ShippingCalculator — seleção de frete', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('não entra em loop de render ao escolher uma transportadora', async () => {
    const erroSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<CheckoutHarness />);

    const alvo = (await screen.findByText(/Japan Post EMS/)).closest('div.cursor-pointer') as HTMLElement;
    fireEvent.click(alvo);

    const loopWarnings = erroSpy.mock.calls.filter((c) =>
      String(c[0]).includes('Maximum update depth exceeded')
    );
    expect(loopWarnings).toHaveLength(0);
    expect(screen.getByTestId('selecionado').textContent).toContain('carrier');
  });
});
