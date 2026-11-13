import React from 'react';
import { Truck } from 'lucide-react';
import { getDeliveryEstimate } from '@/utils/deliveryEstimate';
import { useLanguage } from '@/context/LanguageContext';

interface DeliveryEstimateBadgeProps {
  country: string;
  className?: string;
}

/**
 * Selo de prazo estimado de entrega exibido na página do produto, logo acima
 * do botão de compra. Responde ao país de destino selecionado pelo cliente.
 */
const DeliveryEstimateBadge: React.FC<DeliveryEstimateBadgeProps> = ({ country, className = '' }) => {
  const { t } = useLanguage();
  const est = getDeliveryEstimate(country);
  const rangeText = est.minDays === est.maxDays
    ? t('delivery.days').replace('{min}', String(est.minDays))
    : t('delivery.daysRange').replace('{min}', String(est.minDays)).replace('{max}', String(est.maxDays));

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-3 py-2 ${className}`}
    >
      <Truck className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
      <p className="text-xs sm:text-sm text-green-800 dark:text-green-300 leading-tight">
        {est.isDomestic ? (
          <>{t('delivery.domestic')} <strong className="font-bold">{rangeText}</strong></>
        ) : (
          <>
            {t('delivery.intlArrives')} <strong className="font-bold">{rangeText}</strong> {t('delivery.intlCountry').replace('{country}', country || t('delivery.yourCountry'))}
          </>
        )}
        <span className="block text-[10px] text-green-700/70 dark:text-green-400/70 font-medium">
          {t('delivery.afterPayment')}
        </span>
      </p>
    </div>
  );
};

export default DeliveryEstimateBadge;
