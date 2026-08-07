import React from 'react';

/**
 * Fallback do <Suspense> das rotas lazy-loaded. Sem isso, a navegação para uma
 * rota ainda não baixada (ex.: primeira visita a /promocao) renderizava uma
 * tela em branco enquanto o chunk JS carregava — antes mesmo do spinner
 * interno da própria página ter chance de montar.
 */
const RouteLoader: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-live="polite">
    <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    <span className="sr-only">Carregando…</span>
  </div>
);

export default RouteLoader;
