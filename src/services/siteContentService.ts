// Conteúdo editável do site (gerenciado pelo admin) salvo no Firestore.
// Hoje: vídeos promo da home. Leitura pública, escrita só admin (regras do Firestore).
import { db } from '@/config/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ensureAdminAuth } from '@/utils/adminAuth';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};


export interface HomeVideo {
  id: string;
  title: string;
  url: string; // link YouTube/Insta/TikTok
}

export interface HomeContent {
  videosTitle?: string;
  videosSubtitle?: string;
  videos: HomeVideo[];
}

const DEFAULT_HOME: HomeContent = {
  videosTitle: 'Opinião de Quem Recebeu',
  videosSubtitle: 'Veja vídeos reais de clientes recebendo e testando os produtos.',
  videos: [],
};

/* ----------------------------- Vlog ----------------------------- */
export interface VlogVideo {
  id: string;
  title: string;
  description?: string;
  url: string; // link do YouTube (ou ID)
  thumbnail?: string; // miniatura custom (opcional; senão usa a do YouTube)
  duration?: string;
  date?: string; // ISO (YYYY-MM-DD)
  views?: string;
}

export interface VlogContent {
  title?: string;
  subtitle?: string;
  featured?: VlogVideo | null; // vídeo principal (destaque)
  videos: VlogVideo[]; // vídeos secundários
  saved?: boolean; // true quando o admin já salvou (mesmo vazio) → não recarrega padrões
}

const DEFAULT_VLOG: VlogContent = { featured: null, videos: [] };

// Vídeos padrão que aparecem em /vlog quando o admin ainda não cadastrou nada.
// O VlogManager usa isto para PRÉ-CARREGAR o editor, permitindo editar/excluir os atuais.
export const DEFAULT_VLOG_CONTENT: VlogContent = {
  featured: {
    id: 'def-1',
    title: 'Recebendo a Encomenda do Japão em Casa',
    description: 'A reação espontânea de um cliente ao receber seu pacote internacional na sala de casa, mostrando a embalagem externa.',
    url: 'tYcA1j-fcKg',
    thumbnail: '',
    duration: '14:02',
    date: '2026-05-15',
    views: '12.5K',
  },
  videos: [
    { id: 'def-2', title: 'Abrindo a Caixa - Curiosidade e Primeiras Impressões', description: 'Veja o que vem dentro da caixa! Um unboxing caseiro mostrando a curiosidade ao desembalar cada item recebido.', url: '1xN5_p-lU0Y', thumbnail: '', duration: '12:45', date: '2026-05-08', views: '8.2K' },
    { id: 'def-3', title: 'Provando os Snacks Japoneses - Reações Engraçadas!', description: 'Reações reais e caretas divertidas ao experimentar os salgadinhos e doces típicos importados do Japão na cozinha de casa.', url: 'S7R97sV1w8k', thumbnail: '', duration: '13:28', date: '2026-05-01', views: '9.8K' },
    { id: 'def-4', title: 'Testando Cosméticos no Banheiro - Opinião Sincera', description: 'Uma cliente comum aplicando e avaliando a textura de cremes e loções hidratantes em sua rotina diária no espelho de casa.', url: '1xN5_p-lU0Y', thumbnail: '', duration: '12:45', date: '2026-04-20', views: '14.1K' },
    { id: 'def-5', title: 'Abrindo o Pacote em Família - Marshmallows e Doces', description: 'Mãe e filha abrindo a caixa de guloseimas juntas e se deliciando com os docinhos importados no quintal.', url: 'tYcA1j-fcKg', duration: '14:02', date: '2026-04-10', views: '4.9K' },
    { id: 'def-6', title: 'Tarde de Lanche com Produtos Importados', description: 'Pai e filha se divertindo e dividindo os novos petiscos recebidos, gravado de forma simples em casa.', url: 'S7R97sV1w8k', duration: '13:28', date: '2026-04-01', views: '3.5K' },
  ],
};

/* ----------------------------- Settings ----------------------------- */
export interface SiteSettings {
  vlogEnabled: boolean;
}

const SETTINGS_LS = 'je_site_settings';
const DEFAULT_SETTINGS: SiteSettings = { vlogEnabled: false };

export const siteContentService = {
  async getSettings(): Promise<SiteSettings> {
    try {
      const cached = localStorage.getItem(SETTINGS_LS);
      if (cached) return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
    } catch {}
    if (!db) return DEFAULT_SETTINGS;
    try {
      const snap = await getDoc(doc(db, 'siteContent', 'settings'));
      const data = snap.exists() ? (snap.data() as Partial<SiteSettings>) : {};
      const result = { ...DEFAULT_SETTINGS, ...data };
      try { localStorage.setItem(SETTINGS_LS, JSON.stringify(result)); } catch {}
      return result;
    } catch (e) {
      devWarn('getSettings falhou:', e);
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: SiteSettings): Promise<void> {
    if (!db) throw new Error('Firebase indisponível');
    await ensureAdminAuth();
    await setDoc(doc(db, 'siteContent', 'settings'), { ...settings, updatedAt: serverTimestamp() }, { merge: true });
    try { localStorage.setItem(SETTINGS_LS, JSON.stringify(settings)); } catch {}
  },


  async getHome(): Promise<HomeContent> {
    if (!db) return DEFAULT_HOME;
    try {
      const snap = await getDoc(doc(db, 'siteContent', 'home'));
      if (!snap.exists()) return DEFAULT_HOME;
      const data = snap.data() as Partial<HomeContent>;
      return { ...DEFAULT_HOME, ...data, videos: data.videos || [] };
    } catch (e) {
      devWarn('siteContentService.getHome falhou:', e);
      return DEFAULT_HOME;
    }
  },

  async saveHome(content: HomeContent): Promise<void> {
    if (!db) throw new Error('Firebase indisponível');
    await ensureAdminAuth();
    await setDoc(
      doc(db, 'siteContent', 'home'),
      { ...content, updatedAt: serverTimestamp() },
      { merge: true }
    );
  },

  async getVlog(): Promise<VlogContent> {
    if (!db) return DEFAULT_VLOG;
    try {
      const snap = await getDoc(doc(db, 'siteContent', 'vlog'));
      if (!snap.exists()) return DEFAULT_VLOG;
      const data = snap.data() as Partial<VlogContent>;
      return { ...DEFAULT_VLOG, ...data, videos: data.videos || [], saved: true };
    } catch (e) {
      devWarn('siteContentService.getVlog falhou:', e);
      return DEFAULT_VLOG;
    }
  },

  async saveVlog(content: VlogContent): Promise<void> {
    if (!db) throw new Error('Firebase indisponível');
    await ensureAdminAuth();
    await setDoc(
      doc(db, 'siteContent', 'vlog'),
      { ...content, featured: content.featured || null, saved: true, updatedAt: serverTimestamp() },
      { merge: true }
    );
  },
};
