import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// Rode SEMPRE por `npm test` / `npm run test:watch`.
//
// Os scripts passam por `scripts/run-vitest.mjs`, que corrige a caixa da letra
// do drive no Windows. Chamar `npx vitest` direto de um caminho com drive
// minúsculo (`c:\...`) derruba a suíte INTEIRA — 35 arquivos, 0 testes, com
// "Cannot read properties of undefined (reading 'config')" e um stack que não
// aponta para nada de real. O porquê está comentado no lançador.
//
// Vale também para plugin de editor: aponte-o para o lançador, não para o
// binário do vitest. Ajustar `root` ou `process.chdir` AQUI não resolve — o CWD
// já foi lido quando este arquivo é avaliado (testado).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // `shared/` também entra: é o código que api/ e src/ dividem (preço, pontos,
    // texto de promoção), justamente onde uma divergência entre os dois lados
    // passa despercebida.
    include: ["src/**/*.{test,spec}.{ts,tsx}", "api/**/*.{test,spec}.js", "shared/**/*.{test,spec}.js"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
