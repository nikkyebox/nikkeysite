import React, { useEffect, useState } from 'react';
import { Star, Camera, X, Video, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/context/UserContext';
import { reviewService } from '@/services/reviewService';
import { pointsService, POINTS } from '@/services/pointsService';
import { uploadMedia } from '@/services/uploadService';
import { userRewardsService } from '@/services/userRewardsService';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const MAX_VIDEO_MB = 60;

interface ReviewModalProps {
  productId: string;
  productName: string;
  onClose: () => void;
  onDone?: () => void;
}

// Modal de avaliação — usado a partir do HISTÓRICO de pedidos (só quem comprou avalia).
const ReviewModal: React.FC<ReviewModalProps> = ({ productId, productName, onClose, onDone }) => {
  const { user, addPoints } = useUser();
  const { toast } = useToast();
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState('');
  const [videoProgress, setVideoProgress] = useState(0);
  const [alreadyHasVideo, setAlreadyHasVideo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) pointsService.hasVideoForProduct(user.id, productId).then(setAlreadyHasVideo);
  }, [user, productId]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => setImages((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      toast({ title: 'Vídeo muito grande', description: `O limite é ${MAX_VIDEO_MB}MB. Grave um vídeo mais curto.`, variant: 'destructive' });
      return;
    }
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    if (!user) return;
    if (selectedRating === 0) { toast({ title: 'Selecione uma nota (estrelas)', variant: 'destructive' }); return; }
    if (comment.trim().length < 10) { toast({ title: 'Escreva pelo menos 10 caracteres', variant: 'destructive' }); return; }

    setSaving(true);

    // Faz upload do vídeo (se houver) para o Firebase Storage antes de salvar.
    let videoUrl = '';
    if (videoFile && !alreadyHasVideo) {
      try {
        const { url } = await uploadMedia(videoFile, `review-videos/${productId}`, setVideoProgress);
        videoUrl = url;
      } catch (err: unknown) {
        toast({ title: 'Falha ao enviar o vídeo', description: err instanceof Error ? err.message : 'Tente novamente.', variant: 'destructive' });
        setSaving(false);
        return;
      }
    }

    let reward;
    try {
      reward = await userRewardsService.claimProductReview(productId);
    } catch (err: unknown) {
      toast({
        title: 'Não foi possível validar os pontos',
        description: err instanceof Error ? err.message : 'Confirme que esta compra já foi paga.',
        variant: 'destructive',
      });
      setSaving(false);
      return;
    }

    reviewService.addReview({
      productId,
      userId: user.id,
      userName: user.name,
      rating: selectedRating,
      comment: comment.trim(),
      images: images.length > 0 ? images : undefined,
      videoUrl: videoUrl || undefined,
      pointsAwarded: reward.awarded,
      verified: true,
    });
    if (reward.awarded > 0) addPoints(reward.awarded);

    let videoMsg = '';
    if (videoUrl && !alreadyHasVideo) {
      pointsService.submitVideo({
        userId: user.id, userName: user.name, userEmail: user.email,
        productId, productName, videoUrl,
      });
      videoMsg = ' Seu vídeo foi enviado para validação — os pontos do vídeo entram após a aprovação do time.';
    }

    toast({
      title: reward.awarded > 0
        ? `Avaliação enviada! +${reward.awarded} ponto`
        : 'Avaliação enviada!',
      description: `Você agora tem ${reward.total} pontos.` + videoMsg,
    });
    setSaving(false);
    onDone?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-card rounded-2xl w-full max-w-lg my-8 shadow-elevated border border-border">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-display text-lg font-bold flex items-center gap-2"><Star className="w-5 h-5 text-gold" /> Avaliar produto</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-secondary"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">{productName}</p>

          {/* Banner de pontos */}
          <div className="flex items-start gap-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3">
            <Gift className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              Avaliar = <b>+{POINTS.perReview} ponto</b> · vídeo de review = <b>+{POINTS.perVideoMinute} pts/min</b> (após validação do time).
            </div>
          </div>

          {/* Estrelas */}
          <div>
            <label className="block text-sm font-medium mb-2">Sua nota</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" onClick={() => setSelectedRating(star)}
                  onMouseEnter={() => setHoverRating(star)} onMouseLeave={() => setHoverRating(0)}>
                  <Star className={cn('w-8 h-8 transition-colors',
                    star <= (hoverRating || selectedRating) ? 'fill-gold text-gold' : 'text-gray-300 hover:text-gold')} />
                </button>
              ))}
            </div>
          </div>

          {/* Comentário */}
          <div>
            <label className="block text-sm font-medium mb-2">Seu comentário</label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4}
              placeholder="Compartilhe sua experiência com este produto..." />
          </div>

          {/* Fotos */}
          <div>
            <label className="block text-sm font-medium mb-2">Fotos (opcional)</label>
            <div className="flex flex-wrap gap-2">
              {images.map((img, index) => (
                <div key={index} className="relative">
                  <img src={img} alt="" className="w-16 h-16 object-cover rounded-lg" />
                  <button onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"><X className="w-3 h-3" /></button>
                </div>
              ))}
              {images.length < 5 && (
                <label className="w-16 h-16 border-2 border-dashed border-border rounded-lg flex items-center justify-center cursor-pointer hover:border-primary">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                </label>
              )}
            </div>
          </div>

          {/* Vídeo — upload direto no site */}
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-1.5">
              <Video className="w-4 h-4" /> Vídeo de review <span className="text-amber-600 font-bold">(+{POINTS.perVideoMinute} pts/min, após validação)</span>
            </label>

            {alreadyHasVideo ? (
              <p className="text-xs text-muted-foreground">Você já enviou um vídeo deste produto.</p>
            ) : videoFile ? (
              <div className="relative">
                <video src={videoPreview} controls className="w-full max-h-48 rounded-lg bg-black" />
                <button type="button" onClick={() => { setVideoFile(null); setVideoPreview(''); setVideoProgress(0); }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"><X className="w-4 h-4" /></button>
                <p className="text-xs text-muted-foreground mt-1 truncate">{videoFile.name} · {(videoFile.size / 1024 / 1024).toFixed(1)}MB</p>
                {saving && videoProgress > 0 && (
                  <div className="mt-2">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${videoProgress}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Enviando vídeo... {videoProgress}%</p>
                  </div>
                )}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-border rounded-lg py-6 cursor-pointer hover:border-primary">
                <Video className="w-6 h-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Toque para gravar/enviar um vídeo (até {MAX_VIDEO_MB}MB)</span>
                <input type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />
              </label>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-border flex gap-3">
          <Button onClick={submit} disabled={saving} className="flex-1">Enviar avaliação</Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;
