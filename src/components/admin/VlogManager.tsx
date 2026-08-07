import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Loader2, Video, Star, Film } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { siteContentService, VlogContent, VlogVideo, DEFAULT_VLOG_CONTENT } from '@/services/siteContentService';
import { useToast } from '@/hooks/use-toast';

function getYouTubeId(s: string): string {
  if (!s) return '';
  const m = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return m[1];
  if (/^[\w-]{11}$/.test(s.trim())) return s.trim();
  return '';
}
function getYouTubeEmbed(url: string): string | null {
  const id = getYouTubeId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

// Editor de UM vídeo (usado no principal e em cada secundário)
const VideoFields: React.FC<{
  video: VlogVideo;
  onChange: (v: VlogVideo) => void;
  onRemove?: () => void;
}> = ({ video, onChange, onRemove }) => {
  const embed = getYouTubeEmbed(video.url);
  const set = (field: keyof VlogVideo, value: string) => onChange({ ...video, [field]: value });
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row gap-4">
      <div className="w-full sm:w-52 aspect-video bg-black rounded-lg overflow-hidden flex-shrink-0">
        {embed ? (
          <iframe src={embed} title={video.title} className="w-full h-full" allowFullScreen />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/50 text-xs px-2 text-center">
            <Video className="w-5 h-5 mr-1" /> Cole um link do YouTube
          </div>
        )}
      </div>
      <div className="flex-1 space-y-2">
        <input
          value={video.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="Título do vídeo (ex: Unboxing KitKat Matcha)"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium"
        />
        <input
          value={video.url}
          onChange={(e) => set('url', e.target.value)}
          placeholder="Link do YouTube (https://youtu.be/...)"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
        <textarea
          value={video.description || ''}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Descrição curta (opcional)"
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-y"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            value={video.duration || ''}
            onChange={(e) => set('duration', e.target.value)}
            placeholder="Duração (14:02)"
            className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs"
          />
          <input
            type="date"
            value={video.date || ''}
            onChange={(e) => set('date', e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs"
          />
          <input
            value={video.views || ''}
            onChange={(e) => set('views', e.target.value)}
            placeholder="Views (12.5K)"
            className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs"
          />
        </div>
        {onRemove && (
          <button onClick={onRemove} className="text-xs text-red-600 hover:underline flex items-center gap-1 pt-0.5">
            <Trash2 className="w-3.5 h-3.5" /> Remover
          </button>
        )}
      </div>
    </div>
  );
};

const emptyVideo = (): VlogVideo => ({ id: `v-${Date.now()}`, title: '', url: '', description: '' });

const VlogManager: React.FC = () => {
  const { toast } = useToast();
  const [content, setContent] = useState<VlogContent | null>(null);
  const [saving, setSaving] = useState(false);
  const [usingDefaults, setUsingDefaults] = useState(false);

  useEffect(() => {
    siteContentService.getVlog().then((c) => {
      const isEmpty = !c.featured?.url && (!c.videos || c.videos.length === 0);
      // Só pré-carrega os padrões se NUNCA foi salvo. Se o admin já salvou (mesmo
      // vazio), respeita o que ele deixou — assim dá pra deletar de verdade.
      if (isEmpty && !c.saved) {
        setContent(JSON.parse(JSON.stringify(DEFAULT_VLOG_CONTENT)));
        setUsingDefaults(true);
      } else {
        setContent(c);
        setUsingDefaults(false);
      }
    });
  }, []);

  if (!content) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
      </div>
    );
  }

  const featured = content.featured || emptyVideo();

  const addVideo = () => setContent({ ...content, videos: [...content.videos, emptyVideo()] });
  const updateVideo = (id: string, v: VlogVideo) =>
    setContent({ ...content, videos: content.videos.map((x) => (x.id === id ? v : x)) });
  const removeVideo = (id: string) =>
    setContent({ ...content, videos: content.videos.filter((x) => x.id !== id) });

  const save = async () => {
    setSaving(true);
    try {
      const cleanFeatured = content.featured?.url?.trim() ? content.featured : null;
      const clean: VlogContent = {
        ...content,
        featured: cleanFeatured,
        videos: content.videos.filter((v) => v.url.trim()),
      };
      await siteContentService.saveVlog(clean);
      setContent(clean);
      setUsingDefaults(false);
      toast({ title: '✅ Vlog atualizado!', description: 'Os vídeos já estão no ar na página /vlog.' });
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Vlog</h2>
          <p className="text-sm text-muted-foreground">Gerencie o vídeo principal e os secundários da página /vlog</p>
        </div>
        <Button onClick={save} disabled={saving} className="btn-primary rounded-xl gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </Button>
      </div>

      {usingDefaults && (
        <div className="mb-6 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
          ℹ️ Estes são os <strong>vídeos atuais</strong> que aparecem em <strong>/vlog</strong>. Edite, exclua ou adicione e clique em <strong>Salvar</strong> para personalizar. (Enquanto não salvar, eles continuam como padrão.)
        </div>
      )}

      {/* Títulos da página (opcional) */}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <div>
          <label className="text-sm font-semibold block mb-1">Título da página (opcional)</label>
          <input
            value={content.title || ''}
            onChange={(e) => setContent({ ...content, title: e.target.value })}
            placeholder="Ex: Nossos Vlogs"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background"
          />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Subtítulo (opcional)</label>
          <input
            value={content.subtitle || ''}
            onChange={(e) => setContent({ ...content, subtitle: e.target.value })}
            placeholder="Ex: Unboxings e reviews reais do Japão"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background"
          />
        </div>
      </div>

      {/* Vídeo principal */}
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2 mb-3">
        <Star className="w-4 h-4 text-amber-500" /> Vídeo Principal (destaque)
      </h3>
      <div className="mb-8">
        <VideoFields video={featured} onChange={(v) => setContent({ ...content, featured: v })} />
      </div>

      {/* Vídeos secundários */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Film className="w-4 h-4" /> Vídeos Secundários ({content.videos.length})
        </h3>
        <Button variant="outline" onClick={addVideo} className="rounded-xl gap-2 h-9">
          <Plus className="w-4 h-4" /> Adicionar vídeo
        </Button>
      </div>

      {content.videos.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-6 text-center">
          Nenhum vídeo secundário. Clique em "Adicionar vídeo" e cole um link do YouTube.
        </p>
      ) : (
        <div className="space-y-4">
          {content.videos.map((v) => (
            <VideoFields key={v.id} video={v} onChange={(nv) => updateVideo(v.id, nv)} onRemove={() => removeVideo(v.id)} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        💡 Cole links do YouTube. Se não preencher o principal, o primeiro secundário vira o destaque. Deixe tudo vazio para usar os vídeos padrão.
      </p>
    </div>
  );
};

export default VlogManager;
