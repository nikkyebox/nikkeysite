// Mídia de produto: binário no Firebase Storage, URL no Firestore.
//
// O Cloudinary foi desligado. Não existe mais CDN com transformação de URL, então
// o tamanho entregue é o tamanho enviado — a compressão acontece no navegador do
// admin, antes do upload (ver `urlToCompressedDataURL` no ProductManager).
//
// Se o upload falhar, LANÇA — nunca grava a imagem dentro do documento do
// Firestore. Em 26/07/2026 um fallback base64 acumulou 20,4 MB em 88 produtos e
// derrubou a loja por estouro de banda.
import { storage } from '@/config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/** Raiz no bucket. Precisa bater com `match /products/{productId}/{fileName}` do storage.rules. */
export const productMediaFolder = (productId: string) => `products/${productId}`;

// Data URL → Blob sem passar pelo `fetch`.
//
// O Safari falha com "load failed" ao dar `fetch()` numa data URL grande (foto
// de 2560px ≈ 2 MB de base64). Decodificar na mão é síncrono e não depende da
// pilha de rede. `fetch` continua servindo as URLs http.
export function dataUrlToBlob(dataUrl: string): Blob {
  const virgula = dataUrl.indexOf(',');
  if (virgula < 0) throw new Error('data URL malformada (sem vírgula)');

  const cabecalho = dataUrl.slice('data:'.length, virgula);
  const mime = cabecalho.split(';')[0] || 'application/octet-stream';
  const corpo = dataUrl.slice(virgula + 1);

  // `canvas.toDataURL()` devolve `data:,` quando o navegador não consegue
  // exportar — no iPhone, foto grande demais para o limite de área do canvas.
  if (!corpo) throw new Error('o navegador não conseguiu exportar a imagem (arquivo muito grande?)');

  if (!/;base64/i.test(cabecalho)) {
    return new Blob([decodeURIComponent(corpo)], { type: mime });
  }

  const binario = atob(corpo);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function extensionFor(type: string): string {
  if (type.includes('webp')) return 'webp';
  if (type.includes('png')) return 'png';
  if (type.includes('webm')) return 'webm';
  if (type.includes('quicktime')) return 'mov';
  if (type.startsWith('video/')) return 'mp4';
  return 'jpg';
}

async function putBlob(blob: Blob, folder: string): Promise<string> {
  if (!storage) throw new Error('Firebase Storage indisponível.');
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(blob.type)}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, {
    contentType: blob.type,
    // Nome com timestamp nunca é reescrito: pode ficar em cache por 1 ano.
    cacheControl: 'public, max-age=31536000, immutable',
  });
  return getDownloadURL(storageRef);
}

const isString = (s: unknown): s is string => typeof s === 'string';

export const mediaStorage = {
  isStorageUrl: (s: unknown) =>
    isString(s) &&
    (s.startsWith('/media/products/') ||
      s.includes('firebasestorage.googleapis.com') ||
      s.includes('.firebasestorage.app') ||
      s.includes('storage.googleapis.com')),

  isDataUrl: (s: unknown) => isString(s) && s.startsWith('data:'),

  /** Qualquer http(s) fora do nosso bucket — inclui URLs legadas do Cloudinary. */
  isExternalUrl: (s: unknown) => isString(s) && /^https?:\/\//.test(s) && !mediaStorage.isStorageUrl(s),

  /** Precisa ir para o bucket: base64 embutido ou URL hospedada fora. */
  needsUpload: (s: unknown) => mediaStorage.isDataUrl(s) || mediaStorage.isExternalUrl(s),

  async uploadDataUrl(dataUrl: string, folder: string): Promise<string> {
    let blob: Blob;
    try {
      blob = dataUrl.startsWith('data:') ? dataUrlToBlob(dataUrl) : await (await fetch(dataUrl)).blob();
    } catch (e) {
      throw new Error(`Não foi possível ler a imagem: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      return await putBlob(blob, folder);
    } catch (e) {
      throw new Error(`Não foi possível enviar a imagem ao Firebase Storage: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  async uploadVideoFile(file: File, folder: string): Promise<string> {
    try {
      return await putBlob(file, folder);
    } catch (e) {
      throw new Error(`Não foi possível enviar o vídeo ao Firebase Storage: ${e instanceof Error ? e.message : String(e)}`);
    }
  },
};
