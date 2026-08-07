// Tenta Cloudinary primeiro. Se falhar por limite de banda/quota (4xx), faz
// fallback para Firebase Storage. Se AMBOS falharem, LANÇA — nunca grava a
// imagem dentro do documento do Firestore.
import { storage } from '@/config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const CLOUD_NAME = 'dw4j4tpub';
const UPLOAD_PRESET = 'japanexpress';
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
const UPLOAD_URL_VIDEO = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`;

// Data URL → Blob sem passar pelo `fetch`.
//
// O Safari falha com "load failed" ao dar `fetch()` numa data URL grande, e a
// foto do admin chega aqui com 2560px de canvas — uns 2 MB de base64, bem
// dentro da faixa em que o WebKit desiste de alocar. O sintoma era o admin do
// iPhone não conseguir subir imagem de produto novo nenhuma, com a mensagem
// "leitura da imagem falhou (load failed)" e MAIS NADA: sem blob, o bloco de
// upload inteiro é pulado, então nem o Cloudinary nem o Firebase Storage
// chegavam a ser tentados — parecia falha de CDN sem nunca ter havido request.
//
// Decodificar na mão é síncrono, não passa pela pilha de rede e não depende de
// alocar a URL inteira num loader. `fetch` continua servindo as URLs http, que
// é o que `urlToCompressedDataURL` devolve quando o CORS barra o canvas.
function dataUrlToBlob(dataUrl: string): Blob {
  const virgula = dataUrl.indexOf(',');
  if (virgula < 0) throw new Error('data URL malformada (sem vírgula)');

  const cabecalho = dataUrl.slice('data:'.length, virgula);
  const mime = cabecalho.split(';')[0] || 'application/octet-stream';
  const corpo = dataUrl.slice(virgula + 1);

  // `canvas.toDataURL()` devolve `data:,` quando o navegador não consegue
  // exportar — no iPhone acontece com foto grande demais para o limite de área
  // do canvas. Sem isto o upload seguiria com 0 byte e o Cloudinary recusaria
  // com um 400 genérico, escondendo a causa real.
  if (!corpo) throw new Error('o navegador não conseguiu exportar a imagem (arquivo muito grande?)');

  if (!/;base64/i.test(cabecalho)) {
    return new Blob([decodeURIComponent(corpo)], { type: mime });
  }

  const binario = atob(corpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadToFirebase(blob: Blob, folder: string): Promise<string> {
  if (!storage) throw new Error('Firebase Storage indisponível.');
  const ext = blob.type.includes('webp') ? 'webp' : blob.type.includes('png') ? 'png' : 'jpg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: blob.type });
  return getDownloadURL(storageRef);
}

async function uploadVideoToFirebase(blob: Blob, folder: string): Promise<string> {
  if (!storage) throw new Error('Firebase Storage indisponível.');
  const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('quicktime') ? 'mov' : 'mp4';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: blob.type });
  return getDownloadURL(storageRef);
}


// ─── Entrega ───────────────────────────────────────────────────────────────
// Perfil único de entrega para toda imagem do site.
//
//   f_auto   → AVIF/WebP conforme o browser, melhor que WebP fixo.
//   c_limit  → NUNCA faz upscale. Sem isso, `w_1200` sobre uma master de 900px
//              devolve borrão interpolado.
//   q_95     → ver abaixo.
//
// Sobre o `q_95`: antes era `q_auto:best`, escolhido medindo o PESO do
// resultado. O que a medição não considerou foi a natureza das masters — quase
// todas já são JPEG lossy de baixa resolução, herdadas do fallback base64 que
// gravava com `compressToDataUrl(dataUrl, 900, 0.82)`. Re-comprimir um arquivo
// já comprimido não remove redundância, remove detalhe.
//
// Medido em 26/07/2026 sobre duas masters reais:
//
//   master intocada        18 KB (600x376)    70 KB (900x714)
//   q_auto:best             8 KB  (-56%)      29 KB  (-59%)   <- borrava
//   q_95                   13 KB  (-28%)      49 KB  (-30%)   <- escolhido
//   q_100                  49 KB (+172%)     218 KB (+211%)   <- so preserva
//                                                                o artefato
//
// `q_95` entrega perto da master e ainda ganha do JPEG original em bytes,
// porque AVIF/WebP comprimem melhor. `q_100` explode sem recuperar detalhe que
// a master nao tem.
const DELIVERY = 'f_auto,q_95,c_limit';

/**
 * Reescreve qualquer URL Cloudinary para o perfil de entrega de alta qualidade.
 * Aceita URLs legadas (`/upload/f_webp,q_auto/v123/…`) e limpas (`/upload/v123/…`).
 * `width` é um teto, nunca um alvo. URLs não-Cloudinary voltam intactas.
 */
export function cdnImage(url?: string, width?: number): string {
  if (!url || !url.includes('res.cloudinary.com')) return url ?? '';
  const marker = '/upload/';
  const at = url.indexOf(marker);
  if (at === -1) return url;

  const tail = url.slice(at + marker.length);
  // O asset começa no segmento de versão; o que vier antes é transformação
  // antiga e é descartado. Sem versão, a cauda inteira já é o asset.
  const asset = tail.match(/^(?:.+?\/)?(v\d+\/.*)$/)?.[1] ?? tail;

  return `${url.slice(0, at + marker.length)}${DELIVERY}${width ? `,w_${width}` : ''}/${asset}`;
}

/**
 * Aponta para a master intocada, sem nenhuma transformação de entrega.
 * Use sempre que for RE-ENVIAR uma imagem: baixar a versão entregue e subir de
 * volta cria perda de geração acumulada a cada migração.
 */
export function cdnOriginal(url?: string): string {
  if (!url || !url.includes('res.cloudinary.com')) return url ?? '';
  const marker = '/upload/';
  const at = url.indexOf(marker);
  if (at === -1) return url;

  const tail = url.slice(at + marker.length);
  const asset = tail.match(/^(?:.+?\/)?(v\d+\/.*)$/)?.[1] ?? tail;
  return `${url.slice(0, at + marker.length)}${asset}`;
}

/**
 * Perfil de entrega para VÍDEO. Segue a mesma ideia do `cdnImage`, mas com
 * outro alvo: vídeo de vitrine é decorativo e roda num card pequeno, então o
 * que importa é peso, não fidelidade.
 *
 * Medido no vídeo de produto da home (2026-07-25):
 *   original                        2454 KB
 *   q_auto                          1165 KB
 *   q_auto:eco,w_720,c_limit         510 KB  ← escolhido, −79%
 *
 * O card do carrossel tem no máximo ~580px, então 720px já cobre retina.
 * `c_limit` nunca faz upscale; `vc_auto` deixa o Cloudinary escolher o codec
 * (H.265/VP9 onde o navegador aceita). No celular esses ~2 MB a menos são a
 * diferença entre a home abrir e a home parecer travada.
 */
export function cdnVideo(url?: string, width = 720): string {
  if (!url || !url.includes('res.cloudinary.com')) return url ?? '';
  const marker = '/upload/';
  const at = url.indexOf(marker);
  if (at === -1) return url;

  const tail = url.slice(at + marker.length);
  const asset = tail.match(/^(?:.+?\/)?(v\d+\/.*)$/)?.[1] ?? tail;
  return `${url.slice(0, at + marker.length)}q_auto:eco,vc_auto,c_limit,w_${width}/${asset}`;
}

export const cloudinaryService = {
  isCloudinaryUrl: (s: string) =>
    typeof s === 'string' && s.includes('res.cloudinary.com'),

  isFirebaseUrl: (s: string) =>
    typeof s === 'string' && s.includes('firebasestorage.app'),

  isDataUrl: (s: string) =>
    typeof s === 'string' && s.startsWith('data:'),

  isExternalUrl: (s: string) =>
    typeof s === 'string' &&
    s.startsWith('http') &&
    !s.includes('res.cloudinary.com') &&
    !s.includes('firebasestorage.app'),

  needsMigration: (s?: string) =>
    typeof s === 'string' && s.startsWith('data:'),

  async uploadDataUrl(dataUrl: string, folder: string): Promise<string> {
    const motivos: string[] = [];
    let blob: Blob | null = null;
    try {
      blob = dataUrl.startsWith('data:')
        ? dataUrlToBlob(dataUrl)
        : await (await fetch(dataUrl)).blob();
    } catch (e) {
      motivos.push(`leitura da imagem falhou (${e instanceof Error ? e.message : String(e)})`);
    }

    if (blob) {
      // 1) Cloudinary
      try {
        const form = new FormData();
        form.append('file', blob);
        form.append('upload_preset', UPLOAD_PRESET);
        form.append('folder', folder);
        const response = await fetch(UPLOAD_URL, { method: 'POST', body: form });
        if (response.ok) {
          const data = await response.json();
          // Guarda a master limpa. A qualidade de entrega é decidida por
          // `cdnImage` no momento do render, não congelada na URL.
          return data.secure_url as string;
        }
        const err = await response.json().catch(() => ({}));
        motivos.push(`Cloudinary ${response.status}: ${err?.error?.message || 'sem detalhe'}`);
      } catch (e) {
        motivos.push(`Cloudinary inacessível (${e instanceof Error ? e.message : String(e)})`);
      }

      // 2) Fallback: Firebase Storage
      try {
        return await uploadToFirebase(blob, folder);
      } catch (e) {
        motivos.push(`Firebase Storage: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Aqui existia um terceiro nível que salvava a imagem em base64 dentro do
    // próprio documento do Firestore, "para o produto nunca deixar de salvar".
    // A conta chegou em 26/07/2026: 88 produtos haviam acumulado 20,4 MB de
    // base64 — 98% do catálogo — estourando a banda do Firestore e derrubando
    // a loja inteira. E como a degradação era silenciosa, ninguém viu crescer.
    //
    // Falhar é mais barato: o admin vê o motivo, corrige e reenvia. O banco
    // não é contaminado, e o botão "testar conexão" volta a dizer a verdade
    // (antes ele acusava sucesso mesmo com o Cloudinary fora do ar).
    throw new Error(`Não foi possível enviar a imagem. ${motivos.join(' | ')}`);
  },

  async uploadVideoFile(file: File, folder: string): Promise<string> {
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('upload_preset', UPLOAD_PRESET);
      form.append('folder', folder);
      const response = await fetch(UPLOAD_URL_VIDEO, { method: 'POST', body: form });
      if (response.ok) {
        const data = await response.json();
        return data.secure_url as string;
      }
      const err = await response.json().catch(() => ({}));
      console.warn(`Cloudinary vídeo indisponível (${response.status}): ${err?.error?.message}. Tentando Firebase Storage.`);
    } catch (e) {
      console.warn('Cloudinary vídeo offline, tentando Firebase Storage:', e);
    }

    // Fallback: Firebase Storage (sem último recurso base64 — vídeo é grande demais para o Firestore)
    return uploadVideoToFirebase(file, folder);
  },
};
