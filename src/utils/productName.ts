import { Product } from '@/types';
import { products as baseProducts } from '@/data/products';

const hasJapanese = (s: string) => /[぀-ヿ㐀-鿿]/.test(s || '');

const stripAccents = (s: string) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const hasPortugueseProductWords = (s: string) => {
  const n = stripAccents(s).toLowerCase();
  return /\b(limpeza|profunda|protetor|solar|locao|hidratante|oleo|sabonete|creme|essencia|clareador|maquiagem|acido|hialuronico|vitamina|pele|cabelo)\b/.test(n);
};

const knownEnglishName = (p: Product): string => {
  const base = baseProducts.find((item) => item.id === p.id)?.name || '';
  if (base) return base;

  const text = `${p.name || ''} ${p.description || ''} ${p.flavor || ''}`;
  const normalized = stripAccents(text).toLowerCase();

  if (/肌ラボ|ハダラボ/.test(text) || /hada\s*labo|gokujyun|gokujun/.test(normalized)) {
    if (/premium|プレミアム/.test(text) || /premium/.test(normalized)) {
      return 'Hada Labo Gokujyun Premium Hyaluronic Acid Lotion';
    }
    return 'Hada Labo Gokujyun Hyaluronic Acid Lotion';
  }

  if (/ビオレ/.test(text) || /biore/.test(normalized)) {
    if (/ウォータリーエッセンス/.test(text) || /watery\s*essence/.test(normalized)) {
      return 'Biore UV Aqua Rich Watery Essence';
    }
    if (/ライトアップエッセンス/.test(text) || /light\s*up/.test(normalized)) {
      return 'Biore UV Aqua Rich Light Up Essence';
    }
    return 'Biore UV Aqua Rich';
  }

  if (/dhc/i.test(text) && (/ディープクレンジング|クレンジングオイル/.test(text) || /deep\s*cleansing|limpeza\s*profunda|cleansing\s*oil/.test(normalized))) {
    return 'DHC Deep Cleansing Oil';
  }

  if (/メラノcc/.test(text) || /melano\s*cc/.test(normalized)) return 'Melano CC Vitamin C Brightening Essence';
  if (/専科/.test(text) || /senka|shiseido/.test(normalized)) return 'Shiseido Senka';
  if (/キットカット/.test(text) || /kit\s*kat|kitkat/.test(normalized)) {
    if (/抹茶/.test(text) || /matcha|green\s*tea/.test(normalized)) return 'Nestle KitKat Matcha Green Tea';
    return 'Nestle KitKat';
  }
  if (/ソフティモ/.test(text) || /softymo|kose/.test(normalized)) return 'Kose Softymo Speedy Cleansing Oil';

  return '';
};

export const productEnglishName = (p: Product): string => {
  const current = p.name || '';
  const known = knownEnglishName(p);

  if (known && (hasJapanese(current) || hasPortugueseProductWords(current))) return known;
  if (!current && known) return known;
  return current || known || p.id;
};
