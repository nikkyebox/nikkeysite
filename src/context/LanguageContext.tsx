import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { translations, Language } from '@/data/translations';
import { safeStorage } from '@/utils/storage';
import { loadFxRates, getRates } from '@/services/fxService';
import { WORLD_COUNTRIES } from '@/data/worldCountries';

// Nome do país (ver lista completa em src/data/worldCountries.ts).
// String aberta porque agora há 40+ países — a config vem da tabela central.
export type CountryType = string;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  selectedCountry: CountryType;
  setSelectedCountry: (country: CountryType) => void;
  fxRates: { BRL: number; EUR: number; USD: number };
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
};

// ISO code (upper) → config do país. Construído a partir da tabela central.
const ISO_TO_CONFIG: Record<string, import('@/data/worldCountries').CountryConfig> =
  Object.fromEntries(WORLD_COUNTRIES.map(c => [c.iso.toUpperCase(), c]));

interface LanguageProviderProps { children: ReactNode; }

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = safeStorage.getItem('preferred-language');
    return (stored as Language) || 'pt';
  });

  const [selectedCountry, setSelectedCountryState] = useState<CountryType>(() => {
    const stored = safeStorage.getItem('sakura_selected_country');
    return (stored as CountryType) || 'Brasil';
  });

  // Cotação cambial do dia (¥→R$/€/$)
  const [fxRates, setFxRates] = useState(getRates());
  useEffect(() => { loadFxRates().then(setFxRates); }, []);

  // Auto-detect do PAÍS por IP — só na primeira visita (sem país salvo).
  //
  // O idioma NÃO é mais derivado do IP. A loja vende produto japonês para
  // brasileiros, e boa parte deles mora no Japão: derivar `ja` do IP abria a
  // loja em japonês justamente para quem não lê japonês — inclusive para a
  // dona da loja, todo dia. País continua vindo do IP porque manda em preço e
  // frete (¥ no Japão, R$ no Brasil), que é geografia de verdade, não de
  // leitura. Quem quiser japonês troca no seletor, e a escolha fica salva.
  useEffect(() => {
    const hasCountry = safeStorage.getItem('sakura_selected_country');
    if (hasCountry) return; // já tem país salvo

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);

    // Usa o endpoint próprio (`api/geo.js`), que lê os headers de geolocalização
    // da Vercel. A chamada direta ao ipapi.co era bloqueada pelo CSP em TODA
    // visita — `connect-src` não o autoriza — então a detecção de país nunca
    // funcionava em produção e o visitante sempre caía no país padrão.
    // Mesma origem: sem CSP, sem terceiro, e o endpoint já existia para isto.
    fetch('/api/geo', { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then((data: { countryCode?: string } | null) => {
        if (!data?.countryCode) return;
        const code = data.countryCode.toUpperCase();

        if (!hasCountry) {
          const country = ISO_TO_CONFIG[code]?.name;
          if (country) {
            setSelectedCountryState(country);
            safeStorage.setItem('sakura_selected_country', country);
          }
        }
      })
      .catch(() => { /* falha silenciosa — mantém defaults */ })
      .finally(() => clearTimeout(timer));

    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  // Sincroniza idioma/país entre abas abertas: o evento `storage` só dispara
  // nas OUTRAS abas (nunca na que fez a escrita), então não há risco de loop.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === 'preferred-language') {
        const next = (event.newValue as Language) || 'pt';
        setLanguageState(next);
      } else if (event.key === 'sakura_selected_country') {
        const next = event.newValue || 'Brasil';
        setSelectedCountryState(next);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    safeStorage.setItem('preferred-language', lang);
    // Marca que a escolha foi do usuário. `migrateLocalStorage` usa a marca
    // para distinguir escolha real do idioma que a detecção por IP gravava
    // antes — e apagar só o que era automático.
    safeStorage.setItem('preferred-language-source', 'user');
  }, []);

  const setSelectedCountry = useCallback((country: CountryType) => {
    setSelectedCountryState(country);
    safeStorage.setItem('sakura_selected_country', country);
  }, []);

  const t = useCallback((key: string): string => {
    const suffix = selectedCountry === 'Japão' ? 'japan' : 'brazil';
    const dict = translations[language] || translations['pt'];
    const suffixedKey = `${key}.${suffix}`;
    return dict[suffixedKey] || dict[key] || translations['pt'][suffixedKey] || translations['pt'][key] || key;
  }, [language, selectedCountry]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, selectedCountry, setSelectedCountry, fxRates }}>
      {children}
    </LanguageContext.Provider>
  );
};
