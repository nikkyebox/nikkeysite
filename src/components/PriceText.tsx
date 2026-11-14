import React from 'react';
import { cn } from '@/lib/utils';

/**
 * `formatPrice` devolve "R$ 154 (¥ 4,250)". Separa as duas partes só para
 * exibir — o valor principal numa linha e a referência em ¥ embaixo, sem
 * quebrar "(¥ / 4,250)" no meio. Nenhum cálculo de preço acontece aqui.
 */
const splitPrice =(formatted: string): [string, string | null] => {
  const at = formatted.indexOf(' (');
  return at < 0 || !formatted.endsWith(')') ? [formatted, null] : [formatted.slice(0, at), formatted.slice(at + 2, -1)];
};

interface PriceTextProps {
  /** Saída de `formatPrice`. */
  value: string;
  className?: string;
  refClassName?: string;
  align?: 'left' | 'right';
}

const PriceText: React.FC<PriceTextProps> = ({ value, className, refClassName, align = 'left' }) => {
  const [main, ref] = splitPrice(value);
  return (
    <span className={cn('inline-flex flex-col leading-tight', align === 'right' ? 'items-end text-right' : 'items-start')}>
      <span className={cn('whitespace-nowrap tabular-nums', className)}>{main}</span>
      {ref && <span className={cn('whitespace-nowrap text-xs font-normal text-muted-foreground tabular-nums', refClassName)}>{ref}</span>}
    </span>
  );
};

export default PriceText;
