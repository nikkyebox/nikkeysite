import { useMemo, useState, useEffect } from 'react';

interface PaginationResult<T> {
  page: number;
  totalPages: number;
  pageItems: T[];
  setPage: (p: number) => void;
  next: () => void;
  prev: () => void;
  canPrev: boolean;
  canNext: boolean;
  total: number;
  rangeStart: number;
  rangeEnd: number;
}

/**
 * Pagina um array no cliente. Reseta para a página 1 quando o tamanho
 * da lista muda (ex.: filtro aplicado).
 */
export function usePagination<T>(items: T[], pageSize = 12): PaginationResult<T> {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Garante que a página atual é válida após mudanças na lista
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return {
    page,
    totalPages,
    pageItems,
    setPage: (p: number) => setPage(Math.min(Math.max(1, p), totalPages)),
    next: () => setPage((p) => Math.min(p + 1, totalPages)),
    prev: () => setPage((p) => Math.max(p - 1, 1)),
    canPrev: page > 1,
    canNext: page < totalPages,
    total,
    rangeStart,
    rangeEnd,
  };
}
