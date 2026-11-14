import React from 'react';
import { useLanguage } from '@/context/LanguageContext';

/**
 * Fallback do <Suspense> das rotas lazy-loaded.
 *
 * Esqueleto no formato de página (título + grade), não spinner de tela cheia,
 * e só aparece depois de 150ms: chunk em cache resolve antes disso e a troca de
 * página fica sem piscar. Sob reduced-motion, sem shimmer.
 */
const RouteLoader: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div
      className="container mx-auto min-h-[60vh] px-4 py-8 opacity-0 animate-[route-loader-in_150ms_ease-out_150ms_forwards] motion-reduce:animate-none motion-reduce:opacity-100"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{t('route.loading')}</span>
      <div className="mb-6 h-8 w-56 rounded-md bg-muted motion-safe:animate-pulse" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-border">
            <div className="aspect-square bg-muted motion-safe:animate-pulse" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-4/5 rounded bg-muted motion-safe:animate-pulse" />
              <div className="h-4 w-1/3 rounded bg-muted motion-safe:animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RouteLoader;
