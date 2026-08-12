import React, { useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';

// Frase gira em volta do círculo — repetida para fechar a volta inteira.
// "•" marca a costura onde a repetição se encontra.
const RING_PHRASE = ['ORIGINAL', 'DO', 'JAPÃO', '•', 'BELEZA', 'AUTÊNTICA', '•'];
const WORDS = [...RING_PHRASE, ...RING_PHRASE];

interface HeroRingSloganProps {
  size?: number;
  className?: string;
}

/**
 * Slogan circular: as palavras seguem o contorno do anel (SVG <textPath>,
 * caminho circular que começa no topo e vai no sentido horário) em vez de
 * ficarem em cima do centro do logo. Cada palavra entra alternando o lado —
 * pares vêm "da esquerda", ímpares "da direita" — girando em torno do centro
 * do próprio círculo (svgOrigin), não do próprio texto.
 */
const HeroRingSlogan: React.FC<HeroRingSloganProps> = ({ size = 320, className }) => {
  const groupRef = useRef<SVGGElement>(null);
  const r = size / 2 - 22;
  const cx = size / 2;
  const cy = size / 2;
  // Truque para path circular fechado: arco "quase 360°" (o ponto final fica
  // 0.01 antes do inicial) — textPath precisa de um path aberto, não de um
  // <circle>, para posicionar texto ao longo dele.
  const pathD = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`;
  const pathId = useRef(`hero-ring-path-${Math.random().toString(36).slice(2)}`).current;

  useGSAP(
    () => {
      const texts = gsap.utils.toArray<SVGTextElement>('.hero-ring-word');
      texts.forEach((el, i) => {
        const fromLeft = i % 2 === 0;
        gsap.fromTo(
          el,
          { opacity: 0, rotate: fromLeft ? -34 : 34, svgOrigin: `${cx} ${cy}` },
          {
            opacity: 1,
            rotate: 0,
            svgOrigin: `${cx} ${cy}`,
            duration: 0.65,
            ease: 'power2.out',
            delay: 0.3 + i * 0.09,
          },
        );
      });
    },
    { scope: groupRef, dependencies: [cx, cy] },
  );

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Original do Japão · Beleza Autêntica"
    >
      <defs>
        <path id={pathId} d={pathD} fill="none" />
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
      <g ref={groupRef}>
        {WORDS.map((word, i) => (
          <text
            key={`${word}-${i}`}
            className="hero-ring-word font-display"
            fill="#ffffff"
            fontSize={13}
            fontWeight={700}
            letterSpacing={2}
            style={{ filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))' }}
          >
            <textPath href={`#${pathId}`} startOffset={`${(i / WORDS.length) * 100}%`} textAnchor="middle">
              {word}
            </textPath>
          </text>
        ))}
      </g>
    </svg>
  );
};

export default HeroRingSlogan;
