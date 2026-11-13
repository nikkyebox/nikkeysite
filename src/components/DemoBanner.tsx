import React from 'react';
import { Info } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface DemoBannerProps {
  /** Texto opcional; usa o padrão de pagamento se ausente. */
  message?: string;
  className?: string;
}

/**
 * Aviso claro de que a loja está em modo demonstração e nenhum
 * pagamento real é processado. Usado no fluxo de checkout/pagamento.
 */
const DemoBanner: React.FC<DemoBannerProps> = ({ message, className = '' }) => {
  const { t } = useLanguage();
  return (
    <div
      className={`flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 rounded-xl px-4 py-3 ${className}`}
      role="status"
    >
      <Info className="w-5 h-5 shrink-0 mt-0.5" />
      <p className="text-sm leading-relaxed">
        {message || (
          <>
            <strong>{t('demo.title')}</strong> {t('demo.body')}
          </>
        )}
      </p>
    </div>
  );
};

export default DemoBanner;
