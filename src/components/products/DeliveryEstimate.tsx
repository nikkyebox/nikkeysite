import React from 'react';
import { Truck } from 'lucide-react';
import { getDeliveryEstimate, formatDeliveryRange } from '@/utils/deliveryEstimate';

interface DeliveryEstimateBadgeProps {
  country: string;
  className?: string;
}

/**
 * Selo de prazo estimado de entrega exibido na página do produto, logo acima
 * do botão de compra. Responde ao país de destino selecionado pelo cliente.
 */
const DeliveryEstimateBadge: React.FC<DeliveryEstimateBadgeProps> = ({ country, className = '' }) => {
  const est = getDeliveryEstimate(country);

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-3 py-2 ${className}`}
    >
      <Truck className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
      <p className="text-xs sm:text-sm text-green-800 dark:text-green-300 leading-tight">
        {est.isDomestic ? (
          <>Entrega no Japão em <strong className="font-bold">{formatDeliveryRange(est)}</strong></>
        ) : (
          <>
            Chega em <strong className="font-bold">{formatDeliveryRange(est)}</strong> em {country || 'seu país'}
          </>
        )}
        <span className="block text-[10px] text-green-700/70 dark:text-green-400/70 font-medium">
          Prazo estimado após confirmação do pagamento
        </span>
      </p>
    </div>
  );
};

export default DeliveryEstimateBadge;
