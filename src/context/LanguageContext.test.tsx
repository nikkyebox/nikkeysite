import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, useLanguage } from './LanguageContext';

function Probe() {
  const { language, selectedCountry } = useLanguage();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="country">{selectedCountry}</span>
    </div>
  );
}

function fireStorage(key: string, newValue: string | null) {
  window.dispatchEvent(
    new StorageEvent('storage', { key, newValue, storageArea: window.localStorage }),
  );
}

describe('LanguageContext travado em pt-BR / Brasil', () => {
  beforeEach(() => {
    localStorage.clear();
    // Evita chamada de rede real (cotação do dia / geolocalização) durante o teste.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled in test')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Seletor de idioma e de país desativados (ver src/config/featureFlags.ts).
  // A loja abre em pt-BR e em Brasil (preço em R$), mesmo com um país
  // japonês salvo no storage por visitas antigas.
  it('ignora país japonês salvo no storage e mantém Brasil', () => {
    localStorage.setItem('sakura_selected_country', 'Japão');

    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('language').textContent).toBe('pt');
    expect(screen.getByTestId('country').textContent).toBe('Brasil');
  });

  it('ignora alterações de idioma e de país vindas de outra aba', () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    fireStorage('preferred-language', 'ja');
    fireStorage('sakura_selected_country', 'Japão');

    expect(screen.getByTestId('language').textContent).toBe('pt');
    expect(screen.getByTestId('country').textContent).toBe('Brasil');
  });
});
