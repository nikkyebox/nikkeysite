import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, ShoppingCart, Trash2, ArrowLeft } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useUser } from '@/context/UserContext';
import { useCart } from '@/context/CartContext';
import { wishlistService, WishlistItem } from '@/services/wishlistService';
import { useProducts } from '@/context/ProductsContext';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/context/LanguageContext';
import { formatPrice, getCurrencyByCountry } from '@/utils/currency';
import { convertYen as fxConvert } from '@/services/fxService';
import { productEnglishName } from '@/utils/productName';

const Wishlist: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, authReady } = useUser();
  const { products } = useProducts();
  const { addToCart } = useCart();
  const { selectedCountry, t } = useLanguage();
  const { toast } = useToast();
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);

  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) {
      navigate('/cadastro');
      return;
    }

    loadWishlist();
  }, [isAuthenticated, authReady, navigate, user]);

  const loadWishlist = () => {
    if (user?.email) {
      const items = wishlistService.getWishlist(user.email);
      setWishlistItems(items);
    }
  };

  const handleRemove = (productId: string) => {
    if (!user?.email) return;

    const success = wishlistService.removeFromWishlist(user.email, productId);
    
    if (success) {
      loadWishlist();
      toast({
        title: "Removido dos favoritos",
        description: "Produto removido da sua lista de desejos",
      });
    }
  };

  const handleAddToCart = (productId: string) => {
    const product = products.find(p => p.id === productId);
    
    if (product) {
      addToCart(product, 'small', 1);
      toast({
        title: "Adicionado ao carrinho!",
        description: `${productEnglishName(product)} (Pequeno) adicionado`,
      });
    }
  };

  const handleClearAll = () => {
    if (!user?.email) return;

    if (!confirm('Deseja remover todos os produtos da lista de desejos?')) {
      return;
    }

    const success = wishlistService.clearWishlist(user.email);
    
    if (success) {
      loadWishlist();
      toast({
        title: "Lista limpa!",
        description: "Todos os produtos foram removidos",
      });
    }
  };

  if (!user) {
    return null;
  }

  return (
    <Layout>
      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <Button
              variant="ghost"
              onClick={() => navigate('/produtos')}
              className="mb-4 gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('productDetail.back')}
            </Button>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900 mb-4">
                <Heart className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
                {t('wishlist.title')}
              </h1>
              <p className="text-muted-foreground text-lg">
                {wishlistItems.length} {wishlistItems.length === 1 ? t('wishlist.saved') : t('wishlist.saved_plural')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {wishlistItems.length > 0 ? (
              <>
                <div className="flex justify-end mb-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearAll}
                    className="gap-2 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t('wishlist.clear')}
                  </Button>
                </div>

                <div className="space-y-4">
                  {wishlistItems.map((item) => {
                    const product = products.find((p) => p.id === item.productId);
                    const displayName = product ? productEnglishName(product) : item.productName;
                    return (
                    <div
                      key={item.productId}
                      className="bg-card rounded-xl border border-border p-4 hover:shadow-lg transition-shadow"
                    >
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="relative w-full sm:w-32 h-32 rounded-lg overflow-hidden bg-secondary flex-shrink-0">
                          <img
                            src={item.productImage}
                            alt={displayName}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 flex flex-col justify-between">
                          <div>
                            <h3 className="font-semibold text-lg mb-1">
                              {displayName}
                            </h3>
                            <p className="text-primary font-bold text-xl mb-2">
                              {(() => {
                                const cur = getCurrencyByCountry(selectedCountry);
                                return formatPrice(fxConvert(item.productPrice, cur), cur);
                              })()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Adicionado em {new Date(item.addedAt).toLocaleDateString('pt-BR')}
                            </p>
                          </div>

                          <div className="flex gap-2 mt-4">
                            <Button
                              onClick={() => handleAddToCart(item.productId)}
                              className="flex-1 gap-2"
                            >
                              <ShoppingCart className="w-4 h-4" />
                              {t('product.addToCart')}
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleRemove(item.productId)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                </div>

                <div className="mt-8 text-center">
                  <Button
                    onClick={() => navigate('/produtos')}
                    variant="outline"
                    size="lg"
                    className="gap-2"
                  >
                    {t('wishlist.continueShopping')}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-secondary mb-6">
                  <Heart className="w-12 h-12 text-muted-foreground" />
                </div>
                <h2 className="font-display text-2xl font-bold mb-4">
                  {t('wishlist.empty')}
                </h2>
                <p className="text-muted-foreground mb-8">
                  {t('wishlist.emptyDesc')}
                </p>
                <Button
                  onClick={() => navigate('/produtos')}
                  size="lg"
                  className="gap-2"
                >
                  {t('wishlist.explore')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default Wishlist;
