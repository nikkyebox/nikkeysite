import React, { useState } from 'react';
import { MessageCircle, X, ShieldCheck, Sparkles, Truck, Building2, ExternalLink } from 'lucide-react';
import { COMPANY_PROFILE } from '@/config/companyProfile';

const WHATSAPP_NUMBER = COMPANY_PROFILE.whatsapp.digits;

interface WhatsAppOption {
  icon: React.ReactNode;
  title: string;
  desc: string;
  message: string;
  internalLink?: string;
}

export const FloatingWhatsAppWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const options: WhatsAppOption[] = [
    {
      icon: <MessageCircle className="w-5 h-5 text-emerald-500" />,
      title: 'Tirar Dúvidas & Suporte',
      desc: 'Fale direto com nossa equipe no Japão em português',
      message: 'Olá NikkeyBox! Gostaria de tirar uma dúvida sobre os produtos e envios do Japão.',
    },
    {
      icon: <Sparkles className="w-5 h-5 text-purple-500" />,
      title: 'Personal Shopper / Encomendas',
      desc: 'Quer um produto que não está no site? Nós compramos para você!',
      message: 'Olá! Gostaria de fazer uma encomenda personalizada de um produto específico do Japão.',
      internalLink: '/faca-seu-pedido',
    },
    {
      icon: <Truck className="w-5 h-5 text-blue-500" />,
      title: 'Consultar Frete & Prazos',
      desc: 'Simule o envio Japan Post com código de rastreamento',
      message: 'Olá! Gostaria de consultar informações sobre prazo de entrega e frete para o Brasil.',
      internalLink: '/frete',
    },
    {
      icon: <Building2 className="w-5 h-5 text-amber-500" />,
      title: 'Atacado & Revenda (B2B)',
      desc: 'Condições especiais para salões de beleza, clínicas e lojistas',
      message: 'Olá! Tenho interesse em compras no atacado/revenda de cosméticos e produtos japoneses.',
      internalLink: '/empresas',
    },
  ];

  const handleOpenWhatsApp = (message: string) => {
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Popover Menu */}
      {isOpen && (
        <div className="mb-3 w-[340px] sm:w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-emerald-100 bg-white/95 p-4 shadow-2xl backdrop-blur-xl transition-all animate-in fade-in slide-in-from-bottom-5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/20">
                <MessageCircle className="w-5 h-5" />
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 leading-tight">Atendimento NikkeyBox</h3>
                <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online direto do Japão
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-gray-600 mb-3 leading-relaxed">
            Como podemos te ajudar hoje? Selecione um assunto para iniciar o atendimento no WhatsApp:
          </p>

          {/* Action List */}
          <div className="space-y-2">
            {options.map((opt) => (
              <button
                key={opt.title}
                type="button"
                onClick={() => handleOpenWhatsApp(opt.message)}
                className="w-full group text-left flex items-start gap-3 p-2.5 rounded-xl border border-gray-100 bg-gray-50/60 hover:bg-emerald-50/70 hover:border-emerald-200 transition-all"
              >
                <div className="mt-0.5 shrink-0 p-1.5 rounded-lg bg-white shadow-sm group-hover:scale-105 transition-transform">
                  {opt.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-gray-900 group-hover:text-emerald-700 flex items-center justify-between">
                    <span>{opt.title}</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-600" />
                  </div>
                  <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Atendimento 100% em Português
            </span>
            <span>Mie-ken, Japão</span>
          </div>
        </div>
      )}

      {/* Main Floating Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Falar no WhatsApp com NikkeyBox"
        className="group relative flex items-center gap-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-3.5 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/40 hover:scale-105 active:scale-95 transition-all duration-300"
      >
        <span className="relative flex h-6 w-6 items-center justify-center">
          <MessageCircle className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-200 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-100" />
          </span>
        </span>
        <span className="hidden sm:inline-block text-xs font-black tracking-wide pr-1">
          WhatsApp Japão
        </span>
      </button>
    </div>
  );
};

export default FloatingWhatsAppWidget;
