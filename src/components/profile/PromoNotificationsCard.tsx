// Card "Notificações & Promoções" do perfil: mostra as campanhas promocionais
// enviadas pelo admin (e-mail/push). Fonte: siteContent/promoNotifications —
// doc de leitura pública já permitida nas regras (match /siteContent),
// gravado pelo promoCampaignService junto com a criação da campanha.
// O botão "Ver oferta" leva ao CARRINHO com o produto dentro (?promo=CODE&add=ID),
// o mesmo destino do e-mail e do push: é onde os descontos aparecem somados.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Sparkles, ArrowRight } from 'lucide-react';
import { db } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface PromoFeedItem {
  code: string;
  mechanic: string;
  headline?: string;
  tagline?: string;
  description?: string;
  badge?: string;
  productId?: string;
  productName?: string;
  productImage?: string;
  createdAt: number;
  expiresAt?: number;
}

const PromoNotificationsCard: React.FC = () => {
  const [items, setItems] = useState<PromoFeedItem[]>([]);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    getDoc(doc(db, 'siteContent', 'promoNotifications'))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        // Doc externo: narrowing runtime; cast nomeado só após confirmar o array.
        const raw: unknown = snap.data();
        const arr = raw && typeof raw === 'object' && 'items' in raw && Array.isArray(raw.items) ? raw.items : [];
        const list = arr as PromoFeedItem[];
        const now = Date.now();
        setItems(list.filter((i) => i && i.code && (!i.expiresAt || i.expiresAt > now)));
      })
      .catch(() => { /* feed indisponível — mantém vazio */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-card rounded-2xl border border-border p-6 lg:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-foreground">Notificações & Promoções</h2>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhuma promoção no momento. Quando enviarmos uma oferta, ela aparece aqui. 🔔
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={`${item.code}-${item.createdAt}`}
              className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border border-primary/30 bg-primary/5"
            >
              {item.productImage && (
                <img
                  src={item.productImage}
                  alt={item.productName || 'Produto'}
                  className="w-16 h-16 rounded-lg object-cover shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.badge && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                      {item.badge}
                    </span>
                  )}
                  <span className="font-semibold text-foreground">
                    {item.tagline || item.headline || 'Oferta especial'}
                  </span>
                </div>
                {item.description && (
                  <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                  {item.expiresAt ? ` · válida até ${new Date(item.expiresAt).toLocaleDateString('pt-BR')}` : ''}
                </p>
              </div>
              <Link
                to={item.productId
                  ? `/carrinho?promo=${item.code}&add=${item.productId}`
                  : `/carrinho?promo=${item.code}`}
                className="inline-flex items-center gap-1.5 shrink-0 text-sm font-semibold text-primary hover:underline"
              >
                <Sparkles className="w-4 h-4" /> Ver oferta <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PromoNotificationsCard;
