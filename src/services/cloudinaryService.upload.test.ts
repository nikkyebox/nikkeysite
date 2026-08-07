// Em 26/07/2026, 88 produtos haviam acumulado 20,4 MB de imagens em base64
// dentro dos próprios documentos do Firestore — 98% do catálogo. A origem era
// um terceiro nível de fallback que, quando Cloudinary e Firebase Storage
// falhavam, gravava a imagem embutida "para o produto nunca deixar de salvar".
// A degradação era silenciosa, então ninguém viu o catálogo crescer até a loja
// cair por estouro de cota.
//
// Este teste existe para que esse fallback não volte.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({ uploadBytes: vi.fn(), getDownloadURL: vi.fn() }));

vi.mock('@/config/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({ kind: 'ref' })),
  uploadBytes: storageMocks.uploadBytes,
  getDownloadURL: storageMocks.getDownloadURL,
}));

import { cloudinaryService } from '@/services/cloudinaryService';

const IMAGEM = 'data:image/png;base64,iVBORw0KGgo=';

/**
 * Encena só o POST ao Cloudinary.
 *
 * O `fetch` NÃO atende mais data URL de propósito: se o serviço voltar a ler a
 * imagem por `fetch`, o mock rejeita igual ao Safari e os testes abaixo caem.
 */
function encenar(respostaCloudinary: Partial<Response> | Error): void {
  vi.stubGlobal('fetch', vi.fn(async (alvo: unknown) => {
    if (typeof alvo === 'string' && alvo.startsWith('data:')) {
      throw new TypeError('Load failed');
    }
    if (respostaCloudinary instanceof Error) throw respostaCloudinary;
    return respostaCloudinary as Response;
  }));
}

describe('cloudinaryService.uploadDataUrl', () => {
  beforeEach(() => {
    storageMocks.uploadBytes.mockReset();
    storageMocks.getDownloadURL.mockReset();
  });

  it('devolve a URL do Cloudinary quando o envio funciona', async () => {
    encenar({ ok: true, json: async () => ({ secure_url: 'https://res.cloudinary.com/x/a.jpg' }) } as Partial<Response>);

    const url = await cloudinaryService.uploadDataUrl(IMAGEM, 'japanexpress/products/p1');

    expect(url).toBe('https://res.cloudinary.com/x/a.jpg');
  });

  it('cai para o Firebase Storage quando o Cloudinary recusa', async () => {
    encenar({ ok: false, status: 420, json: async () => ({ error: { message: 'quota' } }) } as Partial<Response>);
    storageMocks.uploadBytes.mockResolvedValue({});
    storageMocks.getDownloadURL.mockResolvedValue('https://firebasestorage.app/b.png');

    const url = await cloudinaryService.uploadDataUrl(IMAGEM, 'japanexpress/products/p1');

    expect(url).toBe('https://firebasestorage.app/b.png');
  });

  it('LANÇA quando os dois falham — nunca devolve base64', async () => {
    encenar({ ok: false, status: 420, json: async () => ({ error: { message: 'quota' } }) } as Partial<Response>);
    storageMocks.uploadBytes.mockRejectedValue(new Error('storage indisponível'));

    // Encena o retorno de verdade: se algum dia voltar a resolver, `devolvido`
    // guarda o valor e o teste falha — inclusive (sobretudo) se for um `data:`.
    let devolvido: string | null = null;
    let mensagem = '';
    try {
      devolvido = await cloudinaryService.uploadDataUrl(IMAGEM, 'japanexpress/products/p1');
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }

    expect(devolvido).toBeNull();
    expect(mensagem).toMatch(/Não foi possível enviar a imagem/);
  });

  it('explica os dois motivos na mensagem, para o admin saber o que houve', async () => {
    encenar({ ok: false, status: 420, json: async () => ({ error: { message: 'limite mensal' } }) } as Partial<Response>);
    storageMocks.uploadBytes.mockRejectedValue(new Error('sem permissão'));

    await expect(cloudinaryService.uploadDataUrl(IMAGEM, 'p')).rejects.toThrow(/limite mensal.*sem permissão/s);
  });
});

// O admin do iPhone não conseguia subir imagem de produto novo: o Safari falha
// com "load failed" ao dar `fetch()` numa data URL grande (a foto de 2560px
// vira ~2 MB de base64). E como sem blob o bloco de upload inteiro é pulado, o
// erro saía sozinho — nenhum request chegava ao Cloudinary, então parecia CDN
// fora do ar. A leitura tem de ser síncrona, sem pilha de rede.
describe('leitura da imagem sem fetch', () => {
  const PIXEL_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('envia a imagem mesmo com o fetch de data URL falhando como no Safari', async () => {
    encenar({ ok: true, json: async () => ({ secure_url: 'https://res.cloudinary.com/x/a.jpg' }) } as Partial<Response>);

    const url = await cloudinaryService.uploadDataUrl(`data:image/png;base64,${PIXEL_PNG}`, 'p');

    expect(url).toBe('https://res.cloudinary.com/x/a.jpg');
  });

  it('manda ao Cloudinary os bytes decodificados, com o mime da data URL', async () => {
    let enviado: Blob | null = null;
    encenar({ ok: true, json: async () => ({ secure_url: 'https://res.cloudinary.com/x/a.jpg' }) } as Partial<Response>);
    const espiao = vi.mocked(fetch);

    await cloudinaryService.uploadDataUrl(`data:image/png;base64,${PIXEL_PNG}`, 'p');

    const corpo = espiao.mock.calls.at(-1)?.[1]?.body as FormData;
    enviado = corpo.get('file') as Blob;
    expect(enviado.type).toBe('image/png');
    expect(enviado.size).toBe(atob(PIXEL_PNG).length);
  });

  // `urlToCompressedDataURL` devolve a URL original quando o CORS barra o
  // canvas — essa continua tendo de ser lida pela rede.
  it('continua lendo URL http pela rede', async () => {
    vi.stubGlobal('fetch', vi.fn(async (alvo: unknown) => {
      if (alvo === 'https://exemplo.com/foto.jpg') {
        return { blob: async () => new Blob(['xyz'], { type: 'image/jpeg' }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({ secure_url: 'https://res.cloudinary.com/x/b.jpg' }) } as unknown as Response;
    }));

    await expect(cloudinaryService.uploadDataUrl('https://exemplo.com/foto.jpg', 'p'))
      .resolves.toBe('https://res.cloudinary.com/x/b.jpg');
  });

  // Vizinho do mesmo problema: no iPhone o canvas estoura com foto grande e
  // `toDataURL()` devolve `data:,`. Subir 0 byte só rende um 400 genérico do
  // Cloudinary — o admin precisa ler que a foto é que não foi exportada.
  it('acusa canvas vazio em vez de enviar 0 byte', async () => {
    encenar({ ok: true, json: async () => ({ secure_url: 'https://res.cloudinary.com/x/a.jpg' }) } as Partial<Response>);

    await expect(cloudinaryService.uploadDataUrl('data:,', 'p'))
      .rejects.toThrow(/não conseguiu exportar a imagem/);
  });
});
