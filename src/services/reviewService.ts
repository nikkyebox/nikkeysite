import { safeStorage } from '@/utils/storage';
import { Review, ProductRating } from '@/types/review';

const REVIEWS_KEY = 'japan-express-reviews';

export const reviewService = {
  // Obter todas as avaliações
  getAllReviews(): Review[] {
    const data = safeStorage.getItem(REVIEWS_KEY);
    return data ? JSON.parse(data) : [];
  },

  // Salvar avaliações
  saveReviews(reviews: Review[]): void {
    safeStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
  },

  // Adicionar nova avaliação
  addReview(review: Omit<Review, 'id' | 'date'>): Review {
    const reviews = this.getAllReviews();
    const newReview: Review = {
      ...review,
      id: `review-${Date.now()}`,
      date: new Date().toISOString(),
    };
    reviews.push(newReview);
    this.saveReviews(reviews);
    return newReview;
  },

  // Obter avaliações de um produto
  getProductReviews(productId: string): Review[] {
    return this.getAllReviews().filter(r => r.productId === productId);
  },

  // Calcular rating médio de um produto
  getProductRating(productId: string): ProductRating {
    const reviews = this.getProductReviews(productId);
    
    if (reviews.length === 0) {
      return {
        productId,
        averageRating: 0,
        totalReviews: 0,
        ratings: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
      };
    }

    const ratings = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalRating = 0;

    reviews.forEach(review => {
      ratings[review.rating as keyof typeof ratings]++;
      totalRating += review.rating;
    });

    return {
      productId,
      averageRating: totalRating / reviews.length,
      totalReviews: reviews.length,
      ratings
    };
  },

  // Verificar se usuário pode avaliar (logado e ainda não avaliou este produto)
  canUserReview(userId: string, productId: string): boolean {
    if (!userId) return false;
    const hasReviewed = this.getAllReviews().some(
      r => r.userId === userId && r.productId === productId
    );
    return !hasReviewed;
  },

  // Verifica se o usuário tem pedido com este produto (para o selo "Compra Verificada")
  hasPurchased(userId: string, productName: string): boolean {
    const ordersData = safeStorage.getItem(`orders_${userId}`);
    if (!ordersData) return false;
    try {
      const orders = JSON.parse(ordersData);
      return orders.some((order: any) =>
        (order.items || []).some((item: any) => item.productName === productName)
      );
    } catch {
      return false;
    }
  },

  // Deletar avaliação
  deleteReview(reviewId: string): void {
    const reviews = this.getAllReviews().filter(r => r.id !== reviewId);
    this.saveReviews(reviews);
  }
};
