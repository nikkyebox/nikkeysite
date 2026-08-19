import React from 'react';
import { ShieldCheck, Sparkles, PlaneTakeoff, HeartHandshake } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export const TrustHighlights: React.FC = () => {
  const { t } = useLanguage();

  const highlights = [
    {
      icon: <ShieldCheck className="w-6 h-6 text-pink-600" />,
      title: '100% Originais do Japão',
      desc: 'Cosméticos, doces e produtos autênticos despachados diretamente de Mie-ken.',
    },
    {
      icon: <PlaneTakeoff className="w-6 h-6 text-purple-600" />,
      title: 'Envio Internacional Seguro',
      desc: 'Frete calculado por peso real com código de rastreio Japan Post / Correios.',
    },
    {
      icon: <Sparkles className="w-6 h-6 text-amber-600" />,
      title: 'Personal Shopper & Encomendas',
      desc: 'Não achou o que procura? Nós compramos qualquer item no Japão sob demanda.',
    },
    {
      icon: <HeartHandshake className="w-6 h-6 text-emerald-600" />,
      title: 'Suporte Humanizado em Português',
      desc: 'Atendimento direto pelo WhatsApp para tirar dúvidas antes e depois do pedido.',
    },
  ];

  return (
    <section className="py-8 bg-gradient-to-b from-pink-50/40 via-white to-white border-b border-pink-100/60">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {highlights.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3.5 p-4 rounded-2xl border border-pink-100/80 bg-white/90 shadow-sm hover:shadow-md hover:border-pink-200 transition-all duration-300"
            >
              <div className="shrink-0 p-2.5 rounded-xl bg-pink-50 ring-1 ring-pink-100">
                {item.icon}
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-tight text-slate-900 mb-1">
                  {item.title}
                </h4>
                <p className="text-[12px] text-slate-500 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustHighlights;
