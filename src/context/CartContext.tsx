import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { CartItem, Product } from '@/types';
import { safeStorage } from '@/utils/storage';
import { effectiveYen } from '@/utils/pricing';
import { trackAddToCart } from '@/lib/analytics';
import { useProducts } from '@/context/ProductsContext';

const CART_STORAGE_KEY = 'sakura_cart';

const loadCart = (): CartItem[] => {
  try {
    const raw = safeStorage.getItem(CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.filter((i: CartItem) => !i.freeGift); // strip stale gift items on load
  } catch {
    return [];
  }
};

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, size: string, quantity?: number, variantLabel?: string) => void;
  removeFromCart: (productId: string, size: string) => void;
  updateQuantity: (productId: string, size: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  getSpaceUsed: () => { small: number; large: number; totalSmallEquivalent: number };
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [rawItems, setRawItems] = useState<CartItem[]>(loadCart);
  const { products } = useProducts();

  // Reage a armar/desarmar o resgate promocional (Cart.tsx dispara o evento) —
  // safeStorage não é reativo, então usamos um tick para re-derivar preço/brinde.
  const [promoTick, setPromoTick] = useState(0);
  useEffect(() => {
    const bump = () => setPromoTick((t) => t + 1);
    window.addEventListener('promo-pricing-changed', bump);
    return () => window.removeEventListener('promo-pricing-changed', bump);
  }, []);

  // Persist only non-gift items to localStorage
  useEffect(() => {
    safeStorage.setItem(CART_STORAGE_KEY, JSON.stringify(rawItems));
  }, [rawItems]);

  // Gift items are fully derived — no state, no loops
  const giftItems = useMemo<CartItem[]>(() => {
    if (!products.length) return [];
    const totalYen = rawItems.reduce((s, i) => s + effectiveYen(i.product, i.size) * i.quantity, 0);
    const gifts: CartItem[] = [];
    const addedGiftIds = new Set<string>();
    for (const item of rawItems) {
      const pg = item.product.promoGift;
      if (!pg || pg.buyQuantity <= 0 || !pg.giftProductId) continue;
      if (item.quantity < pg.buyQuantity) continue;
      if (pg.minOrderValueYen && totalYen < pg.minOrderValueYen) continue;
      if (addedGiftIds.has(pg.giftProductId)) continue;
      const giftProduct = products.find(p => p.id === pg.giftProductId);
      if (!giftProduct) continue;
      addedGiftIds.add(pg.giftProductId);
      gifts.push({
        product: giftProduct,
        size: 'small',
        quantity: 1,
        variantLabel: 'Presente 🎁',
        freeGift: true,
        freeGiftFromProductId: item.product.id,
      });
    }
    // Brinde de campanha promocional (BOGO via link de e-mail ?promo=CODE):
    // quando o produto qualificante está no carrinho, adiciona o presente grátis.
    try {
      const raw = safeStorage.getItem('pending_promo_gift');
      if (raw) {
        const g = JSON.parse(raw);
        if (g && g.productId && rawItems.some(i => i.product.id === g.productId)) {
          const giftId = g.giftProductId || g.productId;
          if (!addedGiftIds.has(giftId)) {
            const giftProduct = products.find(p => p.id === giftId);
            if (giftProduct) {
              addedGiftIds.add(giftId);
              gifts.push({
                product: giftProduct,
                size: 'small',
                quantity: 1,
                variantLabel: 'Presente da promoção 🎁',
                freeGift: true,
                freeGiftFromProductId: g.productId,
              });
            }
          }
        }
      }
    } catch { /* JSON inválido — ignora */ }
    return gifts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawItems, products, promoTick]);

  // Campanha promocional com "manter desconto inicial" DESMARCADO: o produto
  // qualificante volta ao preço ORIGINAL (discountPercent zerado) enquanto o
  // resgate está armado — evita empilhar o desconto da página com o da oferta.
  const adjustedItems = useMemo<CartItem[]>(() => {
    try {
      const raw = safeStorage.getItem('promo_full_price');
      if (!raw) return rawItems;
      const flag = JSON.parse(raw);
      if (!flag || !flag.productId) return rawItems;
      return rawItems.map((i) =>
        i.product.id === flag.productId && (i.product.discountPercent || 0) > 0
          ? { ...i, product: { ...i.product, discountPercent: 0 } }
          : i
      );
    } catch {
      return rawItems;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawItems, promoTick]);

  // All items exposed to consumers = regular + auto-gifts
  const items = useMemo(() => [...adjustedItems, ...giftItems], [adjustedItems, giftItems]);

  const addToCart = useCallback((product: Product, size: string, quantity = 1, variantLabel?: string) => {
    setRawItems(prev => {
      const maxQty = product.stock && !product.stock.unlimited ? product.stock.quantity : Infinity;
      const existingIndex = prev.findIndex(
        item => item.product.id === product.id && item.size === size
      );
      if (existingIndex >= 0) {
        const newQty = Math.min(prev[existingIndex].quantity + quantity, maxQty);
        if (newQty === prev[existingIndex].quantity) return prev;
        const updated = [...prev];
        updated[existingIndex] = { ...updated[existingIndex], quantity: newQty };
        return updated;
      }
      const newQty = Math.min(quantity, maxQty);
      if (newQty <= 0) return prev;
      return [...prev, { product, size, quantity: newQty, variantLabel }];
    });
    // Fora do updater de estado (que o React pode invocar mais de uma vez) —
    // dispara o evento uma única vez por chamada de addToCart.
    trackAddToCart({
      item_id: product.id,
      item_name: product.name,
      item_category: product.category,
      quantity,
      price: effectiveYen(product, size),
    }, 'JPY');
  }, []);

  const removeFromCart = useCallback((productId: string, size: string) => {
    setRawItems(prev => prev.filter(
      item => !(item.product.id === productId && item.size === size)
    ));
  }, []);

  const updateQuantity = useCallback((productId: string, size: string, quantity: number) => {
    if (quantity <= 0) {
      setRawItems(prev => prev.filter(
        item => !(item.product.id === productId && item.size === size)
      ));
      return;
    }
    setRawItems(prev => prev.map(item => {
      if (item.product.id !== productId || item.size !== size) return item;
      const maxQty = item.product.stock && !item.product.stock.unlimited ? item.product.stock.quantity : Infinity;
      return { ...item, quantity: Math.min(quantity, maxQty) };
    }));
  }, []);

  const clearCart = useCallback(() => {
    setRawItems([]);
  }, []);

  // Limpa o carrinho quando o usuário faz logout (evento disparado pelo UserContext)
  useEffect(() => {
    const onLogout = () => setRawItems([]);
    window.addEventListener('japan-express:logout', onLogout);
    return () => window.removeEventListener('japan-express:logout', onLogout);
  }, []);

  const totalItems = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  // Price excludes free gifts (usa itens ajustados p/ refletir o preço original da promo)
  const totalPrice = useMemo(
    () => adjustedItems.reduce((sum, item) => sum + effectiveYen(item.product, item.size) * item.quantity, 0),
    [adjustedItems]
  );

  const getSpaceUsed = useCallback(() => {
    let small = 0;
    let large = 0;
    items.forEach(item => {
      if (item.size === 'small') small += item.quantity;
      else large += item.quantity;
    });
    return { small, large, totalSmallEquivalent: small + large * 2 };
  }, [items]);

  return (
    <CartContext.Provider value={{
      items,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      totalItems,
      totalPrice,
      getSpaceUsed
    }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
