import "@testing-library/jest-dom";

// `matchMedia` não existe no jsdom, e vários componentes leem no primeiro
// render. O guard é para os testes de `api/` e `shared/`, que são lógica pura e
// rodam com `--environment node`: sem ele, este setup global quebra na hora de
// tocar `window` e nenhum teste de servidor chega a executar.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
