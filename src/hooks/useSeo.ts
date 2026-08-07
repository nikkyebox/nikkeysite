import { useEffect } from 'react';

export interface SeoOptions {
  /** Título da aba/guia. Se vazio, o hook não faz nada (página trata por outro lugar). */
  title?: string;
  description?: string;
  image?: string;
  canonicalPath?: string;
  type?: 'website' | 'product' | 'article';
}

const SITE_ORIGIN = 'https://nikkeybox-store.com';
const DEFAULT_OG_IMAGE = '/icons/icon-512x512.png?v=2';

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * Define título, descrição, Open Graph e canonical de forma dinâmica por página.
 * Restaura o título anterior ao desmontar (evita título "preso" entre navegações).
 * Antes cada página exibia o mesmo <title> — péssimo para SEO.
 */
export function useSeo({ title, description, image, canonicalPath, type = 'website' }: SeoOptions) {
  useEffect(() => {
    if (!title) return; // nada a fazer — a rota é tratada por outra página

    const prevTitle = document.title;
    document.title = title;

    if (description) {
      upsertMeta('name', 'description', description);
      upsertMeta('property', 'og:description', description);
      upsertMeta('name', 'twitter:description', description);
    }

    upsertMeta('property', 'og:title', title);
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('property', 'og:type', type);

    const img = image
      ? image.startsWith('http') ? image : `${SITE_ORIGIN}${image}`
      : `${SITE_ORIGIN}${DEFAULT_OG_IMAGE}`;
    upsertMeta('property', 'og:image', img);

    // Canonical por página (evita conteúdo duplicado aos olhos do Google)
    const href = `${SITE_ORIGIN}${canonicalPath ?? window.location.pathname}`;
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = href;

    return () => {
      document.title = prevTitle;
    };
  }, [title, description, image, canonicalPath, type]);
}
