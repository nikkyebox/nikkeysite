import type Lenis from 'lenis';

// Instância ativa do Lenis, guardada aqui para que o SmoothScroll (componente)
// e os botões de rolagem (ex.: Hero) compartilhem o mesmo objeto sem exportar
// função de um arquivo de componente.
let activeLenis: Lenis | null = null;

export const setActiveLenis = (lenis: Lenis | null) => {
  activeLenis = lenis;
};

/** `null` quando o Lenis não está rodando (prefers-reduced-motion). */
export const getLenis = () => activeLenis;
