import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Loader2, Video, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { siteContentService, HomeContent, HomeVideo } from '@/services/siteContentService';
import { useToast } from '@/hooks/use-toast';

function getYouTubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

const HomeContentManager: React.FC = () => {
  const { toast } = useToast();
  const [content, setContent] = useState<HomeContent | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    siteContentService.getHome().then(setContent);
  }, []);

  if (!content) {
    return <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  }

  const addVideo = () => {
    const v: HomeVideo = { id: `vid-${Date.now()}`, title: '', url: '' };
    setContent({ ...content, videos: [...content.videos, v] });
  };
  const updateVideo = (id: string, field: 'title' | 'url', value: string) => {
    setContent({ ...content, videos: content.videos.map(v => v.id === id ? { ...v, [field]: value } : v) });
  };
  const removeVideo = (id: string) => {
    setContent({ ...content, videos: content.videos.filter(v => v.id !== id) });
  };

  const save = async () => {
    setSaving(true);
    try {
      const clean = { ...content, videos: content.videos.filter(v => v.url.trim()) };
      await siteContentService.saveHome(clean);
      setContent(clean);
      toast({ title: '✅ Home atualizada!', description: 'Os vídeos já estão no ar.' });
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
          <h2 className="font-display text-2xl font-bold text-foreground">Início (Home)</h2>
          <p className="text-sm text-muted-foreground">Gerencie os vídeos promo que aparecem na página inicial</p>
        </div>
        <Button onClick={save} disabled={saving} className="btn-primary rounded-xl gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </Button>
      </div>

      {/* Títulos da seção */}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <div>
          <label className="text-sm font-semibold block mb-1">Título da seção de vídeos</label>
          <input
            value={content.videosTitle || ''}
            onChange={(e) => setContent({ ...content, videosTitle: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background"
          />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Subtítulo</label>
          <input
            value={content.videosSubtitle || ''}
            onChange={(e) => setContent({ ...content, videosSubtitle: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background"
          />
        </div>
      </div>

      {/* Lista de vídeos */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
          <Video className="w-4 h-4" /> Vídeos ({content.videos.length})
        </h3>
        <Button variant="outline" onClick={addVideo} className="rounded-xl gap-2 h-9">
          <Plus className="w-4 h-4" /> Adicionar vídeo
        </Button>
      </div>

      {content.videos.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-6 text-center">
          Nenhum vídeo. Clique em "Adicionar vídeo" e cole um link do YouTube.
        </p>
      ) : (
        <div className="space-y-4">
          {content.videos.map((v) => {
            const embed = getYouTubeEmbed(v.url);
            return (
              <div key={v.id} className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-48 aspect-video bg-black rounded-lg overflow-hidden flex-shrink-0">
                  {embed ? (
                    <iframe src={embed} title={v.title} className="w-full h-full" allowFullScreen />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/50 text-xs px-2 text-center">
                      <Eye className="w-5 h-5 mr-1" /> Cole um link do YouTube
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    value={v.title}
                    onChange={(e) => updateVideo(v.id, 'title', e.target.value)}
                    placeholder="Título do vídeo (ex: Unboxing KitKat Matcha)"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                  <input
                    value={v.url}
                    onChange={(e) => updateVideo(v.id, 'url', e.target.value)}
                    placeholder="Link do vídeo (YouTube)"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  />
                  <button onClick={() => removeVideo(v.id)} className="text-xs text-red-600 hover:underline flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Remover
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        💡 Dica: por enquanto use links do YouTube (gratuito). Quando ativar o Firebase Storage (plano Blaze), eu habilito upload direto de vídeo.
      </p>
    </div>
  );
};

export default HomeContentManager;
