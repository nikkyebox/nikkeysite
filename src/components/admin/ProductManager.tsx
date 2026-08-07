import React, { useState, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Image as ImageIcon, Loader2, PackageOpen, Sparkles, GripVertical, Save, Gift, Infinity, Search, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Product, ProductVariant } from '@/types';
import { getVariants, roundYen } from '@/utils/pricing';
import { generateUniqueSku } from '@/utils/sku';
import { useLanguage } from '@/context/LanguageContext';

const VARIANT_PRESETS = ['Pequeno', 'Médio', 'Grande', 'Kit'];
// Opções de venda por unidade — ex: "1 unidade", "2 unidades"
const UNIT_PRESETS = ['1 unidade', '2 unidades', '3 unidades', '4 unidades', '5 unidades', '6 unidades', '10 unidades'];
const ALL_PRESETS = [...VARIANT_PRESETS, ...UNIT_PRESETS];
const MAX_PHOTOS = 9; // capa + até 8 fotos extras
const MAX_VIDEO_MB = 50; // limite de upload de vídeo do produto
import { useProducts } from '@/context/ProductsContext';
import { productService } from '@/services/productService';
import { cloudinaryService } from '@/services/cloudinaryService';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/UserContext';
import { PACKAGE_SAFETY_MARGIN_CM, sanitizePackageDimensions } from '@/utils/shippingDimensions';
import { convertYen as fxConvertYen } from '@/services/fxService';
import { formatPrice } from '@/utils/currency';

import { categoryService, DEFAULT_CATEGORIES, type ProductCategory } from '@/services/categoryService';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || `produto-${Date.now()}`;

// Redimensiona e converte para WebP — muito mais leve que JPEG para o mesmo tamanho.
// 2560px/q0.95: o dobro do maior render do site (carrossel, 1400px), o que cobre
// telas retina. Acima disso paga-se banda por pixel que nenhuma tela mostra.
// NUNCA faz upscale — uma origem de 600px continua com 600px, e é por isso que
// a resolução do arquivo de origem é o teto real da qualidade final.
function fileToCompressedDataURL(file: File, maxSize = 2560, quality = 0.95): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas'));
        ctx.drawImage(img, 0, 0, width, height);
        // WebP é ~30% menor que JPEG com qualidade equivalente
        const webp = canvas.toDataURL('image/webp', quality);
        // Fallback para JPEG se o browser não suportar WebP (raro em 2025)
        resolve(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Thumbnail em HD — 1600px cobre os cards de lista em telas retina.
function fileToThumbnailDataURL(file: File): Promise<string> {
  return fileToCompressedDataURL(file, 1600, 0.95);
}

// Baixa uma imagem por URL e converte para WebP comprimido via canvas.
// Usada para imagens externas (Yahoo/Rakuten) que chegam em resolução full.
// Atenção: se o fornecedor devolver a miniatura em vez da foto grande, o produto
// nasce com master pequena e nenhuma transformação de entrega recupera detalhe.
function urlToCompressedDataURL(url: string, maxSize = 2560, quality = 0.95): Promise<string> {
  return new Promise((resolve) => {
    // Timeout de 8s: se CORS ou rede travar, cai no fallback com a URL original
    const timer = setTimeout(() => resolve(url), 8000);
    const done = (result: string) => { clearTimeout(timer); resolve(result); };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else if (height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { done(url); return; }
      try {
        ctx.drawImage(img, 0, 0, width, height);
        const webp = canvas.toDataURL('image/webp', quality);
        done(webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality));
      } catch {
        // Canvas tainted por CORS — devolve a URL original
        done(url);
      }
    };
    img.onerror = () => done(url);
    img.src = url;
  });
}

const emptyForm = (): Product => ({
  id: '',
  name: '',
  description: '',
  category: 'cosmeticos',
  prices: { small: 0, large: 0 },
  variants: [{ id: 'small', label: 'Pequeno', price: 0 }],
  image: '',
  gallery: [],
  flavor: '',
});

