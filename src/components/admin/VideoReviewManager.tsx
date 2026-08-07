import React, { useEffect, useState } from 'react';
import { Video, Loader2, Check, X, ExternalLink, Clock, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { pointsService, VideoReview, pointsForVideoMinutes } from '@/services/pointsService';
import { useToast } from '@/hooks/use-toast';

const STATUS_TAG: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-gray-200 text-gray-600',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado',
};

const VideoReviewManager: React.FC = () => {
  const { toast } = useToast();
  const [list, setList] = useState<VideoReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setList(await pointsService.getVideoReviews());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const approve = async (v: VideoReview) => {
    const min = Math.max(1, Math.floor(Number(minutes[v.id]) || 1));
    setBusy(v.id);
    const res = await pointsService.approveVideo(v, min);
    setBusy(null);
    if (res.ok) {
      toast({ title: `✅ Vídeo aprovado — +${res.points} pts`, description: `${v.userName} (${v.productName})` });
      load();
    } else {
      toast({ title: 'Não foi possível aprovar', description: res.error, variant: 'destructive' });
    }
  };

  const reject = async (v: VideoReview) => {
    setBusy(v.id);
    await pointsService.rejectVideo(v);
    setBusy(null);
    toast({ title: 'Vídeo rejeitado', description: 'Nenhum ponto foi concedido.' });
    load();
  };

  const pending = list.filter((v) => v.status === 'pending');
  const others = list.filter((v) => v.status !== 'pending');

  const card = (v: VideoReview) => {
    const min = Number(minutes[v.id]) || 1;
    return (
      <div key={v.id} className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{v.productName}</p>
            <p className="text-xs text-muted-foreground">{v.userName}{v.userEmail ? ` · ${v.userEmail}` : ''}</p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" /> {new Date(v.submittedAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_TAG[v.status]}`}>
            {STATUS_LABEL[v.status]}
          </span>
        </div>

        {/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(v.videoUrl) ? (
          <a href={v.videoUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline break-all mb-3">
            <ExternalLink className="w-3.5 h-3.5 shrink-0" /> Abrir vídeo
          </a>
        ) : (
          <video src={v.videoUrl} controls className="w-full rounded-lg border border-border bg-black mb-3 max-h-60" />
        )}

        {v.status === 'pending' ? (
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border">
            <div>
              <label className="text-[11px] font-semibold block mb-1">Duração (min)</label>
              <input
                type="number" min={1} value={minutes[v.id] ?? '1'}
                onChange={(e) => setMinutes((m) => ({ ...m, [v.id]: e.target.value }))}
                className="w-20 px-2 py-1.5 rounded-lg border border-border bg-background text-sm"
              />
            </div>
            <span className="text-xs text-amber-700 font-semibold flex items-center gap-1 mb-1.5">
              <Award className="w-3.5 h-3.5" /> = {pointsForVideoMinutes(min)} pts
            </span>
            <div className="flex gap-2 ml-auto">
              <Button onClick={() => approve(v)} disabled={busy === v.id} size="sm" className="btn-primary gap-1.5">
                {busy === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Aprovar
              </Button>
              <Button onClick={() => reject(v)} disabled={busy === v.id} size="sm" variant="outline" className="gap-1.5 text-red-600">
                <X className="w-4 h-4" /> Rejeitar
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            {v.status === 'approved' ? `Concedido: ${v.pointsAwarded} pts (${v.minutes} min)` : 'Rejeitado — sem pontos.'}
          </p>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Video className="w-6 h-6 text-primary" /> Vídeos de review
        </h2>
        <p className="text-sm text-muted-foreground">Valide os vídeos enviados pelos clientes. A aprovação concede os pontos (5 por minuto).</p>
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Video className="w-12 h-12 mx-auto mb-3 opacity-40" />
          Nenhum vídeo enviado ainda.
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-amber-700 mb-3">Pendentes ({pending.length})</h3>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground/70 italic">Nenhum vídeo aguardando validação.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-3">{pending.map(card)}</div>
            )}
          </div>
          {others.length > 0 && (
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3">Histórico</h3>
              <div className="grid md:grid-cols-2 gap-3">{others.map(card)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoReviewManager;
