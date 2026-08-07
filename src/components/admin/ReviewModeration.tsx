import React, { useState, useEffect } from 'react';
import { Star, Trash2, ImageOff, Flag, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reviewService } from '@/services/reviewService';
import { Review } from '@/types/review';
import { useToast } from '@/hooks/use-toast';

export default function ReviewModeration() {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [search, setSearch] = useState('');
  const [filterStars, setFilterStars] = useState<'all' | '1' | '2' | '3' | '4' | '5'>('all');
  const [filterPhotos, setFilterPhotos] = useState(false);

  const load = () => setReviews(reviewService.getAllReviews());

  useEffect(() => { load(); }, []);

  const filtered = reviews.filter(r => {
    const matchSearch =
      !search ||
      r.userName.toLowerCase().includes(search.toLowerCase()) ||
      r.comment.toLowerCase().includes(search.toLowerCase()) ||
      r.productId.toLowerCase().includes(search.toLowerCase());
    const matchStars = filterStars === 'all' || r.rating === Number(filterStars);
    const matchPhotos = !filterPhotos || (r.images && r.images.length > 0);
    return matchSearch && matchStars && matchPhotos;
  });

  // ordena: mais recentes primeiro, 1★ antes
  const sorted = [...filtered].sort((a, b) => {
    if (a.rating !== b.rating) return a.rating - b.rating;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  function deleteReview(id: string, userName: string) {
    if (!confirm(`Excluir a avaliação de "${userName}"?\n\nEsta ação não pode ser desfeita.`)) return;
    reviewService.deleteReview(id);
    load();
    toast({ title: '🗑️ Avaliação excluída', description: `Review de ${userName} removida.` });
  }

  function removePhotos(review: Review) {
    if (!confirm(`Remover apenas as fotos da avaliação de "${review.userName}"?`)) return;
    const all = reviewService.getAllReviews();
    reviewService.saveReviews(all.map(r => r.id === review.id ? { ...r, images: [] } : r));
    load();
    toast({ title: '🖼️ Fotos removidas', description: `Fotos de ${review.userName} apagadas. Nota e comentário mantidos.` });
  }

  const stars1or2 = reviews.filter(r => r.rating <= 2).length;
  const withPhotos = reviews.filter(r => r.images && r.images.length > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Flag className="w-5 h-5 text-red-500" />
        <h2 className="text-lg font-bold">Moderação de Avaliações</h2>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{reviews.length}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{stars1or2}</p>
          <p className="text-xs text-muted-foreground">Notas 1-2★</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{withPhotos}</p>
          <p className="text-xs text-muted-foreground">Com fotos</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{filtered.length}</p>
          <p className="text-xs text-muted-foreground">Exibindo</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome, comentário ou produto…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>

        <div className="flex items-center gap-1">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {(['all', '1', '2', '3', '4', '5'] as const).map(v => (
            <button
              key={v}
              onClick={() => setFilterStars(v)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                filterStars === v
                  ? 'bg-primary text-white border-primary'
                  : 'border-border text-muted-foreground hover:bg-secondary'
              }`}
            >
              {v === 'all' ? 'Todas' : `${v}★`}
            </button>
          ))}
        </div>

        <button
          onClick={() => setFilterPhotos(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            filterPhotos
              ? 'bg-amber-500 text-white border-amber-500'
              : 'border-border text-muted-foreground hover:bg-secondary'
          }`}
        >
          <ImageOff className="w-3.5 h-3.5" />
          Só com fotos
        </button>
      </div>

      {/* Lista */}
      {sorted.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Nenhuma avaliação encontrada.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map(review => (
            <div
              key={review.id}
              className={`bg-card border rounded-xl p-4 space-y-3 ${
                review.rating <= 2 ? 'border-red-200 dark:border-red-900' : 'border-border'
              }`}
            >
              {/* Cabeçalho */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{review.userName}</span>
                    {review.verified && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✓ Verificado</span>
                    )}
                    {review.rating <= 2 && (
                      <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <Flag className="w-2.5 h-2.5" /> Nota baixa
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(s => (
                        <Star key={s} className={`w-3.5 h-3.5 ${s <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(review.date).toLocaleDateString('pt-BR')} · produto: <code className="text-[10px]">{review.productId}</code>
                    </span>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex gap-2 shrink-0">
                  {review.images && review.images.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                      onClick={() => removePhotos(review)}
                    >
                      <ImageOff className="w-3.5 h-3.5" />
                      Remover fotos
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 text-xs"
                    onClick={() => deleteReview(review.id, review.userName)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir
                  </Button>
                </div>
              </div>

              {/* Comentário */}
              {review.comment && (
                <p className="text-sm text-foreground bg-secondary/30 rounded-lg px-3 py-2">
                  {review.comment}
                </p>
              )}

              {/* Fotos */}
              {review.images && review.images.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {review.images.map((img, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={img}
                        alt=""
                        className="w-20 h-20 object-cover rounded-lg border border-border cursor-pointer hover:opacity-80"
                        onClick={() => window.open(img, '_blank')}
                      />
                      <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-bl-lg rounded-tr-lg">
                        {i + 1}/{review.images!.length}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
