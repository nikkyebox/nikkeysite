import React, { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { cn } from '@/lib/utils';

// Novo slogan — lido nos quatro cantos como "Curadoria Japonesa · Entrega
// Excepcional". Cada palavra precisa caber isolada num canto sem esbarrar
// no círculo do logo.
const WORDS = [
  { text: 'CURADORIA', corner: 'top-left' as const },
  { text: 'JAPONESA', corner: 'top-right' as const },
  { text: 'ENTREGA', corner: 'bottom-left' as const },
  { text: 'EXCEPCIONAL', corner: 'bottom-right' as const },
];

// A intro do vídeo do hero leva ~11s até o círculo terminar de se desenhar —
// as palavras só começam a aparecer depois disso, para não competir com essa
// animação. 1s de intervalo entre cada palavra, como pedido.
const START_DELAY_S = 11;
const WORD_INTERVAL_S = 1;

const CORNER_CLASSES: Record<(typeof WORDS)[number]['corner'], string> = {
  'top-left': 'left-[4%] top-[12%] sm:left-[6%] sm:top-[14%] text-left',
  'top-right': 'right-[4%] top-[12%] sm:right-[6%] sm:top-[14%] text-right',
  'bottom-left': 'left-[4%] top-[70%] sm:left-[6%] sm:top-[68%] text-left',
  'bottom-right': 'right-[4%] top-[70%] sm:right-[6%] sm:top-[68%] text-right',
};

interface HeroFramedSloganProps {
  className?: string;
}

/**
 * Slogan que emoldura o círculo do logo: cada palavra fica presa a uma borda
 * da tela (não a uma caixa do tamanho do círculo), então nunca esbarra nele
 * independente do tamanho exato do círculo do vídeo. Aparecem uma a uma —
 * esquerda e direita alternando — só depois que a animação do círculo do
 * vídeo termina de se formar.
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
          {
            opacity: 1,
            x: 0,
            duration: 0.7,
            ease: 'power2.out',
            delay: START_DELAY_S + i * WORD_INTERVAL_S,
          },
        );
      });
    },
    { scope: rootRef },
  );

  return (
    <div
      ref={rootRef}
      className={cn('pointer-events-none absolute inset-0', className)}
      role="img"
      aria-label="Curadoria Japonesa · Entrega Excepcional"
    >
      {WORDS.map((w) => {
        const side = w.corner.endsWith('left') ? 'left' : 'right';
        return (
          <span
            key={w.text}
            data-side={side}
            className={cn(
              'hero-frame-word absolute font-brand text-2xl font-bold uppercase tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)] sm:text-3xl md:text-4xl lg:text-5xl',
              CORNER_CLASSES[w.corner],
            )}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

export default HeroFramedSlogan;
