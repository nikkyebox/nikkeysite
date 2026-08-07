import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";
import App from "./App.tsx";
import "./index.css";
import { migrateLocalStorage } from "./utils/migrate";
import { isChunkLoadError, recoverFromChunkError } from "./utils/recoverFromChunkError";

migrateLocalStorage();

// Registra o Service Worker. Novo build não recarrega sozinho — pede
// confirmação por toque.
//
// Antes, `onNeedRefresh` chamava `updateSW(true)` direto, que recarrega a
// página via JS sem gesto nenhum do usuário. Isso rodava até em segundo
// plano: a checagem de atualização abaixo roda a cada 60s enquanto o app
// está aberto, então o reload podia disparar no meio da navegação. No PWA
// standalone do iOS, um `location.reload()` fora de um toque do usuário é
// o gatilho clássico do bug do WebKit "pinta a tela em branco até rolar" —
// era exatamente esse sintoma no iPhone. Pedir confirmação resolve as duas
// coisas: o reload não pega o cliente no meio de nada, e quando acontece é
// dentro do gesto de toque no botão, que o WebKit repinta direito.
let avisoMostrado = false;
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (avisoMostrado) return;
    avisoMostrado = true;
    toast('Nova versão disponível', {
      description: 'Toque para atualizar e ver as últimas novidades.',
      duration: Infinity,
      action: { label: 'Atualizar', onClick: () => updateSW(true) },
    });
  },
  onRegisteredSW(_swUrl, registration) {
    // Verifica atualização a cada 60s enquanto o app está aberto
    if (registration) {
      setInterval(() => registration.update().catch(() => {}), 60_000);
    }
  },
});

// Quando o SW carrega um chunk antigo que já não existe no novo deploy,
// o browser lança erro de "dynamically imported module". Limpamos o cache do
// SW e recarregamos de forma limpa (com proteção contra loop infinito).
window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message || String(event.reason || "");
  if (isChunkLoadError(msg)) {
    event.preventDefault();
    void recoverFromChunkError();
  }
});

// Mesmo erro pode chegar como erro de import de <script> (não rejection).
window.addEventListener("error", (event) => {
  const msg = event.message || String((event as ErrorEvent).error || "");
  if (isChunkLoadError(msg)) {
    void recoverFromChunkError();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
