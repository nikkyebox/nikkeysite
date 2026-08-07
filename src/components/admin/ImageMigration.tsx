import React, { useState, useCallback, useEffect } from 'react';
import { CheckCircle, CloudUpload, AlertTriangle, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProducts } from '@/context/ProductsContext';
import { productService } from '@/services/productService';
import { cloudinaryService, cdnOriginal } from '@/services/cloudinaryService';
import { Product } from '@/types';

const CONCURRENCY = 3;

/** Reduz e converte para WebP. Devolve `''` quando não há nada a ganhar — os
 *  chamadores tratam `''` como "mantém o original", evitando o re-encode que
 *  degradava as masters a cada migração repetida. */
function compressToWebp(src: string, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(''), 20000);
    img.onload = () => {
      clearTimeout(timer);
      let { width, height } = img;
      // Já é WebP e cabe no teto: qualquer passagem pelo canvas só perderia
      // detalhe. Devolve '' para o chamador preservar os bytes originais.
      if (src.startsWith('data:image/webp') && width <= maxSize && height <= maxSize) {
        resolve('');
        return;
      }
      if (width > height && width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; }
      else if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(''); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const webp = canvas.toDataURL('image/webp', quality);
      resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { clearTimeout(timer); resolve(''); };
    img.src = src;
  });
}

function needsMigration(p: Product): boolean {
  const isBase64 = (s?: string) => typeof s === 'string' && s.startsWith('data:');
  return isBase64(p.image) || isBase64(p.thumbnail) || (p.gallery?.some(isBase64) ?? false);
}

async function uploadImage(dataUrl: string, folder: string): Promise<string> {
  // Comprime antes de enviar (5MB base64 → ~150KB WebP)
  const compressed = await compressToWebp(dataUrl, 2560, 0.95);
  return cloudinaryService.uploadDataUrl(compressed || dataUrl, folder);
}

async function migrateProduct(p: Product): Promise<Product> {
  const folder = `japanexpress/products/${p.id}`;
  const rawGallery = (p.gallery && p.gallery.length > 0) ? p.gallery : [p.image].filter(Boolean) as string[];

  // Upload da galeria em paralelo
  const galleryUrls = await Promise.all(
    rawGallery.map((img) =>
      img.startsWith('data:') ? uploadImage(img, folder) : Promise.resolve(img)
    )
  );
  const coverUrl = galleryUrls[0] || p.image;

  // Thumbnail: comprime mais (300px) e faz upload separado
  let thumbUrl = p.thumbnail || '';
  if (!thumbUrl || thumbUrl.startsWith('data:')) {
    const rawCover = rawGallery[0] || '';
    if (rawCover.startsWith('data:')) {
      const thumbCompressed = await compressToWebp(rawCover, 1600, 0.95);
      thumbUrl = await cloudinaryService.uploadDataUrl(thumbCompressed || rawCover, folder);
    } else {
      thumbUrl = coverUrl;
    }
  }

  return { ...p, image: coverUrl, thumbnail: thumbUrl || undefined, gallery: galleryUrls.filter(Boolean) };
}

// Baixa qualquer URL (inclusive Cloudinary) como base64 via fetch — sem restrição CORS do canvas
async function fetchAsDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return '';
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch { return ''; }
}

// Re-envia TODAS as imagens (inclusive Cloudinary) em alta qualidade usando fetch
async function remigrateProductHD(p: Product): Promise<Product> {
  const folder = `japanexpress/products/${p.id}`;
  const rawGallery = (p.gallery && p.gallery.length > 0) ? p.gallery : [p.image].filter(Boolean) as string[];

  const galleryUrls: string[] = [];
  for (const img of rawGallery) {
    if (!img) continue;
    // fetch contorna o bloqueio CORS do canvas.toDataURL()
    const dataUrl = await fetchAsDataUrl(cdnOriginal(img));
    if (!dataUrl) { galleryUrls.push(img); continue; }
    const compressed = await compressToWebp(dataUrl, 2560, 0.95);
    if (!compressed) { galleryUrls.push(img); continue; }
    try {
      const url = await cloudinaryService.uploadDataUrl(compressed, folder);
      galleryUrls.push(url || img);
    } catch { galleryUrls.push(img); }
  }

  const coverUrl = galleryUrls[0] || p.image;

  // Thumbnail re-gerado a partir da capa original (via fetch também)
  let thumbUrl = p.thumbnail || '';
  const coverSrc = rawGallery[0] || '';
  if (coverSrc) {
    const coverData = await fetchAsDataUrl(cdnOriginal(coverSrc));
    if (coverData) {
      const thumbCompressed = await compressToWebp(coverData, 1600, 0.95);
      if (thumbCompressed) {
        try { thumbUrl = await cloudinaryService.uploadDataUrl(thumbCompressed, folder); } catch { thumbUrl = coverUrl; }
      }
    }
  }

  return { ...p, image: coverUrl, thumbnail: thumbUrl || coverUrl, gallery: galleryUrls.filter(Boolean) };
}

