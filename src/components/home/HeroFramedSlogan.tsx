import React, { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { cn } from '@/lib/utils';

// Duas linhas, duas palavras cada — lidas como "Beleza Japonesa · Cosméticos
// Selecionados". Cada palavra fica num canto do quadrado que envolve o
// círculo do logo, então nunca cobre o centro (onde a logo está).
const WORDS = [
  { text: 'BELEZA', row: 0, side: 'left' as const },
  { text: 'JAPONESA', row: 0, side: 'right' as const },
  { text: 'COSMÉTICOS', row: 1, side: 'left' as const },
  { text: 'SELECIONADOS', row: 1, side: 'right' as const },
];

interface HeroFramedSloganProps {
  className?: string;
}

/**
 * Slogan que emoldura o círculo do logo em vez de ficar em cima dele: texto
 * reto e grande, uma palavra em cada canto (topo-esquerda, topo-direita,
 * baixo-esquerda, baixo-direita) — os cantos do quadrado ao redor do círculo
 * ficam naturalmente vazios, então o texto nunca cobre a logo.
 *
 * Cada palavra entra deslizando na horizontal: as da esquerda vêm de mais à
 * esquerda ainda, as da direita vêm de mais à direita, e param encostadas
 * na "linha" do círculo — uma de cada vez, em sequência.
 */
const HeroFramedSlogan: React.FC<HeroFramedSloganProps> = ({ className }) => {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const words = gsap.utils.toArray<HTMLElement>('.hero-frame-word');
      words.forEach((el, i) => {
        const fromLeft = el.dataset.side === 'left';
        gsap.fromTo(
          el,
          { opacity: 0, x: fromLeft ? -60 : 60 },
          { opacity: 1, x: 0, duration: 0.7, ease: 'power2.out', delay: 0.35 + i * 0.28 },
        );
      });
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className={cn('relative grid grid-rows-2', className)}>
      {[0, 1].map((row) => (
        <div key={row} className="flex items-center justify-between">
          {WORDS.filter((w) => w.row === row).map((w) => (
            <span
              key={w.text}
              data-side={w.side}
              className={cn(
                'hero-frame-word font-display text-xl font-bold uppercase tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] sm:text-3xl md:text-4xl',
                w.side === 'right' && 'text-right',
              )}
            >
              {w.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

export default HeroFramedSlogan;
