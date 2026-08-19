import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, MessageCircle, PackageSearch, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COMPANY_PROFILE } from '@/config/companyProfile';

const WHATSAPP_NUMBER = COMPANY_PROFILE.whatsapp.digits;

export const PersonalShopperBanner: React.FC = () => {
  const handleWhatsAppCustom = () => {
    const text = encodeURIComponent(
      'Olá NikkeyBox! Quero cotar um produto específico do Japão que não encontrei no site. Como funciona a encomenda personalizada?'
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="relative overflow-hidden py-12 sm:py-16 bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-white border-y border-purple-800/40">
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute -left-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-pink-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-purple-500/20 blur-3xl" />

      <div className="container relative mx-auto px-4">
        <div className="max-w-4xl mx-auto rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-10 backdrop-blur-xl shadow-2xl">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="space-y-4 max-w-xl text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-pink-500/20 px-3.5 py-1 text-xs font-bold text-pink-300 border border-pink-500/30">
                <Sparkles className="w-3.5 h-3.5 text-pink-400" /> Serviço Exclusivo de Personal Shopper no Japão
              </div>

              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
                Não achou o que procura? <br className="hidden sm:inline" />
                <span className="bg-gradient-to-r from-pink-400 via-purple-300 to-amber-300 bg-clip-text text-transparent">
                  Nós compramos qualquer produto no Japão para você!
                </span>
              </h2>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Envie o nome, foto ou link do item desejado (cosméticos de lançamento, doces limitados, colecionáveis ou eletrônicos). Cotamos nas lojas do Japão e enviamos direto para sua casa.
              </p>

              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-2 text-xs text-slate-300">
                <span className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> 100% Autêntico
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-4 h-4 text-amber-400" /> Cotação Rápida
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <PackageSearch className="w-4 h-4 text-pink-400" /> Consolidação de Encomendas
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-auto shrink-0">
              <Button
                onClick={handleWhatsAppCustom}
                size="lg"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-900/40 gap-2 h-13 py-3.5 px-6"
              >
                <MessageCircle className="w-5 h-5" />
                Pedir no WhatsApp
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full bg-white/10 hover:bg-white/20 text-white border-white/20 font-bold rounded-2xl gap-2 h-13 py-3.5 px-6"
              >
                <Link to="/faca-seu-pedido">
                  Formulário Online <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PersonalShopperBanner;
