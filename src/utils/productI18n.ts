import { Product } from '@/types';

// Só a descrição do produto é traduzida. O nome fica no idioma original salvo.
export const i18nDesc = (p: Product, lang: string): string | undefined =>
  p.i18n?.[lang]?.description || p.i18n?.pt?.description || p.description;
