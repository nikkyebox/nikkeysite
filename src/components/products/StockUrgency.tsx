import React from 'react';
import { Flame } from 'lucide-react';
import { Product } from '@/types';

interface StockUrgencyProps {
  stock?: Product['stock'];
  className?: string;
}

/** Estoque <= esse número dispara o gatilho de urgência. */
const LOW_STOCK_THRESHOLD = 10;

/**
 * Gatilho de urgência por estoque: mostra "Últimas X unidades!" quando o
 * estoque está baixo, incentivando a compra imediata. Some quando o produto
 * tem estoque ilimitado ou abundante (acima do limite).
 */
const StockUrgency: React.FC<StockUrgencyProps> = ({ stock, className = '' }) => {
  const hasLowStock =
    !!stock && !stock.unlimited && stock.quantity > 0 && stock.quantity <= LOW_STOCK_THRESHOLD;
  if (!hasLowStock) return null;

  const qty = stock!.quantity;
  const isLastOne = qty === 1;

  return (
    <div
      className={`flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-2 shadow-sm ${className}`}
    >
      <Flame className="w-4 h-4 shrink-0" />
      <p className="text-xs sm:text-sm font-bold leading-tight">
        {isLastOne
          ? '🔥 Última unidade — pode acabar a qualquer momento!'
          : `🔥 Últimas ${qty} unidades em estoque!`}
      </p>
    </div>
  );
};

export default StockUrgency;
