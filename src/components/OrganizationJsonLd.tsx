import { useEffect } from 'react';
import { COMPANY_PROFILE } from '@/config/companyProfile';

const SITE_URL = 'https://www.nikkeybox-store.com';

/**
 * Injeta Schema.org Organization no <head>, uma única vez, em toda página
 * (montado no Layout). O Google usa isso para o painel de conhecimento e
 * para vincular os perfis sociais à marca na busca. Mesmo padrão de
 * criar/reusar <script id> + remover no cleanup usado em ProductJsonLd.
 */
const OrganizationJsonLd: React.FC = () => {
  useEffect(() => {
    const jsonLd = {
      '@context': 'https://schema.org/',
      '@type': 'Organization',
      name: COMPANY_PROFILE.brand,
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512x512.png`,
      // Perfis sociais em "teste" temporariamente — trocar antes de publicar.
      sameAs: [
        'https://www.instagram.com/teste/',
        'https://www.facebook.com/teste',
        'https://www.tiktok.com/@teste',
        'https://x.com/teste',
      ],
      address: {
        '@type': 'PostalAddress',
        streetAddress: COMPANY_PROFILE.fulfillmentOrigin.addressLine1,
        addressLocality: COMPANY_PROFILE.fulfillmentOrigin.city,
        postalCode: COMPANY_PROFILE.fulfillmentOrigin.postalCode,
        addressRegion: COMPANY_PROFILE.fulfillmentOrigin.prefecture,
        addressCountry: COMPANY_PROFILE.fulfillmentOrigin.country,
      },
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'Customer Support',
        email: COMPANY_PROFILE.email,
        telephone: COMPANY_PROFILE.whatsapp.international,
      },
    };

    const scriptId = 'organization-jsonld';
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
  }, []);

  return null;
};

export default OrganizationJsonLd;
