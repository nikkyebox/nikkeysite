// Em 26/07/2026, 88 produtos haviam acumulado 20,4 MB de imagens em base64
// dentro dos próprios documentos do Firestore. A origem era um fallback que
// gravava a imagem embutida quando o upload falhava. Este teste existe para que
// esse fallback não volte — e para garantir que o Cloudinary saiu de vez.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  ref: vi.fn((_s: unknown, path: string) => ({ path })),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => storageMocks);

import { mediaStorage, productMediaFolder } from '@/services/mediaStorage';

const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const IMAGEM = `data:image/png;base64,${PIXEL_PNG}`;
const URL_BUCKET = 'https://firebasestorage.googleapis.com/v0/b/nikkeybox.firebasestorage.app/o/products%2Fp1%2Fa.png?alt=media';

describe('mediaStorage.uploadDataUrl', () => {
  beforeEach(() => {
    storageMocks.ref.mockClear();
    storageMocks.uploadBytes.mockReset();
    storageMocks.getDownloadURL.mockReset();
    // Se o serviço voltar a ler data URL por fetch, quebra igual ao Safari.
    vi.stubGlobal('fetch', vi.fn(async (alvo: unknown) => {
      if (typeof alvo === 'string' && alvo.startsWith('data:')) throw new TypeError('Load failed');
      if (typeof alvo === 'string' && alvo.includes('cloudinary')) throw new Error('Cloudinary não deve ser chamado');
      return { blob: async () => new Blob(['xyz'], { type: 'image/jpeg' }) } as unknown as Response;
    }));
  });

  it('envia ao Firebase Storage na pasta que o storage.rules libera', async () => {
    storageMocks.uploadBytes.mockResolvedValue({});
    storageMocks.getDownloadURL.mockResolvedValue(URL_BUCKET);

    const url = await mediaStorage.uploadDataUrl(IMAGEM, productMediaFolder('p1'));

    expect(url).toBe(URL_BUCKET);
    expect(storageMocks.ref.mock.calls[0][1]).toMatch(/^products\/p1\/\d+-[a-z0-9]+\.png$/);
  });

  it('manda os bytes decodificados com o mime da data URL, sem fetch', async () => {
    storageMocks.uploadBytes.mockResolvedValue({});
    storageMocks.getDownloadURL.mockResolvedValue(URL_BUCKET);

    await mediaStorage.uploadDataUrl(IMAGEM, 'products/p1');

    const blob = storageMocks.uploadBytes.mock.calls[0][1] as Blob;
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe(atob(PIXEL_PNG).length);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('LANÇA quando o Storage falha — nunca devolve base64', async () => {
    storageMocks.uploadBytes.mockRejectedValue(new Error('sem permissão'));

    let devolvido: string | null = null;
    let mensagem = '';
    try {
      devolvido = await mediaStorage.uploadDataUrl(IMAGEM, 'products/p1');
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }

    expect(devolvido).toBeNull();
    expect(mensagem).toMatch(/Firebase Storage: sem permissão/);
  });

  it('acusa canvas vazio em vez de enviar 0 byte', async () => {
    await expect(mediaStorage.uploadDataUrl('data:,', 'products/p1')).rejects.toThrow(/não conseguiu exportar/);
    expect(storageMocks.uploadBytes).not.toHaveBeenCalled();
  });

  it('continua lendo URL http pela rede', async () => {
    storageMocks.uploadBytes.mockResolvedValue({});
    storageMocks.getDownloadURL.mockResolvedValue(URL_BUCKET);

    await expect(mediaStorage.uploadDataUrl('https://exemplo.com/foto.jpg', 'products/p1')).resolves.toBe(URL_BUCKET);
  });
});

describe('classificação de URL', () => {
  it('trata URL legada do Cloudinary como externa — precisa migrar', () => {
    const legada = 'https://res.cloudinary.com/dw4j4tpub/image/upload/v1/nikkeybox/products/p1/a.webp';
    expect(mediaStorage.isStorageUrl(legada)).toBe(false);
    expect(mediaStorage.needsUpload(legada)).toBe(true);
  });

  it('não re-envia o que já está no bucket', () => {
    expect(mediaStorage.isStorageUrl(URL_BUCKET)).toBe(true);
    expect(mediaStorage.needsUpload(URL_BUCKET)).toBe(false);
  });

  it('base64 embutido precisa subir', () => {
    expect(mediaStorage.needsUpload(IMAGEM)).toBe(true);
  });
});
