import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Product } from '@/types';
import { productService } from '@/services/productService';

const isDev = import.meta.env.DEV;
const devWarn = isDev ? console.warn.bind(console) : () => {};

interface ProductsContextValue {
  products: Product[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const ProductsContext = createContext<ProductsContextValue>({
  products: [],
  loading: true,
  refresh: async () => {},
});

export const ProductsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // refresh() sempre vai ao Firestore (ignora cache) — usado por botões manuais e após salvar
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const merged = await productService.getMerged(true);
      setProducts(merged);
    } catch (e) {
      devWarn('ProductsContext refresh falhou:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carregamento inicial: tenta cache primeiro (instantâneo).
  // Se retornar vazio (auth Firebase ainda não pronta), tenta de novo em 3s.
  useEffect(() => {
    let cancelled = false;

    const load = async (attempt = 0) => {
      if (attempt === 0) setLoading(true);
      try {
        const merged = await productService.getMerged(attempt > 0);
        if (cancelled) return;
        if (merged.length > 0) {
          setProducts(merged);
          setLoading(false);
        } else if (attempt === 0) {
          // Vazio na 1ª tentativa: tenta de novo rápido. Eram 3s fixos aqui, e
          // no iPhone essa espera era paga quase sempre — a leitura do Firestore
          // no WebKit costuma falhar na primeira tentativa, então o cliente
          // encarava 3s de tela vazia antes mesmo da segunda ida à rede.
          // Produto é leitura pública: não há auth a esperar.
          setTimeout(() => { if (!cancelled) load(1); }, 600);
        } else {
          setLoading(false);
        }
      } catch {
        if (cancelled) return;
        if (attempt === 0) {
          // Mesma razão do ramo acima: sem espera longa às cegas.
          setTimeout(() => { if (!cancelled) load(1); }, 600);
        } else {
          setLoading(false);
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <ProductsContext.Provider value={{ products, loading, refresh }}>
      {children}
    </ProductsContext.Provider>
  );
};

export const useProducts = () => useContext(ProductsContext);
