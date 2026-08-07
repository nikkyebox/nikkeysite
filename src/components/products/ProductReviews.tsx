import React, { useState, useEffect } from 'react';
import { Star, Video, PlayCircle, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUser } from '@/context/UserContext';
import { reviewService } from '@/services/reviewService';
import { Review, ProductRating } from '@/types/review';
import { cn } from '@/lib/utils';

// Converte um link de vídeo (YouTube) em URL embutível; senão devolve null.
function getYouTubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

interface ProductReviewsProps {
  productId: string;
  productName: string;
}

// Página do produto: SOMENTE LEITURA das avaliações.
// A avaliação é feita pelo cliente no histórico de pedidos (só quem comprou avalia).
const ProductReviews: React.FC<ProductReviewsProps> = ({ productId }) => {
  const { isAuthenticated } = useUser();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState<ProductRating | null>(null);

  useEffect(() => {
    setReviews(reviewService.getProductReviews(productId));
    setRating(reviewService.getProductRating(productId));
  }, [productId]);

  const renderStars = (value: number, size: 'sm' | 'md' | 'lg' = 'md') => {
    const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6';
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star key={star} className={cn(sizeClass, star <= value ? 'fill-gold text-gold' : 'text-gray-300')} />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Resumo das notas */}
      {rating && rating.totalReviews > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-start gap-6">
            <div className="text-center">
              <div className="text-5xl font-bold text-foreground">{rating.averageRating.toFixed(1)}</div>
              {renderStars(Math.round(rating.averageRating), 'lg')}
              <p className="text-sm text-muted-foreground mt-2">{rating.totalReviews} avaliações</p>
            </div>
            <div className="flex-1 space-y-2">
              {[5, 4, 3, 2, 1].map((star) => (
                <div key={star} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-12">{star} {renderStars(star, 'sm')}</span>
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-gold"
                      style={{ width: `${(rating.ratings[star as keyof typeof rating.ratings] / rating.totalReviews) * 100}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground w-8">{rating.ratings[star as keyof typeof rating.ratings]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Aviso: avaliação é feita pelo histórico de pedidos */}
      <div className="flex items-start gap-3 bg-secondary/40 border border-border rounded-xl p-4">
        <ShoppingBag className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          As avaliações são feitas por quem comprou o produto.{' '}
          {isAuthenticated ? (
            <>Avalie pelos seus pedidos em <Link to="/perfil" className="text-primary font-semibold hover:underline">Meu Perfil → Histórico de Compras</Link>.</>
          ) : (
            <>Faça login e avalie pelo seu histórico de compras.</>
          )}
        </p>
      </div>

      {/* Lista de avaliações */}
      <div className="space-y-4">
        {reviews.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Este produto ainda não tem avaliações.</p>
        ) : (
          reviews.map((review) => (
            <div key={review.id} className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{review.userName}</span>
                    {review.verified && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">✓ Compra Verificada</span>
                    )}
                  </div>
                  {renderStars(review.rating)}
                </div>
                <span className="text-sm text-muted-foreground">{new Date(review.date).toLocaleDateString('pt-BR')}</span>
              </div>

              <p className="text-foreground mb-3">{review.comment}</p>

              {review.images && review.images.length > 0 && (
                <div className="flex gap-2 mb-3 flex-wrap">
                  {review.images.map((img, index) => (
                    <img key={index} src={img} alt="" loading="lazy"
                      className="w-24 h-24 object-cover rounded-lg cursor-pointer hover:opacity-80"
                      onClick={() => window.open(img, '_blank')} />
                  ))}
                </div>
              )}

              {review.videoUrl && (
                <div className="mb-3">
                  {getYouTubeEmbed(review.videoUrl) ? (
                    <div className="relative w-full max-w-md aspect-video rounded-lg overflow-hidden border border-border">
                      <iframe src={getYouTubeEmbed(review.videoUrl)!} title="Vídeo de review"
                        className="absolute inset-0 w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen />
                    </div>
                  ) : (
                    // Vídeo enviado direto pelo cliente (arquivo no Storage) → player nativo.
                    <video src={review.videoUrl} controls
                      className="w-full max-w-md rounded-lg border border-border bg-black" />
                  )}
                </div>
              )}

              {review.videoUrl && (
                <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  <Video className="w-3 h-3" /> Vídeo de review
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProductReviews;
