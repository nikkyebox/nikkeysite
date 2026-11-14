import React, { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudUpload, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProducts } from '@/context/ProductsContext';
import { productService } from '@/services/productService';
import { mediaStorage, productMediaFolder } from '@/services/mediaStorage';
import { errorMessage } from '@/utils/errors';
import { Product } from '@/types';

const CONCURRENCY = 3;

/** Reduz e converte para WebP. Devolve `''` quando não há ganho — o chamador
 *  envia os bytes originais, sem re-encode que degradaria a master. */
function compressToWebp(src: string, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(''), 20000);
    img.onload = () => {
      clearTimeout(timer);
      let { width, height } = img;
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

/** Baixa a URL como data URL via fetch — contorna o bloqueio CORS do canvas. */
async function fetchAsDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${src.slice(0, 60)}…`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(new Error('falha ao ler o arquivo baixado'));
    reader.readAsDataURL(blob);
  });
}

function productNeedsMigration(p: Product): boolean {
  return mediaStorage.needsUpload(p.image)
    || mediaStorage.needsUpload(p.thumbnail)
    || (p.gallery?.some((g) => mediaStorage.needsUpload(g)) ?? false);
}

async function moveToBucket(src: string, folder: string, maxSize: number): Promise<string> {
  if (!src || !mediaStorage.needsUpload(src)) return src;
  const dataUrl = await fetchAsDataUrl(src);
  const compressed = await compressToWebp(dataUrl, maxSize, 0.95);
  return mediaStorage.uploadDataUrl(compressed || dataUrl, folder);
}

async function migrateProduct(p: Product): Promise<Product> {
  const folder = productMediaFolder(p.id);
  const rawGallery = p.gallery && p.gallery.length > 0 ? p.gallery : [p.image].filter(Boolean) as string[];

  const gallery: string[] = [];
  for (const img of rawGallery) gallery.push(await moveToBucket(img, folder, 2560));

  const image = gallery[0] || p.image;
  const thumbnail = p.thumbnail && mediaStorage.needsUpload(p.thumbnail)
    ? await moveToBucket(p.thumbnail, folder, 1600)
    : p.thumbnail || image;

  return { ...p, image, thumbnail, gallery: gallery.filter(Boolean) };
}

async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  const worker = async () => { while (idx < items.length) { const i = idx++; await fn(items[i]); } };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

interface MigState { status: 'idle' | 'running' | 'done' | 'error'; total: number; done: number; errors: string[]; }

const sourceLabel = (p: Product): string => {
  const all = [p.image, p.thumbnail, ...(p.gallery ?? [])].filter(Boolean) as string[];
  if (all.some((s) => s.includes('res.cloudinary.com'))) return 'Cloudinary';
  if (all.some((s) => s.startsWith('data:'))) return 'base64';
  return 'externa';
};

const ImageMigration: React.FC = () => {
  const { products, refresh } = useProducts();
  const [state, setState] = useState<MigState>({ status: 'idle', total: 0, done: 0, errors: [] });

  const toMigrate = useMemo(() => products.filter(productNeedsMigration), [products]);
  const allMigrated = toMigrate.length === 0;

  const runMigration = useCallback(async () => {
    if (toMigrate.length === 0) return;
    const errors: string[] = [];
    setState({ status: 'running', total: toMigrate.length, done: 0, errors: [] });

    await runWithConcurrency(toMigrate, CONCURRENCY, async (p) => {
      try {
        await productService.save(await migrateProduct(p));
      } catch (e: unknown) {
        errors.push(`${p.name}: ${errorMessage(e) || 'erro desconhecido'}`);
      }
      setState((s) => ({ ...s, done: s.done + 1, errors: [...errors] }));
    });

    await refresh();
    setState((s) => ({ ...s, status: errors.length > 0 ? 'error' : 'done', errors }));
  }, [toMigrate, refresh]);

  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
  const running = state.status === 'running';

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <CloudUpload className="h-5 w-5 text-primary" aria-hidden="true" />
          Imagens no Firebase Storage
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Move para o bucket do Firebase as imagens que ainda estão no Cloudinary, em sites de fornecedor ou embutidas em base64. O Firestore guarda só a URL.
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Produtos</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{products.length}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs text-muted-foreground">Fora do bucket</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">{toMigrate.length}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <dt className="text-xs text-muted-foreground">No Firebase</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{products.length - toMigrate.length}</dd>
        </div>
      </dl>

      {running && (
        <div className="space-y-2" role="status" aria-live="polite">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Baixando, comprimindo e enviando…</span>
            <span className="font-medium tabular-nums">{state.done}/{state.total} ({pct}%)</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full origin-left rounded-full bg-primary transition-transform duration-300" style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
        </div>
      )}

      {(state.status === 'done' || (allMigrated && !running)) && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Todas as imagens estão no Firebase Storage.</p>
        </div>
      )}

      {state.status === 'error' && state.errors.length > 0 && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30" role="alert">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {state.errors.length} produto(s) não migraram
          </p>
          <p className="text-xs text-red-700 dark:text-red-400">
            Se a URL do Cloudinary já não abre, reenvie a foto pelo editor do produto.
          </p>
          <ul className="max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-red-700 dark:text-red-400">
            {state.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {toMigrate.length > 0 && !running && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
            {toMigrate.length} produto(s) com imagem fora do bucket
          </div>
          <ul className="max-h-60 divide-y divide-border overflow-y-auto">
            {toMigrate.slice(0, 50).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                {p.thumbnail || p.image ? (
                  <img src={p.thumbnail || p.image} alt="" className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                )}
                <span className="flex-1 truncate text-sm">{p.name}</span>
                <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{sourceLabel(p)}</span>
              </li>
            ))}
            {toMigrate.length > 50 && <li className="px-4 py-2 text-xs text-muted-foreground">+ {toMigrate.length - 50} outros</li>}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {!allMigrated && (
          <Button onClick={runMigration} disabled={running} className="gap-2">
            <CloudUpload className="h-4 w-4" aria-hidden="true" />
            {running
              ? `Migrando ${state.done}/${state.total}…`
              : state.status === 'error' ? `Migrar de novo (${toMigrate.length})` : `Migrar ${toMigrate.length} produto(s)`}
          </Button>
        )}
        <Button variant="outline" onClick={() => void refresh()} disabled={running} className="gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Recarregar lista
        </Button>
      </div>
    </div>
  );
};

export default ImageMigration;
