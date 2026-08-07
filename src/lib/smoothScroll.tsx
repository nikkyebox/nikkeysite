import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// ScrollTrigger é usado pelos componentes cinematográficos (CinematicHeroShelf).
gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let activeLenis: Lenis | null = null;

/**
 * Instância ativa do Lenis, para scroll programático que respeita o smooth
 * scroll (ex.: autoplay do CinematicHeroShelf). `null` quando o Lenis não
 * está rodando (prefers-reduced-motion).
 */
export const getLenis = () => activeLenis;

/**
 * SmoothScroll
 *
 * Inicializa o Lenis (smooth scroll) e sincroniza com o ticker do GSAP, para
 * que o ScrollTrigger permaneça preciso durante o scroll suave. Respeita
 * `prefers-reduced-motion` — nesses casos o scroll nativo é mantido.
 *
 * Integração canônica Lenis + GSAP:
 *   - lenis.on('scroll', ScrollTrigger.update)  → ScrollTrigger lê a cada frame
 *   - gsap.ticker.add(time => lenis.raf(time))  → Lenis roda no ticker do GSAP
 *   - gsap.ticker.lagSmoothing(0)               → sem atrasos no scrub
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    });

    activeLenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // Recalcula posições de pin/trigger depois que fontes e imagens assentam,
    // evitando "saltos" no ponto exato em que o pin começa.
    const refresh = () => ScrollTrigger.refresh();
    const t = window.setTimeout(refresh, 400);
    window.addEventListener('load', refresh);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener('load', refresh);
      gsap.ticker.remove(raf);
      activeLenis = null;
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
