import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  rangeStart?: number;
  rangeEnd?: number;
  total?: number;
  className?: string;
}

/**
 * Controle de paginação simples e acessível. Mostra até 5 botões de
 * página com reticências quando há muitas páginas.
 */
const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  onPageChange,
  rangeStart,
  rangeEnd,
  total,
  className = '',
}) => {
  if (totalPages <= 1) return null;

  // Calcula as páginas visíveis (janela de 5 centrada na atual)
  const pages: number[] = [];
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  const btnBase =
    'min-w-9 h-9 px-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center';

  return (
    <nav className={`flex flex-col items-center gap-3 ${className}`} aria-label="Paginação">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={`${btnBase} border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary`}
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {start > 1 && (
          <>
            <button onClick={() => onPageChange(1)} className={`${btnBase} border border-border hover:bg-secondary`}>1</button>
            {start > 2 && <span className="px-1 text-muted-foreground">…</span>}
          </>
        )}

        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={`${btnBase} ${
              p === page
                ? 'bg-primary text-primary-foreground'
                : 'border border-border hover:bg-secondary'
            }`}
          >
            {p}
          </button>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="px-1 text-muted-foreground">…</span>}
            <button onClick={() => onPageChange(totalPages)} className={`${btnBase} border border-border hover:bg-secondary`}>
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={`${btnBase} border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary`}
          aria-label="Próxima página"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {total !== undefined && rangeStart !== undefined && rangeEnd !== undefined && (
        <p className="text-xs text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total}
        </p>
      )}
    </nav>
  );
};

export default Pagination;
