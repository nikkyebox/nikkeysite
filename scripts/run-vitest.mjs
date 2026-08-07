// Lançador do Vitest com a raiz do projeto em forma canônica.
//
// Por que isto existe (Windows):
//   Chamado de `c:\japanexpress\temu_shop` (drive minúsculo), o worker do
//   Vitest carrega `@vitest/runner` como `file:///C:/...` enquanto o module
//   runner do Vite carrega o MESMO arquivo como `file:///c:/...`. Para o ESM
//   são dois módulos diferentes, então o `runner` que o worker inicializa não é
//   o que o arquivo de teste enxerga. Resultado: todo `describe()` estoura em
//   `runner.config` e a suíte INTEIRA morre com
//   "Cannot read properties of undefined (reading 'config')" — 35 arquivos, 0
//   testes, incluindo um `expect(true).toBe(true)`. O erro não aponta para
//   nada de real, o que torna isso caríssimo de diagnosticar.
//
//   Quem decide a grafia é o CWD do processo, e ele precisa estar certo ANTES
//   de o Vitest subir: normalizar dentro de `vitest.config.ts` (com `root` ou
//   `process.chdir`) já é tarde demais — testado, não resolve.
//
// Repassa os argumentos e o código de saída, então `npm test -- --watch`,
// `-t <nome>` e afins continuam funcionando como antes.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');
const canonica = /^[a-z]:/.test(raiz) ? raiz[0].toUpperCase() + raiz.slice(1) : raiz;

const filho = spawn(
  process.execPath,
  [path.join(canonica, 'node_modules', 'vitest', 'vitest.mjs'), ...process.argv.slice(2)],
  { cwd: canonica, stdio: 'inherit' },
);

filho.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
