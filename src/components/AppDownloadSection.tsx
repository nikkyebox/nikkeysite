import React, { useState } from 'react';
import { Smartphone, Download, Share, Plus, X, Check, Wifi, Bell, Zap } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import AnimatedPlaneLogo from '@/components/AnimatedPlaneLogo';

// Guia passo a passo para Android / Chrome (modal)
const AndroidGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-green-400 to-blue-500" />
      <div className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <img src="/icons/icon-72x72.png" alt="" className="w-10 h-10 rounded-xl" />
            <div>
              <p className="font-bold text-gray-900 text-sm">Instalar no Android / Chrome</p>
              <p className="text-xs text-gray-500">Via Chrome</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {[
            {
              step: 1,
              icon: <span className="text-sm">⋮</span>,
              title: 'Toque no menu (⋮)',
              desc: 'Três pontos no canto superior direito do Chrome',
            },
            {
              step: 2,
              icon: <Plus className="w-4 h-4 text-green-500" />,
              title: '"Adicionar à tela inicial"',
              desc: 'Ou "Instalar aplicativo" — role o menu para encontrar',
            },
            {
              step: 3,
              icon: <Check className="w-4 h-4 text-green-500" />,
              title: 'Toque em "Instalar"',
              desc: 'O ícone NikkeyBox aparece na tela inicial 🎉',
            },
          ].map(({ step, icon, title, desc }) => (
            <div key={step} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0 mt-0.5 border border-gray-100">
                {icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-gray-400 text-center mt-4">
          💡 No Android, o Chrome pode mostrar um banner automático de instalação.
        </p>

        <button
          onClick={onClose}
          className="w-full mt-4 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-colors"
        >
          Entendido!
        </button>
      </div>
    </div>
  </div>
);

// Guia passo a passo para iOS (modal)
const IOSGuide: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in duration-200">
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-pink-400 to-pink-500" />
      <div className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <img src="/icons/icon-72x72.png" alt="" className="w-10 h-10 rounded-xl" />
            <div>
              <p className="font-bold text-gray-900 text-sm">Instalar no iPhone / iPad</p>
              <p className="text-xs text-gray-500">Via Safari</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {[
            {
              step: 1,
              icon: <Share className="w-4 h-4 text-blue-500" />,
              title: 'Toque em Compartilhar',
              desc: 'Ícone na barra inferior do Safari (quadrado com seta para cima)',
            },
            {
              step: 2,
              icon: <Plus className="w-4 h-4 text-pink-500" />,
              title: '"Adicionar à Tela de Início"',
              desc: 'Role o menu e toque nesta opção',
            },
            {
              step: 3,
              icon: <Check className="w-4 h-4 text-green-500" />,
              title: 'Toque em "Adicionar"',
              desc: 'O ícone NikkeyBox aparece na tela inicial 🎉',
            },
          ].map(({ step, icon, title, desc }) => (
            <div key={step} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center flex-shrink-0 mt-0.5 border border-gray-100">
                {icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-gray-400 text-center mt-4">
          ⚠️ Precisa estar no Safari. Chrome/Firefox no iOS não suportam instalação.
        </p>

        <button
          onClick={onClose}
          className="w-full mt-4 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-sm transition-colors"
        >
          Entendido!
        </button>
      </div>
    </div>
  </div>
);

const AppDownloadSection: React.FC = () => {
  const { platform, canInstall, isInstalled, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide]         = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);
  const [justInstalled, setJustInstalled]       = useState(false);

  const handleAndroidInstall = async () => {
    const result = await install();
    if (result === 'accepted') {
      setJustInstalled(true);
    } else {
      // Sem evento nativo (desktop ou Android sem prompt) → mostra guia manual
      setShowAndroidGuide(true);
    }
  };

  // Já instalado: mostra confirmação
  if (isInstalled || justInstalled) {
    return (
      <section className="bg-gradient-to-br from-pink-50 via-white to-fuchsia-50 py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-3 bg-white rounded-2xl px-8 py-5 shadow-md border border-pink-100">
            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <div className="text-left">
              <p className="font-bold text-gray-900">App instalado com sucesso!</p>
              <p className="text-sm text-gray-500">NikkeyBox está na sua tela inicial 🎌</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      {showAndroidGuide && <AndroidGuide onClose={() => setShowAndroidGuide(false)} />}
      {showIOSGuide && <IOSGuide onClose={() => setShowIOSGuide(false)} />}

      <section className="py-16 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
        {/* Decoração de fundo */}
        <div className="absolute inset-0 opacity-10 pointer-events-none select-none">
          <div className="absolute -top-10 -right-10 w-64 h-64 rounded-full bg-pink-400 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 w-64 h-64 rounded-full bg-pink-400 blur-3xl" />
        </div>

        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto grid lg:grid-cols-2 gap-10 items-center">

            {/* Texto */}
            <div className="text-white">
              <div className="inline-flex items-center gap-2 bg-pink-500/20 border border-pink-500/30 text-pink-300 text-xs font-bold px-3 py-1.5 rounded-full mb-5 uppercase tracking-widest">
                <Smartphone className="w-3.5 h-3.5" /> App Gratuito
              </div>

              <h2 className="font-display text-3xl lg:text-4xl font-black text-white leading-tight mb-4">
                Leve o Japão<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-pink-400">
                  no seu bolso
                </span>
              </h2>

              <p className="text-gray-300 text-base leading-relaxed mb-8">
                Instale o NikkeyBox direto na sua tela inicial — sem App Store, sem Play Store.
                Acesse produtos, rastreie pedidos e faça compras em segundos.
              </p>

              {/* Benefícios */}
              <div className="grid grid-cols-3 gap-3 mb-8">
                {[
                  { icon: <Zap className="w-5 h-5 text-yellow-400" />, label: 'Mais rápido', desc: 'Carrega em 1s' },
                  { icon: <Wifi className="w-5 h-5 text-blue-400" />,   label: 'Leve',        desc: 'Sem ocupar espaço' },
                  { icon: <Bell className="w-5 h-5 text-green-400" />,  label: 'Notificações', desc: 'Pedidos em tempo real' },
                ].map(({ icon, label, desc }) => (
                  <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                    <div className="flex justify-center mb-1.5">{icon}</div>
                    <p className="text-white text-xs font-bold">{label}</p>
                    <p className="text-gray-400 text-[10px] mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>

              {/* Botões de instalação */}
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Android */}
                <button
                  onClick={handleAndroidInstall}
                  disabled={false}
                  className="flex items-center gap-3 bg-white hover:bg-gray-100 active:scale-95 text-gray-900 font-bold px-5 py-3 rounded-xl transition-all shadow-lg group"
                >
                  <svg viewBox="0 0 24 24" className="w-7 h-7 flex-shrink-0" fill="none">
                    <path d="M3.18 23.76c.33.18.7.18 1.03 0L13.5 18.3l-2.12-2.13-8.2 7.59z" fill="#EA4335"/>
                    <path d="M20.96 10.2L18 8.52 15.65 10.8l2.4 2.4 2.91-1.68c.83-.48.83-1.84 0-1.32z" fill="#FBBC05"/>
                    <path d="M4.21.24C3.88.06 3.5.06 3.18.24L13.5 5.7 15.62 3.6z" fill="#4285F4"/>
                    <path d="M13.5 5.7L3.18.24C2.35-.24 1.5.24 1.5 1.2v21.6c0 .96.85 1.44 1.68.96L13.5 18.3l-2.12-2.1v-8.4z" fill="#34A853"/>
                    <path d="M13.5 5.7l2.12 2.1 2.38-2.28L15.62 3.6z" fill="#4285F4"/>
                  </svg>
                  <div className="text-left">
                    <p className="text-[10px] font-normal text-gray-500 leading-none">Disponível no</p>
                    <p className="text-sm font-bold leading-tight">Android / Chrome</p>
                  </div>
                  <Download className="w-4 h-4 ml-auto text-gray-400 group-hover:text-gray-600" />
                </button>

                {/* iOS */}
                <button
                  onClick={() => setShowIOSGuide(true)}
                  className="flex items-center gap-3 bg-white hover:bg-gray-100 active:scale-95 text-gray-900 font-bold px-5 py-3 rounded-xl transition-all shadow-lg group"
                >
                  <svg viewBox="0 0 24 24" className="w-7 h-7 flex-shrink-0" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  <div className="text-left">
                    <p className="text-[10px] font-normal text-gray-500 leading-none">Instalar no</p>
                    <p className="text-sm font-bold leading-tight">iPhone / iPad</p>
                  </div>
                  <Share className="w-4 h-4 ml-auto text-gray-400 group-hover:text-gray-600" />
                </button>
              </div>

              <p className="text-gray-500 text-xs mt-4">
                ✓ 100% gratuito · ✓ Sem cadastro na loja de apps · ✓ Acesso rápido pela tela inicial
              </p>
            </div>

            {/* Preview do "app" (mockup de celular) */}
            <div className="hidden lg:flex justify-center">
              <div className="relative">
                {/* Frame do celular */}
                <div className="w-52 h-96 bg-gray-900 rounded-[2.5rem] border-4 border-gray-700 shadow-2xl overflow-hidden relative">
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-gray-900 rounded-b-xl z-10" />
                  {/* Mesma vinheta cinematográfica usada pelo hero transition */}
                  <div className="absolute inset-0 bg-pink-500">
                    <video
                      src="/videos/hero-store-transition.mp4"
                      poster="/videos/hero-intro-poster.jpg"
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="none"
                      aria-label="Hero transition da NikkeyBox"
                      className="h-full w-full object-cover motion-reduce:hidden"
                    />
                    <img
                      src="/logo.jpg"
                      alt="NikkeyBox"
                      className="hidden h-full w-full object-cover motion-reduce:block"
                    />
                  </div>
                </div>
                <div className="absolute -bottom-4 left-1/2 h-6 w-40 -translate-x-1/2 rounded-full bg-black/20 blur-xl" />
                <div className="absolute -right-6 -top-4 rounded-2xl border border-pink-100 bg-white p-2 shadow-xl">
                  <AnimatedPlaneLogo size={48} />
                  <p className="mt-1 text-center text-[8px] font-medium leading-none text-gray-600">Japan<br/>Express</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  );
};

export default AppDownloadSection;
