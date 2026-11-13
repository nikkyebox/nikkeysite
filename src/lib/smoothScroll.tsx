import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { setActiveLenis } from '@/lib/lenisInstance';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;


/**
 * SmoothScroll
 *
 * Inicializa o Lenis (smooth scroll) dentro do ticker do GSAP. Respeita
 * `prefers-reduced-motion` — nesses casos o scroll nativo é mantido.
 *
 * Integração Lenis + GSAP:
 *   - gsap.ticker.add(time => lenis.raf(time))  → Lenis roda no ticker do GSAP
 *   - gsap.ticker.lagSmoothing(0)               → Lenis recebe o tempo real de cada frame
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

    setActiveLenis(lenis);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(raf);
      setActiveLenis(null);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
