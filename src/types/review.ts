export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number; // 1-5
  comment: string;
  images?: string[]; // URLs das fotos (base64)
  videoUrl?: string; // Link do vídeo de unboxing (YouTube/Insta/TikTok)
  pointsAwarded?: number; // Pontos ganhos com esta avaliação
  date: string;
  verified: boolean; // Comprou o produto
}

// Regras de pontuação da loja
export const REVIEW_POINTS = {
  withPhoto: 15, // avaliação (nota + comentário) + foto
  textOrPhotoOnly: 10, // só avaliação OU só foto
  unboxingVideo: 100, // vídeo de unboxing
};

// Calcula os pontos de uma avaliação conforme o conteúdo enviado
export function calculateReviewPoints(opts: { hasComment: boolean; hasPhoto: boolean; hasVideo: boolean }): number {
  let points = 0;
  if (opts.hasComment && opts.hasPhoto) points += REVIEW_POINTS.withPhoto;
  else if (opts.hasComment || opts.hasPhoto) points += REVIEW_POINTS.textOrPhotoOnly;
  if (opts.hasVideo) points += REVIEW_POINTS.unboxingVideo;
  return points;
}

export interface ProductRating {
  productId: string;
  averageRating: number;
  totalReviews: number;
  ratings: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}