async function runWithConcurrency<T>(
  items: T[], concurrency: number, fn: (item: T) => Promise<void>
): Promise<void> {
  let idx = 0;
  const worker = async () => { while (idx < items.length) { const i = idx++; await fn(items[i]); } };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

interface MigState { status: 'idle' | 'running' | 'done' | 'error'; total: number; done: number; errors: string[]; }

const ImageMigration: React.FC = () => {
  const { products, refresh } = useProducts();
  const [state, setState] = useState<MigState>({ status: 'idle', total: 0, done: 0, errors: [] });
  const [hdState, setHdState] = useState<MigState>({ status: 'idle', total: 0, done: 0, errors: [] });
  const [tested, setTested] = useState<'checking' | 'ok' | 'fail'>('checking');
  const [testError, setTestError] = useState('');

  useEffect(() => {
    // Testa conexão com Cloudinary enviando pixel mínimo
    const TEST = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    cloudinaryService.uploadDataUrl(TEST, 'japanexpress/__test__')
      .then(() => setTested('ok'))
      .catch((e) => { setTested('fail'); setTestError(e?.message || String(e)); });
  }, []);

  const toMigrate = products.filter(needsMigration);
  const allMigrated = toMigrate.length === 0;
  const productsWithImages = products.filter(p => p.image || (p.gallery && p.gallery.length > 0));

  const runHDRemigration = useCallback(async () => {
    if (productsWithImages.length === 0) return;
    const errors: string[] = [];
    setHdState({ status: 'running', total: productsWithImages.length, done: 0, errors: [] });
    await runWithConcurrency(productsWithImages, 2, async (p) => {
      try {
        const migrated = await remigrateProductHD(p);
        await productService.save(migrated);
      } catch (e: any) {
        errors.push(`${p.name}: ${e?.message || 'erro'}`);
      }
      setHdState((s) => ({ ...s, done: s.done + 1, errors: [...errors] }));
    });
    await refresh();
    setHdState((s) => ({ ...s, status: errors.length > 0 ? 'error' : 'done', errors }));
  }, [productsWithImages, refresh]);

  const runMigration = useCallback(async () => {
    if (toMigrate.length === 0) return;
    const errors: string[] = [];
    setState({ status: 'running', total: toMigrate.length, done: 0, errors: [] });

    await runWithConcurrency(toMigrate, CONCURRENCY, async (p) => {
      try {
        const migrated = await migrateProduct(p);
        await productService.save(migrated);
      } catch (e: any) {
        errors.push(`${p.name}: ${e?.message || 'erro'}`);
      }
      setState((s) => ({ ...s, done: s.done + 1, errors: [...errors] }));
    });

    await refresh();
    setState((s) => ({ ...s, status: errors.length > 0 ? 'error' : 'done', errors }));
  }, [toMigrate, refresh]);

  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CloudUpload className="w-5 h-5 text-primary" />
          Migração de Imagens → Cloudinary CDN
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Comprime imagens (5MB → ~150KB WebP) e envia ao CDN Cloudinary. {CONCURRENCY} produtos em paralelo.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="rounded-xl border border-border p-4">
          <div className="text-2xl font-bold">{products.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Total de produtos</div>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/30 p-4">
          <div className="text-2xl font-bold text-orange-600">{toMigrate.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Precisam migrar</div>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4">
          <div className="text-2xl font-bold text-green-600">{products.length - toMigrate.length}</div>
          <div className="text-xs text-muted-foreground mt-1">Já no CDN</div>
        </div>
      </div>

      {/* Status do teste de conexão */}
      {tested === 'checking' && (
        <div className="text-sm text-muted-foreground animate-pulse">Verificando conexão com Cloudinary...</div>
      )}
      {tested === 'ok' && state.status === 'idle' && !allMigrated && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="w-4 h-4" /> Cloudinary acessível — pronto para migrar.
        </div>
      )}
      {tested === 'fail' && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 space-y-2">
          <div className="font-semibold text-red-700">Erro ao conectar no Cloudinary</div>
          <p className="text-sm text-red-600">{testError}</p>
          <p className="text-xs text-red-500">Verifique se o upload preset "japanexpress" está como Unsigned no Cloudinary.</p>
        </div>
      )}

      {/* Progresso */}
      {state.status === 'running' && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{CONCURRENCY} em paralelo · comprimindo + enviando</span>
            <span className="font-medium">{state.done}/{state.total} ({pct}%)</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          {state.errors.length > 0 && <p className="text-xs text-orange-600">{state.errors.length} erro(s) — continuando...</p>}
        </div>
      )}

      {state.status === 'done' && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          <div>
            <div className="font-semibold text-green-700 dark:text-green-400">Migração concluída!</div>
            <div className="text-sm text-green-600/80">{state.total} produto(s) agora no CDN Cloudinary.</div>
          </div>
        </div>
      )}

      {state.status === 'error' && state.errors.length > 0 && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-red-700"><AlertTriangle className="w-4 h-4" /> {state.errors.length} erro(s)</div>
          <ul className="text-xs text-red-600 list-disc pl-5 max-h-32 overflow-y-auto space-y-1">
            {state.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {allMigrated && state.status !== 'running' && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          <div>
            <div className="font-semibold text-green-700 dark:text-green-400">Tudo migrado!</div>
            <div className="text-sm text-green-600/80">Todas as imagens estão no CDN Cloudinary.</div>
          </div>
        </div>
      )}

      {/* Lista de produtos pendentes */}
      {toMigrate.length > 0 && state.status === 'idle' && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-secondary/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {toMigrate.length} produto(s) com imagens base64
          </div>
          <div className="divide-y divide-border max-h-52 overflow-y-auto">
            {toMigrate.slice(0, 50).map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                {(p.thumbnail || p.image) ? (
                  <img src={p.thumbnail || p.image} alt={p.name} className="w-9 h-9 rounded-lg object-cover shrink-0 border border-border" />
                ) : (
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <ImageIcon className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <span className="text-sm flex-1 truncate">{p.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 shrink-0">base64</span>
              </div>
            ))}
            {toMigrate.length > 50 && <div className="px-4 py-2 text-xs text-muted-foreground">+ {toMigrate.length - 50} mais...</div>}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {!allMigrated && state.status !== 'running' && tested === 'ok' && (
          <Button onClick={runMigration} className="gap-2">
            <CloudUpload className="w-4 h-4" />
            {state.status === 'error' ? `Tentar novamente (${toMigrate.length})` : `Migrar ${toMigrate.length} produto(s)`}
          </Button>
        )}
        <Button variant="outline" onClick={refresh} className="gap-2" disabled={state.status === 'running' || hdState.status === 'running'}>
          <RefreshCw className="w-4 h-4" />
          Recarregar lista
        </Button>
      </div>

      {/* Re-upload em HD — para imagens já no Cloudinary mas em baixa qualidade */}
      {tested === 'ok' && (
        <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 rounded-xl p-5 space-y-3">
          <div>
            <h3 className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Re-upload em alta qualidade (2560px / 95%)
            </h3>
            <p className="text-xs text-blue-700 dark:text-blue-400 mt-1 leading-relaxed">
              Re-processa <strong>todas as {productsWithImages.length} imagens</strong> já no Cloudinary, partindo sempre da master original e comprimindo para 2560px WebP com qualidade 95%. Imagens que já estão em WebP dentro do limite são preservadas intactas, sem re-encode.
              <br />⚠️ Isto NÃO recupera detalhe de fotos que já subiram pequenas — o tamanho do arquivo de origem é o teto. Para essas, re-envie a foto original do fornecedor.
              <br />⚠️ Operação lenta — aprox. {Math.ceil(productsWithImages.length * 5 / 60)} min. Não feche a aba.
            </p>
          </div>

          {hdState.status === 'running' && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-blue-700">
                <span>2 produtos em paralelo · baixando → comprimindo → enviando</span>
                <span className="font-bold">{hdState.done}/{hdState.total} ({Math.round(hdState.done / hdState.total * 100)}%)</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2.5 overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${Math.round(hdState.done / hdState.total * 100)}%` }} />
              </div>
            </div>
          )}

          {hdState.status === 'done' && (
            <div className="flex items-center gap-2 text-sm text-green-700 font-semibold">
              <CheckCircle className="w-4 h-4" /> Re-upload concluído! {hdState.total} produto(s) atualizados.
            </div>
          )}

          {hdState.status === 'error' && hdState.errors.length > 0 && (
            <ul className="text-xs text-red-600 list-disc pl-5 max-h-24 overflow-y-auto">
              {hdState.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}

          <Button
            onClick={runHDRemigration}
            disabled={hdState.status === 'running' || state.status === 'running' || productsWithImages.length === 0}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <CloudUpload className="w-4 h-4" />
            {hdState.status === 'running'
              ? `Processando ${hdState.done}/${hdState.total}...`
              : hdState.status === 'done' ? 'Re-upload concluído ✓' : `Re-enviar ${productsWithImages.length} produto(s) em HD`}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ImageMigration;
