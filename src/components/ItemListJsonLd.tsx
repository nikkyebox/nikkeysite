import { useEffect } from 'react';
import type { Product } from '@/types';

const SITE_URL = 'https://www.nikkeybox-store.com';

interface Props {
  products: Product[];
}

/**
 * Injeta Schema.org ItemList no <head> para a página de listagem/catálogo.
 * Reage à lista exibida (filtro/busca/paginação) — reinjeta sempre que os
 * produtos visíveis mudam. Mesmo padrão de ProductJsonLd/OrganizationJsonLd.
 */
const ItemListJsonLd: React.FC<Props> = ({ products }) => {
  // Chave estável derivada dos ids na ordem exibida — muda quando filtro,
  // busca ou paginação alteram a lista, mesmo com a mesma quantidade de itens.
  const key = products.map((p) => p.id).join(',');

  useEffect(() => {
    if (products.length === 0) return;

    const jsonLd = {
      '@context': 'https://schema.org/',
      '@type': 'ItemList',
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}/produto/${product.id}`,
        name: product.name,
      })),
    };

    const scriptId = 'itemlist-jsonld';
    let el = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.id = scriptId;
      el.type = 'application/ld+json';
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(jsonLd);

    return () => {
      document.getElementById(scriptId)?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
};

export default ItemListJsonLd;
