import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useCart } from '@/context/CartContext';
import { useUser } from '@/context/UserContext';
import { cartAbandonmentService } from '@/services/cartAbandonmentService';

/**
 * Rastreador invisível: observa o carrinho e salva periodicamente um snapshot
 * para recuperação. Quando o carrinho esvazia (checkout/conversão), limpa o
 * registro. Roda em segundo plano — não renderiza nada na tela.
 */
const CartAbandonmentTracker: React.FC = () => {
  const { items, totalPrice } = useCart();
  const { user } = useUser();
  const location = useLocation();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // No checkout/order-review não rastreia (usuário está convertendo).
    const isConverting = ['/checkout', '/order-review', '/order-confirmation'].some((p) =>
      location.pathname.startsWith(p),
    );
    if (isConverting) return;

    const save = () => cartAbandonmentService.track(user?.id || null, items, totalPrice);
    // Salva imediatamente e depois a cada 60s enquanto houver itens.
    save();
    timerRef.current = setInterval(save, 60000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [items, totalPrice, user?.id, location.pathname]);

  // Carrinho vazio = conversão ou limpeza → remove o registro de abandono.
  useEffect(() => {
    if (items.length === 0) {
      cartAbandonmentService.clear(user?.id || null);
    }
  }, [items.length, user?.id]);

  return null;
};

export default CartAbandonmentTracker;
