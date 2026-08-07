import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { safeStorage } from '@/utils/storage';

// Extrai o productId de rotas como /produto/:id ou /produto/:id?ref=CODE
const extractProductId = (pathname: string): string | null => {
  const match = pathname.match(/^\/produto\/([^/?#]+)/);
  return match ? match[1] : null;
};

const ScrollToTop = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Captura o código de indicação do link (?ref=CODE) e guarda para o checkout.
  // Se vier de uma página de produto específico, salva também o productId para
  // que a verificação anti-fraude saiba que é um cupom de produto (não genérico).
  useEffect(() => {
    const params = new URLSearchParams(search);
    const ref = params.get('ref');
    if (ref) {
      safeStorage.setItem('affiliate_ref', ref.trim().toUpperCase());
      const productId = extractProductId(pathname);
      if (productId) {
        // Cupom vinculado a produto específico — CPF pode recomprar com este cupom
        safeStorage.setItem('affiliate_ref_product', productId);
      } else {
        // Cupom genérico — só vale na 1ª compra por CPF
        safeStorage.removeItem('affiliate_ref_product');
      }
    }
    // Código de campanha promocional (?promo=CODE) vindo do e-mail/push —
    // armado para o carrinho aplicar a oferta (desconto/brinde/pontos).
    const promo = params.get('promo');
    if (promo) {
      safeStorage.setItem('pending_promo', promo.trim().toUpperCase());
    }
  }, [search, pathname]);

  return null;
};

export default ScrollToTop;
