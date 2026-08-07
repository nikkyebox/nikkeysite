import { useEffect, useRef, useState } from 'react';

/** Detecta a preferência do sistema por menos movimento (acessibilidade). */
function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Retorna um ref e se o elemento já entrou na viewport (uma vez só, não reverte). */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(rootMargin = '0px 0px -80px 0px') {
  const ref = useRef<T>(null);
  // Se o usuário pede menos movimento, tudo já nasce "visível" (sem animar).
  const [visible, setVisible] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion()) { setVisible(true); return; }
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, visible };
}