const ProductManager: React.FC = () => {
  const { products, refresh } = useProducts();
  const { toast } = useToast();
  const { permissions } = useUser();
  const { language } = useLanguage();
  const canPrice = permissions.canFinancial; // preço/custo só nível 3
  const [editing, setEditing] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichFields, setEnrichFields] = useState({ price: true, images: true, description: true, weight: true });
  const marginPct = 100;
  const [tagInput, setTagInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');

  // Categorias dinâmicas (padrão + personalizadas do Firestore)
  const [CATEGORIES, setCategories] = useState<ProductCategory[]>(DEFAULT_CATEGORIES);
  useEffect(() => {
    categoryService.getAll().then(setCategories).catch(() => {});
  }, []);
  const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label || id;
  const categoryIcon = (id: string) => CATEGORIES.find((c) => c.id === id)?.icon || '🌸';

  // Adicionar nova categoria
  const handleAddCategory = async () => {
    const label = window.prompt('Nome da nova categoria:');
    if (!label || !label.trim()) return;
    const icon = window.prompt('Emoji/ícone (opcional):', '🏷️') || '🏷️';
    const cat = await categoryService.add(label.trim(), icon.trim());
    if (cat) {
      const updated = await categoryService.getAll();
      setCategories(updated);
      if (editing) setEditing({ ...editing, category: cat.id });
      toast({ title: '✅ Categoria adicionada', description: `${cat.icon} ${cat.label}` });
    } else {
      toast({ title: 'Erro ao adicionar categoria', variant: 'destructive' });
    }
  };

  // Editar categoria personalizada (nome + emoji)
  const handleEditCategory = async () => {
    if (!editing) return;
    const id = editing.category;
    const current = CATEGORIES.find(c => c.id === id);
    if (!current || categoryService.isDefault(id)) {
      toast({ title: 'Categoria padrão não pode ser editada', variant: 'destructive' });
      return;
    }
    const label = window.prompt('Novo nome da categoria:', current.label);
    if (!label || !label.trim()) return;
    const icon = window.prompt('Novo emoji/ícone:', current.icon) || current.icon;
    const ok = await categoryService.update(id, label.trim(), icon.trim());
    if (ok) {
      setCategories(await categoryService.getAll());
      toast({ title: '✅ Categoria atualizada', description: `${icon} ${label}` });
    } else {
      toast({ title: 'Erro ao editar categoria', variant: 'destructive' });
    }
  };

  // Deletar categoria personalizada
  const handleDeleteCategory = async () => {
    if (!editing) return;
    const id = editing.category;
    const current = CATEGORIES.find(c => c.id === id);
    if (!current || categoryService.isDefault(id)) {
      toast({ title: 'Categoria padrão não pode ser deletada', variant: 'destructive' });
      return;
    }
    const inUse = products.filter(p => p.category === id).length;
    const msg = inUse > 0
      ? `Deletar "${current.label}"?\n\n⚠️ ${inUse} produto(s) usam essa categoria — eles ficarão sem categoria válida.`
      : `Deletar a categoria "${current.label}"?`;
    if (!window.confirm(msg)) return;
    const ok = await categoryService.remove(id);
    if (ok) {
      const updated = await categoryService.getAll();
      setCategories(updated);
      setEditing({ ...editing, category: updated[0]?.id || 'cosmeticos' });
      toast({ title: '🗑️ Categoria removida', description: current.label });
    } else {
      toast({ title: 'Erro ao remover categoria', variant: 'destructive' });
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchCat = filterCat === 'all' || p.category === filterCat;
    const q = searchQuery.trim().toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const grouped = CATEGORIES.map((c) => ({
    ...c,
    items: filteredProducts.filter((p) => p.category === c.id),
  })).filter((g) => g.items.length > 0);

  const openNew = () => {
    setEditing(emptyForm());
    setIsNew(true);
    setTagInput('');
};
  const openEdit = (p: Product) => {
    const vs = getVariants(p);
    const cost = p.cost || 0;
    const recalcVs = cost > 0
      ? vs.map((v, i) => i === 0 ? { ...v, price: Math.round(cost * 2) } : v)
      : vs;
    const recalcPrices = cost > 0
      ? { ...p.prices, small: Math.round(cost * 2) }
      : p.prices;
    setEditing({ ...p, gallery: p.gallery ? [...p.gallery] : [p.image], variants: recalcVs, prices: recalcPrices });
    setIsNew(false);
    setTagInput('');
  };

  // Helpers das variantes de preço
  const variants = (): ProductVariant[] => editing?.variants || [];
  const setVariants = (vs: ProductVariant[]) => editing && setEditing({ ...editing, variants: vs });
  const addVariant = () => setVariants([...variants(), { id: `var-${Date.now().toString(36)}`, label: 'Médio', price: 0 }]);
  const updateVariant = (id: string, patch: Partial<ProductVariant>) =>
    setVariants(variants().map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const removeVariant = (id: string) => setVariants(variants().filter((v) => v.id !== id));
  const close = () => {
    setEditing(null);
    setIsNew(false);
    setTagInput('');
  };

  const addTag = () => {
    if (!editing || !tagInput.trim()) return;
    const newTags = tagInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    const existing = editing.tags || [];
    const merged = Array.from(new Set([...existing, ...newTags]));
    setEditing({ ...editing, tags: merged });
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    if (!editing) return;
    setEditing({ ...editing, tags: (editing.tags || []).filter(t => t !== tag) });
  };

  // O admin digita em MILÍMETROS (mm), mas o armazenamento é em centímetros (cm).
  // Converte mm → cm (÷10) ao salvar no estado.
  const updatePackageDimension = (field: 'widthCm' | 'lengthCm' | 'heightCm', valueMm: string) => {
    if (!editing) return;
    const current = editing.packageDimensionsCm || { widthCm: 0, lengthCm: 0, heightCm: 0, source: 'manual' };
    const cm = (Number(valueMm) || 0) / 10; // mm → cm
    setEditing({
      ...editing,
      packageDimensionsCm: {
        ...current,
        [field]: cm,
        source: current.source || 'manual',
      },
    });
  };

  // Converte cm armazenado → mm para exibir no input. Vazio se 0.
  const dimMm = (cm?: number) => (cm && cm > 0 ? Math.round(cm * 10) : '');

  // Chama /api/product-enrich para preencher automaticamente descrição, preços e fotos.
  const handleEnrich = async () => {
    if (!editing || !editing.name.trim()) {
      toast({ title: 'Digite o nome do produto primeiro', variant: 'destructive' });
      return;
    }
    setEnriching(true);
    try {
      const res = await fetch('/api/product-enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isAdmin: true,
          productName: editing.name.trim(),
          targetLang: language || 'pt',
          markup: 1.5,
          fields: enrichFields,
          // Envia a primeira foto existente para OCR caso o nome não encontre resultado
          imageUrl: (editing.image && editing.image.startsWith('http')) ? editing.image
            : ((editing.gallery || []).find(g => g?.startsWith('http')) || undefined),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      // Mescla os dados recebidos mantendo o que o admin já preencheu manualmente
      const updatedEditing: Product = { ...editing };

      if (enrichFields.description && data.description) updatedEditing.description = data.description;
      // Traduções por idioma (pt/en/ja). Nome não entra no i18n: fica sempre em inglês.
      if (enrichFields.description && data.i18n && typeof data.i18n === 'object') {
        const currentI18n = Object.fromEntries(
          Object.entries(updatedEditing.i18n || {}).map(([lang, value]) => [
            lang,
            { description: value?.description || '' },
          ])
        ) as Product['i18n'];
        const incomingI18n = Object.fromEntries(
          Object.entries(data.i18n).map(([lang, value]: [string, any]) => [
            lang,
            { description: value?.description || '' },
          ])
        ) as Product['i18n'];
        updatedEditing.i18n = { ...currentI18n, ...incomingI18n };
      }

      // Nome final sempre em inglês; substitui inclusive quando o admin digitou japonês.
      if (data.suggestName && data.suggestName !== editing.name) {
        updatedEditing.name = data.suggestName;
      }

      // Custo e preço de venda — sempre atualiza quando a IA retorna valor
      if (data.packageDimensionsCm) {
        const dimensions = sanitizePackageDimensions(data.packageDimensionsCm);
        if (dimensions) updatedEditing.packageDimensionsCm = dimensions;
      }

      if (enrichFields.weight && data.weightGrams != null && Number(data.weightGrams) > 0) {
        updatedEditing.weightGrams = Number(data.weightGrams);
      }

      if (canPrice && enrichFields.price) {
        if (data.costYen) updatedEditing.cost = data.costYen;
        if (data.sellingPriceYen) {
          const vs = (updatedEditing.variants || []).length > 0
            ? updatedEditing.variants!
            : [{ id: 'small', label: 'Pequeno', price: 0 }];
          updatedEditing.variants = vs.map((v, i) =>
            i === 0 ? { ...v, price: data.sellingPriceYen } : v
          );
          updatedEditing.prices = { small: data.sellingPriceYen, large: data.sellingPriceYen };
        }
      }

      // Fotos do Yahoo/Rakuten — comprime para WebP antes de salvar (evita thumbnails de 6MB)
      if (enrichFields.images && Array.isArray(data.images) && data.images.length > 0) {
        const urls = [...new Set(data.images.filter(Boolean))].slice(0, MAX_PHOTOS) as string[];
        // Comprime em paralelo; fallback para URL original se CORS bloquear
        const compressed = await Promise.all(urls.map((u) => urlToCompressedDataURL(u)));
        updatedEditing.gallery = compressed;
        updatedEditing.image   = compressed[0] || updatedEditing.image;
      }

      setEditing(updatedEditing);
      const sourceLabel = data.source === 'yahoo' ? '🛒 Yahoo Shopping' : data.source === 'rakuten' ? '🛒 Rakuten' : '🤖 IA';
      const descSourceLabel =
        data.descriptionBaseSource === 'yahoo-page-description' ? 'descrição: página Yahoo + tradução IA'
        : data.descriptionBaseSource === 'yahoo-api-description' ? 'descrição: Yahoo API + tradução IA'
        : data.descriptionBaseSource === 'yahoo-headline' ? 'descrição: título/resumo Yahoo + tradução IA'
        : data.descriptionBaseSource === 'rakuten-api-description' ? 'descrição: Rakuten API + tradução IA'
        : 'descrição: gerada pela IA';
      toast({
        title: `✨ Produto enriquecido! (${sourceLabel})`,
        description: data.images?.length
          ? `${data.images.length} foto(s) · ${descSourceLabel} · custo ¥${data.costYen?.toLocaleString() || '–'} · venda ¥${data.sellingPriceYen?.toLocaleString() || '–'}`
          : `${descSourceLabel} · custo ¥${data.costYen?.toLocaleString() || '–'} · venda ¥${data.sellingPriceYen?.toLocaleString() || '–'}`,
      });
    } catch (e: any) {
      toast({ title: 'Erro ao enriquecer produto', description: e?.message, variant: 'destructive' });
    } finally {
      setEnriching(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !editing) return;
    setUploading(true);
    try {
      const current = editing.gallery ? [...editing.gallery] : [];
      for (const file of Array.from(files).slice(0, MAX_PHOTOS)) {
        if (current.length >= MAX_PHOTOS) break;
        const dataUrl = await fileToCompressedDataURL(file);
        current.push(dataUrl);
      }
      setEditing({ ...editing, gallery: current, image: current[0] || editing.image });
    } catch (e) {
      toast({ title: 'Erro ao processar imagem', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeImage = (idx: number) => {
    if (!editing) return;
    const gallery = (editing.gallery || []).filter((_, i) => i !== idx);
    setEditing({ ...editing, gallery, image: gallery[0] || '' });
  };

  // Reordenar fotos por arrastar (a primeira é sempre a capa)
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const moveImage = (from: number, to: number) => {
    if (!editing || from === to || from < 0 || to < 0) return;
    const g = [...(editing.gallery || [])];
    if (from >= g.length || to >= g.length) return;
    const [moved] = g.splice(from, 1);
    g.splice(to, 0, moved);
    setEditing({ ...editing, gallery: g, image: g[0] || '' });
  };

  // Marca uma foto como capa (move para o topo) e desativa o vídeo como capa — só um dos dois pode ser a capa.
  const setPhotoAsCover = (idx: number) => {
    if (!editing) return;
    if (idx !== 0) moveImage(idx, 0);
    setEditing((prev) => (prev ? { ...prev, videoCover: undefined } : prev));
  };

  const handleVideoFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !editing) return;
    if (!file.type.startsWith('video/')) {
      toast({ title: 'Selecione um arquivo de vídeo (mp4, webm, mov)', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast({ title: `Vídeo muito grande`, description: `Máximo ${MAX_VIDEO_MB}MB. Comprima o arquivo e tente novamente.`, variant: 'destructive' });
      return;
    }
    setUploadingVideo(true);
    try {
      const folder = `japanexpress/products/${editing.id || 'temp-' + Date.now()}`;
      const url = await cloudinaryService.uploadVideoFile(file, folder);
      setEditing((prev) => (prev ? { ...prev, video: url } : prev));
      toast({ title: '✅ Vídeo enviado' });
    } catch (e: any) {
      toast({ title: 'Erro ao enviar vídeo', description: e?.message, variant: 'destructive' });
    } finally {
      setUploadingVideo(false);
      if (videoRef.current) videoRef.current.value = '';
    }
  };

  const removeVideo = () => {
    if (!editing) return;
    setEditing({ ...editing, video: undefined, videoCover: undefined });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      toast({ title: 'Dê um nome ao produto', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const id = isNew ? slugify(editing.name) + '-' + Date.now().toString(36).slice(-4) : editing.id;
      const rawGallery = editing.gallery && editing.gallery.length > 0 ? editing.gallery : [editing.image].filter(Boolean);

      // ── Upload de imagens para Cloudinary CDN ────────────────────────────
      const folder = `japanexpress/products/${id}`;

      const toCdnUrl = async (imgStr: string): Promise<string> => {
        if (!imgStr) return '';
        if (cloudinaryService.isCloudinaryUrl(imgStr)) return imgStr;
        let dataUrl = imgStr;
        if (cloudinaryService.isExternalUrl(imgStr)) {
          dataUrl = await urlToCompressedDataURL(imgStr);
        }
        return cloudinaryService.uploadDataUrl(dataUrl, folder);
      };

      // Capa primeiro (precisamos do data URL ainda em memória para o thumb)
      const rawCover = rawGallery[0] || '';
      const coverUrl = await toCdnUrl(rawCover);

      // Thumbnail HD 1200px a partir do data URL original
      let thumbnailUrl = editing.thumbnail || '';
      const needNewThumb = rawCover && !cloudinaryService.isCloudinaryUrl(rawCover);
      if (needNewThumb) {
        const thumbData = await urlToCompressedDataURL(
          cloudinaryService.isDataUrl(rawCover) ? rawCover : coverUrl,
          1600,
          0.95
        );
        thumbnailUrl = await cloudinaryService.uploadDataUrl(thumbData, folder);
      }

      // Demais fotos da galeria
      const galleryUrls = await Promise.all(
        rawGallery.map((img, i) => i === 0 ? Promise.resolve(coverUrl) : toCdnUrl(img))
      );
      // ─────────────────────────────────────────────────────────────────────

      const cleanVariants: ProductVariant[] = (editing.variants || [])
        .filter((v) => v.label.trim() && Number(v.price) > 0)
        .map((v) => ({ id: v.id, label: v.label.trim(), price: roundYen(Number(v.price)) }));
      const priceVals = cleanVariants.map((v) => v.price);
      const small = roundYen(priceVals.length ? Math.min(...priceVals) : Number(editing.prices?.small) || 0);
      const large = roundYen(priceVals.length ? Math.max(...priceVals) : Number(editing.prices?.large) || small);
      const packageDimensionsCm = sanitizePackageDimensions(editing.packageDimensionsCm);

      // SKU único por categoria — gerado automaticamente na criação (ou se faltar ao editar)
      const sku = editing.sku?.trim() || generateUniqueSku(editing.category, products);

      const product: Product = {
        ...editing,
        id,
        sku,
        image: coverUrl || editing.image || '',
        thumbnail: thumbnailUrl || undefined,
        gallery: galleryUrls.filter(Boolean),
        cost: Number(editing.cost) || 0,
        variants: cleanVariants.length ? cleanVariants : undefined,
        prices: { small, large },
        packageDimensionsCm: packageDimensionsCm || undefined,
      };
      await productService.save(product);
      await refresh();
      toast({
        title: isNew ? '✅ Produto adicionado!' : '✅ Produto atualizado!',
        description: `${product.name} · ${product.gallery?.length ?? 0} foto(s) salva(s) no Firestore`,
      });
      close();
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Product) => {
    if (!window.confirm(`Remover "${p.name}" da loja?`)) return;
    try {
      await productService.remove(p.id);
      await refresh();
      toast({ title: '🗑️ Produto removido', description: p.name });
    } catch (e: any) {
      toast({ title: 'Erro ao remover', description: e?.message, variant: 'destructive' });
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Produtos</h2>
          <p className="text-sm text-muted-foreground">{products.length} produtos na loja</p>
        </div>
        <Button onClick={openNew} className="btn-primary rounded-xl gap-2">
          <Plus className="w-5 h-5" /> Adicionar Produto
        </Button>
      </div>

      {/* Filtros */}
      <div className="mb-6 space-y-3">
        {/* Barra de pesquisa */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar produto por nome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filtro de categoria */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFilterCat('all')}
            className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-all', filterCat === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/50')}
          >
            Todos ({products.length})
          </button>
          {CATEGORIES.map((c) => {
            const count = products.filter((p) => p.category === c.id).length;
            if (count === 0) return null;
            return (
              <button
                key={c.id}
                onClick={() => setFilterCat(filterCat === c.id ? 'all' : c.id)}
                className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-all', filterCat === c.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:border-primary/50')}
              >
                {c.icon} {c.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Resultado da busca */}
        {(searchQuery || filterCat !== 'all') && (
          <p className="text-xs text-muted-foreground">
            {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''} encontrado{filteredProducts.length !== 1 ? 's' : ''}
            {searchQuery && <> para "<strong>{searchQuery}</strong>"</>}
            {filterCat !== 'all' && <> em <strong>{CATEGORIES.find(c => c.id === filterCat)?.label}</strong></>}
          </p>
        )}
      </div>

      {/* Lista */}
      {grouped.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum produto encontrado</p>
          <button onClick={() => { setSearchQuery(''); setFilterCat('all'); }} className="text-xs text-primary hover:underline mt-1">
            Limpar filtros
          </button>
        </div>
      )}
      <div className="space-y-8">
        {grouped.map((group) => (
          <div key={group.id}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
              <span className="text-lg">{group.icon}</span> {group.label}
              <span className="text-xs font-normal">({group.items.length})</span>
            </h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map((p) => (
                  <div key={p.id} className={`bg-card border rounded-xl overflow-hidden flex shadow-sm ${p.hidden ? 'border-dashed border-gray-300 opacity-70' : 'border-border'}`}>
                    <div className="w-24 h-24 bg-secondary/40 flex-shrink-0 relative">
                      {p.image ? (
                        <img src={p.image} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}
                      {p.discountPercent ? (
                        <span className="absolute top-0 left-0 bg-red-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-br">-{p.discountPercent}%</span>
                      ) : null}
                    </div>
                    <div className="p-3 flex-1 min-w-0 flex flex-col">
                      <p className="font-semibold text-sm leading-tight line-clamp-2 flex items-center gap-1 flex-wrap">
                        {p.hidden && <span className="text-[9px] font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded shrink-0">OCULTO</span>}
                        {p.stock && !p.stock.unlimited && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${p.stock.quantity === 0 ? 'bg-red-600 text-white' : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'}`}>
                            {p.stock.quantity === 0 ? 'ESGOTADO' : `${p.stock.quantity} un.`}
                          </span>
                        )}
                        {p.promoGift && p.promoGift.buyQuantity > 0 && (
                          <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded shrink-0">🎁 PROMO</span>
                        )}
                        {p.name}
                      </p>
                      {p.sku && (
                        <p className="text-[10px] font-mono text-muted-foreground/80 tracking-wide">SKU: {p.sku}</p>
                      )}
                      {p.discountPercent ? (
                        <p className="text-xs mt-1">
                          <s className="text-gray-400">¥{p.prices.small.toLocaleString()}</s>{' '}
                          <span className="text-red-600 font-bold">¥{Math.round(p.prices.small * (1 - p.discountPercent / 100)).toLocaleString()}</span>
                        </p>
                      ) : (
                        <p className="text-xs text-primary font-bold mt-1">¥ {p.prices.small.toLocaleString()}</p>
                      )}
                      <div className="mt-auto flex gap-1 pt-2">
                        <button onClick={() => openEdit(p)} className="flex-1 text-xs py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 flex items-center justify-center gap-1">
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button onClick={() => remove(p)} className="px-2 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          </div>
        ))}
      </div>

      {/* Modal de edição */}
      {editing && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl w-full max-w-2xl h-[min(90vh,780px)] flex flex-col shadow-elevated border border-border">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border shrink-0 bg-card rounded-t-2xl">
              <h3 className="font-display text-lg sm:text-xl font-bold flex items-center gap-2">
                {isNew ? <Plus className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
                {isNew ? 'Novo Produto' : 'Editar Produto'}
              </h3>
              <button onClick={close} className="p-2 rounded-full hover:bg-secondary"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Nome + botão de enriquecimento */}
              <div>
                <label className="text-sm font-semibold block mb-1">Nome do produto</label>
                <div className="flex gap-2">
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Ex: Kit Kat Matcha, Bioré UV SPF50+"
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background"
                  />
                  <button
                    type="button"
                    onClick={handleEnrich}
                    disabled={enriching || !editing.name.trim()}
                    title="Busca descrição, fotos, preço e medidas no Yahoo/Rakuten + IA"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {enriching
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Sparkles className="w-4 h-4" />}
                    <span className="hidden sm:inline">{enriching ? 'Buscando…' : 'Auto-preencher'}</span>
                    <span className="sm:hidden">{enriching ? '…' : 'IA'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  ✨ <strong>Auto-preencher</strong>: busca descrição, preço, peso, medidas da embalagem e até 5 fotos automaticamente via Rakuten/Yahoo.
                </p>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground font-medium">Buscar:</span>
                  {([
                    { key: 'price', label: 'Valor' },
                    { key: 'images', label: 'Imagens' },
                    { key: 'description', label: 'Descrição' },
                    { key: 'weight', label: 'Peso' },
                  ] as const).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={enrichFields[key]}
                        onChange={(e) => setEnrichFields(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="w-3.5 h-3.5 rounded accent-amber-500"
                      />
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* SKU (código do produto) */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold shrink-0">SKU</span>
                <span className="text-xs font-mono px-2 py-1 rounded bg-secondary text-secondary-foreground break-all">
                  {editing.sku || (isNew ? 'Gerado automaticamente ao salvar' : '—')}
                </span>
              </div>

              {/* GTIN / JAN (código de barras para Google Merchant) */}
              <div>
                <label className="text-sm font-semibold block mb-1">Código de barras (JAN/EAN-13)</label>
                <input
                  value={editing.gtin ?? ''}
                  onChange={(e) => setEditing({ ...editing, gtin: e.target.value.trim().replace(/\D/g, '') || undefined })}
                  inputMode="numeric"
                  placeholder="Ex: 4901301234567 (13 dígitos do código de barras da embalagem)"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Com o código real, o produto passa a aparecer no Google Shopping com marca (bem casado). <strong>Sem código</strong>, o item continua elegível mas como "sem identificador". Não invente — código errado suspende a conta do Merchant.
                </p>
              </div>

              {/* Categoria + Sabor/tag */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold block mb-1">Categoria</label>
                  <div className="flex gap-2">
                    <select
                      value={editing.category}
                      onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                      className="flex-1 px-3 py-2 rounded-lg border border-border bg-background min-w-0"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddCategory}
                      title="Adicionar nova categoria"
                      className="shrink-0 px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 text-sm font-semibold"
                    >
                      <Plus className="w-4 h-4" /> Nova
                    </button>
                  </div>
                  {/* Editar/Deletar — só para categorias personalizadas */}
                  {!categoryService.isDefault(editing.category) && (
                    <div className="flex gap-2 mt-1.5">
                      <button
                        type="button"
                        onClick={handleEditCategory}
                        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> Editar categoria
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteCategory}
                        className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Deletar categoria
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1">Tag / Sabor</label>
                  <input
                    value={editing.flavor}
                    onChange={(e) => setEditing({ ...editing, flavor: e.target.value })}
                    placeholder="Ex: Matcha Kyoto"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>
              </div>

              {/* Variantes de preço (Pequeno/Médio/Grande/Kit) */}
              <div>
                <label className="text-sm font-semibold block mb-2">Tamanhos / unidades & preços (¥)</label>
                <div className="space-y-2">
                  {variants().map((v) => (
                    <div key={v.id} className="flex items-center gap-2">
                      <select
                        value={ALL_PRESETS.includes(v.label) ? v.label : 'custom'}
                        onChange={(e) => updateVariant(v.id, { label: e.target.value === 'custom' ? '' : e.target.value })}
                        disabled={!canPrice}
                        className="px-2 py-2 rounded-lg border border-border bg-background text-sm disabled:opacity-60"
                      >
                        <optgroup label="Tamanhos">
                          {VARIANT_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </optgroup>
                        <optgroup label="Unidades">
                          {UNIT_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </optgroup>
                        <option value="custom">Outro…</option>
                      </select>
                      {!ALL_PRESETS.includes(v.label) && (
                        <input
                          value={v.label}
                          onChange={(e) => updateVariant(v.id, { label: e.target.value })}
                          placeholder="Ex: Kit 3 unidades"
                          disabled={!canPrice}
                          className="w-36 px-2 py-2 rounded-lg border border-border bg-background text-sm disabled:opacity-60"
                        />
                      )}
                      <input
                        type="number"
                        value={v.price || ''}
                        onChange={(e) => updateVariant(v.id, { price: Number(e.target.value) })}
                        placeholder="¥ preço"
                        disabled={!canPrice}
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm disabled:opacity-60"
                      />
                      {variants().length > 1 && canPrice && (
                        <button onClick={() => removeVariant(v.id)} className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canPrice && (
                  <button onClick={addVariant} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                    <Plus className="w-4 h-4" /> Adicionar opção
                  </button>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {canPrice ? 'Preços em ienes (¥). O site converte automático para R$/€. O cliente escolhe o tamanho na página do produto.' : '🔒 Preço/custo só podem ser alterados por admin nível 3.'}
                </p>
              </div>

              {/* Desconto promocional + Ocultar */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-3">
                  <label className="text-sm font-semibold block mb-1 flex items-center gap-1.5">🏷️ Desconto (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={editing.discountPercent || ''}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(99, Number(e.target.value) || 0));
                      setEditing({ ...editing, discountPercent: v });
                    }}
                    placeholder="0 = sem promoção"
                    disabled={!canPrice}
                    className="w-full px-3 py-2 rounded-lg border border-red-300 bg-background disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {editing.discountPercent && variants()[0]?.price ? (
                    <p className="text-xs text-red-700 dark:text-red-300 mt-1.5">
                      De <s>¥{variants()[0].price.toLocaleString()}</s> por <strong>¥{Math.round(variants()[0].price * (1 - editing.discountPercent / 100)).toLocaleString()}</strong> ({variants()[0].label})
                    </p>
                  ) : (
                    <p className="text-[11px] text-red-600/70 mt-1.5">Mostra a tag de promoção no produto.</p>
                  )}
                </div>

                <div className="bg-secondary/40 border border-border rounded-lg p-3 flex flex-col justify-center">
                  <label className="text-sm font-semibold block mb-2 flex items-center gap-1.5">👁️ Publicação</label>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, hidden: !editing.hidden })}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                      editing.hidden
                        ? 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300'
                        : 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-300'
                    }`}
                  >
                    <span>{editing.hidden ? '🙈 Oculto (não aparece)' : '✅ Publicado na loja'}</span>
                    <span className={`w-9 h-5 rounded-full relative transition-colors ${editing.hidden ? 'bg-gray-400' : 'bg-green-500'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${editing.hidden ? 'left-0.5' : 'left-4'}`} />
                    </span>
                  </button>
                  <p className="text-[11px] text-muted-foreground mt-1.5">Oculto = fica registrado, mas o cliente não vê.</p>
                </div>

                {/* Em Destaque na home */}
                <div className="bg-secondary/40 border border-border rounded-lg p-3 flex flex-col justify-center col-span-2">
                  <label className="text-sm font-semibold block mb-2 flex items-center gap-1.5">⭐ Em Destaque na Página Inicial</label>
                  <button
                    type="button"
                    onClick={() => {
                      const turningOn = !editing.featured;
                      setEditing({
                        ...editing,
                        featured: turningOn,
                        featuredAt: turningOn ? (editing.featuredAt || new Date().toISOString()) : undefined,
                      });
                    }}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                      editing.featured
                        ? 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300'
                    }`}
                  >
                    <span>{editing.featured ? '⭐ Em destaque' : '☆ Sem destaque'}</span>
                    <span className={`w-9 h-5 rounded-full relative transition-colors ${editing.featured ? 'bg-amber-500' : 'bg-gray-400'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${editing.featured ? 'left-4' : 'left-0.5'}`} />
                    </span>
                  </button>
                  {(() => {
                    const featuredCount = products.filter(p => p.featured && p.id !== editing.id).length + (editing.featured ? 1 : 0);
                    if (featuredCount > 4) {
                      return (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1.5 leading-snug">
                          ⚠️ {featuredCount} produtos em destaque. A home mostra <strong>4 por vez</strong> e alterna automaticamente <strong>a cada semana</strong>, dando vez aos próximos.
                        </p>
                      );
                    }
                    return (
                      <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                        {featuredCount}/4 em destaque. Aparece na seção "Em Destaque" da home. Acima de 4, alternam semanalmente.
                      </p>
                    );
                  })()}
                </div>

                {/* Hero Carrossel (topo da home) */}
                <div className="bg-secondary/40 border border-border rounded-lg p-3 flex flex-col justify-center col-span-2">
                  <label className="text-sm font-semibold block mb-2 flex items-center gap-1.5">🎬 Hero Carrossel (topo da home)</label>
                  <button
                    type="button"
                    onClick={() => {
                      const turningOn = !editing.heroCarousel;
                      setEditing({
                        ...editing,
                        heroCarousel: turningOn,
                        heroCarouselAt: turningOn ? (editing.heroCarouselAt || new Date().toISOString()) : undefined,
                      });
                    }}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                      editing.heroCarousel
                        ? 'bg-rose-100 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border-rose-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300'
                    }`}
                  >
                    <span>{editing.heroCarousel ? '🎬 No hero' : '☆ Fora do hero'}</span>
                    <span className={`w-9 h-5 rounded-full relative transition-colors ${editing.heroCarousel ? 'bg-rose-500' : 'bg-gray-400'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${editing.heroCarousel ? 'left-4' : 'left-0.5'}`} />
                    </span>
                  </button>
                  {(() => {
                    const heroCount = products.filter(p => p.heroCarousel && p.id !== editing.id).length + (editing.heroCarousel ? 1 : 0);
                    return (
                      <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                        {heroCount === 0
                          ? 'O hero mostra a curadoria fixa padrão quando nada está marcado.'
                          : <>{heroCount} marcado(s). O hero exibe <strong>4 por vez</strong> + a <strong>promoção de início</strong> (sempre). Acima de 4, <strong>sorteia 4 diferentes</strong> a cada visita, sem repetir.</>}
                      </p>
                    );
                  })()}
                </div>

                {/* Restrição de destino + Origem */}
                <div className="space-y-2">
                  <label className="text-sm font-semibold block">Restrição de venda por destino</label>
                  <select
                    value={editing.deliveryRestrict || ''}
                    onChange={e => setEditing({ ...editing, deliveryRestrict: (e.target.value as any) || undefined })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  >
                    <option value="">Sem restrição (vende em qualquer destino)</option>
                    <option value="exterior-only">🌍 Somente exterior — produto japonês, não vende dentro do Japão</option>
                    <option value="japan-only">🇯🇵 Somente Japão — produto importado, vende só dentro do Japão</option>
                  </select>
                  <div className="flex items-center gap-2 mt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input
                        type="checkbox"
                        checked={!!editing.origin}
                        onChange={e => setEditing({ ...editing, origin: e.target.checked ? 'importado' : undefined })}
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <span>📦 Marcar como <strong>Importado</strong> (produto nacional vendido no Japão — exibe badge na loja)</span>
                    </label>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input
                        type="checkbox"
                        checked={!!editing.noPsFee}
                        onChange={e => setEditing({ ...editing, noPsFee: e.target.checked || undefined })}
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <span>💸 <strong>Isentar taxa de Personal Shopper</strong> (¥1.000/un — não cobra essa taxa neste produto)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Tags de tipo — usadas no filtro inteligente da loja */}
              <div>
                <label className="text-sm font-semibold block mb-1">
                  🏷️ Tags de tipo <span className="text-xs font-normal text-muted-foreground">(filtro inteligente da loja)</span>
                </label>
                {(editing?.tags || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(editing!.tags || []).map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold capitalize">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { addTag(); e.preventDefault(); } }}
                    placeholder="Ex: shampoo, hidratante, filtro solar"
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    disabled={!tagInput.trim()}
                    className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/70 text-sm font-semibold disabled:opacity-40"
                  >
                    + Adicionar
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Separe por vírgula. Ex: <em>shampoo · hidratante · filtro solar · protetor labial</em></p>
              </div>

              {/* Lançamento + Quantidade vendida */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                  <label className="text-sm font-semibold block mb-2">🆕 Lançamento</label>
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing!, isNew: !editing!.isNew })}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm font-semibold w-full transition-colors ${
                      editing?.isNew
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300'
                        : 'bg-card text-muted-foreground border-border'
                    }`}
                  >
                    <span>{editing?.isNew ? '✅ É lançamento' : 'Produto comum'}</span>
                    <span className={`w-9 h-5 rounded-full relative transition-colors ${editing?.isNew ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${editing?.isNew ? 'left-4' : 'left-0.5'}`} />
                    </span>
                  </button>
                  <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70 mt-1.5">Aparece em destaque no filtro "Lançamento".</p>
                </div>

                <div className="bg-secondary/40 border border-border rounded-lg p-3">
                  <label className="text-sm font-semibold block mb-1">📊 Qtd. vendida</label>
                  <input
                    type="number"
                    min={0}
                    value={editing?.salesCount ?? ''}
                    onChange={e => setEditing({ ...editing!, salesCount: Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">Usado no filtro "Mais Vendidos".</p>
                </div>

                <div className="bg-secondary/40 border border-border rounded-lg p-3">
                  <label className="text-sm font-semibold block mb-1">⭐ Avaliação (1–5)</label>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={editing?.rating ?? ''}
                    onChange={e => {
                      const raw = e.target.value;
                      const n = raw === '' ? undefined : Math.min(5, Math.max(0, Number(raw)));
                      setEditing({ ...editing!, rating: n });
                    }}
                    placeholder="Ex: 4.8"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">Deixe vazio para não mostrar estrelas na loja.</p>
                </div>
              </div>

              {/* Estoque */}
              <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                <label className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                  <Infinity className="w-4 h-4 text-slate-500" /> Estoque
                </label>
                <div className="flex gap-4 mb-3">
                  {(['unlimited', 'limited'] as const).map((type) => {
                    const isUnlimited = type === 'unlimited';
                    const checked = isUnlimited ? (!editing.stock || editing.stock.unlimited) : (editing.stock && !editing.stock.unlimited);
                    return (
                      <label key={type} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name="stockType"
                          checked={!!checked}
                          onChange={() => setEditing({ ...editing, stock: { unlimited: isUnlimited, quantity: editing.stock?.quantity || 0 } })}
                          className="accent-primary"
                        />
                        <span className="text-sm font-medium">{isUnlimited ? 'Ilimitado' : 'Quantidade específica'}</span>
                      </label>
                    );
                  })}
                </div>
                {editing.stock && !editing.stock.unlimited && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={editing.stock.quantity}
                      onChange={(e) => setEditing({ ...editing, stock: { unlimited: false, quantity: Math.max(0, Number(e.target.value) || 0) } })}
                      placeholder="Ex: 25"
                      className="w-28 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                    <span className="text-xs text-muted-foreground">unidades em estoque</span>
                    {editing.stock.quantity === 0 && (
                      <span className="text-[11px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">ESGOTADO — aparecerá Sold Out</span>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  A cada venda confirmada o estoque é descontado automaticamente. Ao chegar a zero aparece tarja "Sold Out".
                </p>
              </div>

              {/* Promoção: Compre X, ganhe +1 deste mesmo produto grátis */}
              <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 space-y-3">
                <label className="text-sm font-semibold flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-purple-500" /> Promoção: Compre X, ganhe +1 grátis
                </label>

                {/* Produto que será dado = sempre este mesmo */}
                <div className="flex items-center gap-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg px-3 py-2">
                  {editing.image && <img src={editing.image} alt={editing.name} className="w-8 h-8 rounded object-cover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-purple-800 dark:text-purple-200 truncate">{editing.name || '(nome do produto)'}</p>
                    <p className="text-[10px] text-purple-600">Este produto será o brinde</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Compre quantos para ganhar +1? (0 = sem promo)</label>
                    <input
                      type="number"
                      min={0}
                      value={editing.promoGift?.buyQuantity ?? 0}
                      onChange={(e) => {
                        const qty = Number(e.target.value) || 0;
                        setEditing({ ...editing, promoGift: qty > 0
                          ? { buyQuantity: qty, giftProductId: editing.id, giftProductName: editing.name, minOrderValueYen: editing.promoGift?.minOrderValueYen }
                          : undefined });
                      }}
                      placeholder="Ex: 2"
                      className="w-24 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    />
                  </div>

                  {editing.promoGift && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Gasto mínimo no carrinho (¥) — 0 = sem mínimo</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="number"
                          min={0}
                          value={editing.promoGift.minOrderValueYen ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setEditing({ ...editing, promoGift: { ...editing.promoGift!, minOrderValueYen: val > 0 ? val : undefined } });
                          }}
                          placeholder="Ex: 3000"
                          className="w-32 px-3 py-2 rounded-lg border border-border bg-background text-sm"
                        />
                        {(editing.promoGift.minOrderValueYen ?? 0) > 0 && (
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            ≈ <strong>{formatPrice(fxConvertYen(editing.promoGift.minOrderValueYen!, 'BRL'), 'BRL')}</strong>
                            {' · '}
                            <strong>{formatPrice(fxConvertYen(editing.promoGift.minOrderValueYen!, 'EUR'), 'EUR')}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {editing.promoGift && editing.promoGift.buyQuantity > 0 && (
                  <p className="text-[11px] text-purple-700 dark:text-purple-300">
                    🎁 Compre {editing.promoGift.buyQuantity}x
                    {editing.promoGift.minOrderValueYen ? ` (ou gaste ¥${editing.promoGift.minOrderValueYen.toLocaleString()} no total)` : ''}
                    {' '}→ ganhe +1 <strong>{editing.name || 'este produto'}</strong> grátis
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">0 = sem promoção ativa.</p>
              </div>

              {/* Custo + margem de lucro — SÓ ADMIN */}
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <label className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                  🔒 Custo & Margem <span className="text-[10px] font-normal text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">interno</span>
                </label>

                <div className="flex items-center gap-2">
                  {/* Custo de aquisição */}
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] text-muted-foreground">Custo (¥)</span>
                    <input
                      type="number"
                      value={editing.cost || ''}
                      onChange={(e) => {
                        const cost = Number(e.target.value);
                        if (marginPct > 0 && cost > 0) {
                          const selling = Math.round(cost * (1 + marginPct / 100));
                          const vs = variants().map((v, i) => i === 0 ? { ...v, price: selling } : v);
                          setEditing({ ...editing, cost, variants: vs, prices: { ...editing.prices, small: selling } });
                        } else {
                          setEditing({ ...editing, cost });
                        }
                      }}
                      placeholder="ex: 500"
                      disabled={!canPrice}
                      className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-background disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                    />
                  </div>

                  {/* Preço de venda calculado */}
                  <div className="shrink-0">
                    <span className="text-[11px] text-muted-foreground">Venda (¥)</span>
                    <div className={`px-3 py-2 rounded-lg border text-sm font-semibold min-w-[80px] text-center ${
                      editing.cost && marginPct > 0
                        ? 'border-green-300 bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400'
                        : 'border-border bg-muted text-muted-foreground'
                    }`}>
                      {editing.cost && marginPct > 0
                        ? `¥${Math.round(editing.cost * (1 + marginPct / 100)).toLocaleString()}`
                        : '—'}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1.5">
                  {editing.cost
                    ? `Lucro: ¥${Math.round(editing.cost).toLocaleString()} · markup fixo 100% · O cliente NUNCA vê o custo.`
                    : 'Preencha o custo para calcular o preço de venda automaticamente.'}
                </p>
              </div>

              <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-lg p-3">
                <label className="text-sm font-semibold block mb-2">
                  Medidas da embalagem para frete (mm)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[11px] text-muted-foreground">Largura (mm)</span>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={dimMm(editing.packageDimensionsCm?.widthCm)}
                      onChange={(e) => updatePackageDimension('widthCm', e.target.value)}
                      placeholder="ex: 54"
                      className="w-full px-3 py-2 rounded-lg border border-orange-200 bg-background text-sm"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">Comprimento (mm)</span>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={dimMm(editing.packageDimensionsCm?.lengthCm)}
                      onChange={(e) => updatePackageDimension('lengthCm', e.target.value)}
                      placeholder="ex: 84"
                      className="w-full px-3 py-2 rounded-lg border border-orange-200 bg-background text-sm"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground">Altura (mm)</span>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={dimMm(editing.packageDimensionsCm?.heightCm)}
                      onChange={(e) => updatePackageDimension('heightCm', e.target.value)}
                      placeholder="ex: 192"
                      className="w-full px-3 py-2 rounded-lg border border-orange-200 bg-background text-sm"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-orange-700 dark:text-orange-300 mt-2 leading-relaxed">
                  Digite em <strong>milímetros</strong> (ex: 54 × 84 × 192 mm). O frete soma +{PACKAGE_SAFETY_MARGIN_CM}cm de margem. Fonte: {editing.packageDimensionsCm?.source || 'manual/nao informado'}.
                </p>
                <div className="mt-3">
                  <span className="text-[11px] text-muted-foreground">Peso da embalagem (g)</span>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={editing.weightGrams ?? ''}
                    onChange={(e) => setEditing({ ...editing, weightGrams: e.target.value === '' ? undefined : Number(e.target.value) })}
                    placeholder="ex: 500"
                    className="w-full px-3 py-2 rounded-lg border border-orange-200 bg-background text-sm mt-1"
                  />
                  <p className="text-[11px] text-orange-700 dark:text-orange-300 mt-1">
                    Peso do produto (sem embalagem). O sistema soma 200 g de embalagem no cálculo do frete para produtos abaixo de 2 kg.
                  </p>
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="text-sm font-semibold block mb-1">Descrição</label>
                <textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={4}
                  placeholder="Descreva o produto..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background resize-y"
                />
              </div>

              {/* Fotos */}
              <div>
                <label className="text-sm font-semibold block mb-1">Fotos (até {MAX_PHOTOS}) — arraste para reordenar</label>
                <div className="flex flex-wrap gap-3">
                  {(editing.gallery || []).map((img, idx) => (
                    <div
                      key={idx}
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) moveImage(dragIndex, idx); setDragIndex(null); }}
                      onDragEnd={() => setDragIndex(null)}
                      className={cn(
                        "relative w-20 h-20 rounded-lg overflow-hidden border-2 group cursor-grab active:cursor-grabbing transition-all",
                        dragIndex === idx ? "border-primary opacity-50 scale-95" : "border-border"
                      )}
                      title="Arraste para reordenar"
                    >
                      <img src={img} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover pointer-events-none" />
                      {idx === 0 ? (
                        <span className={cn(
                          "absolute top-0 left-0 text-[9px] px-1 rounded-br font-bold",
                          editing.videoCover ? "bg-black/50 text-white" : "bg-primary text-primary-foreground"
                        )}>
                          {editing.videoCover ? 'Poster' : 'Capa'}
                        </span>
                      ) : (
                        <span className="absolute top-0 left-0 bg-black/50 text-white text-[9px] px-1 rounded-br">{idx + 1}</span>
                      )}
                      <span className="absolute bottom-0.5 left-0.5 bg-black/50 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition">
                        <GripVertical className="w-3 h-3" />
                      </span>
                      {(idx !== 0 || editing.videoCover) && (
                        <button
                          type="button"
                          onClick={() => setPhotoAsCover(idx)}
                          title="Usar esta foto como capa"
                          className="absolute bottom-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                        >
                          <Star className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => removeImage(idx)}
                        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {(editing.gallery?.length || 0) < MAX_PHOTOS && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition"
                    >
                      {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-6 h-6" />}
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
                <p className="text-xs text-muted-foreground mt-1">
                  🖱️ Arraste para reordenar — a <strong>primeira é a capa</strong>. Passe o mouse e clique na <Star className="w-3 h-3 inline -mt-0.5" /> de outra foto para torná-la a capa. As imagens são reduzidas automaticamente.
                </p>
              </div>

              {/* Vídeo do produto */}
              <div>
                <label className="text-sm font-semibold block mb-1">Vídeo do produto (opcional, mp4)</label>
                {editing.video ? (
                  <div className="flex items-start gap-3">
                    <video
                      src={editing.video}
                      controls
                      muted
                      playsInline
                      className="w-40 h-40 rounded-lg border border-border object-cover bg-black"
                    />
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                        <input
                          type="checkbox"
                          checked={!!editing.videoCover}
                          onChange={(e) => setEditing({ ...editing, videoCover: e.target.checked || undefined })}
                          className="w-4 h-4 rounded accent-primary"
                        />
                        <span>🎬 <strong>Usar vídeo como capa</strong></span>
                      </label>
                      <p className="text-[11px] text-muted-foreground -mt-1 max-w-[220px]">
                        {editing.videoCover
                          ? 'O vídeo toca direto no card e na galeria — a 1ª foto vira o poster (thumbnail).'
                          : 'Sem isso, o vídeo só toca ao passar o mouse sobre o produto.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => videoRef.current?.click()}
                        disabled={uploadingVideo}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 flex items-center gap-1.5"
                      >
                        {uploadingVideo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Trocar vídeo
                      </button>
                      <button
                        type="button"
                        onClick={removeVideo}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remover vídeo
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => videoRef.current?.click()}
                    disabled={uploadingVideo}
                    className="w-40 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition text-sm font-semibold"
                  >
                    {uploadingVideo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    {uploadingVideo ? 'Enviando…' : 'Adicionar vídeo'}
                  </button>
                )}
                <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => handleVideoFile(e.target.files)} />
                <p className="text-xs text-muted-foreground mt-1">🎬 Mostrado ao passar o mouse sobre o produto na loja (hover). Máximo {MAX_VIDEO_MB}MB.</p>
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-border flex justify-end gap-3 shrink-0 bg-card rounded-b-2xl">
              <Button variant="outline" onClick={close} className="rounded-xl">Cancelar</Button>
              <Button onClick={save} disabled={saving} className="btn-primary rounded-xl gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {products.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <PackageOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
          Nenhum produto. Clique em "Adicionar Produto" para começar.
        </div>
      )}
    </div>
  );
};

export default ProductManager;
