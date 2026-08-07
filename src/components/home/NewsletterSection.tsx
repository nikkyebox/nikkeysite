import React, { useState } from 'react';
import { Mail, CheckCircle2, Loader2 } from 'lucide-react';
import { newsletterService } from '@/services/newsletterService';

/** Captação de e-mail na home — mesmo serviço de leads já usado no popup de saída. */
const NewsletterSection: React.FC = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'invalid'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setStatus('invalid');
      return;
    }
    setStatus('loading');
    await newsletterService.capture({ email: value, source: 'newsletter_footer' });
    setStatus('done');
    setEmail('');
  };

  return (
    <section className="py-16 bg-gradient-to-br from-pink-600 to-amber-500">
      <div className="container mx-auto px-4">
        <div className="max-w-xl mx-auto text-center text-white">
          <Mail className="w-10 h-10 mx-auto mb-3" />
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-2">
            Fique por dentro das novidades
          </h2>
          <p className="text-white/90 mb-6">
            Receba avisos de novos produtos e promoções direto no seu e-mail.
          </p>

          {status === 'done' ? (
            <div className="flex items-center justify-center gap-2 bg-white/15 backdrop-blur rounded-xl py-3.5 px-5 font-semibold">
              <CheckCircle2 className="w-5 h-5" />
              Inscrição confirmada! Obrigado 🎉
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (status === 'invalid') setStatus('idle'); }}
                placeholder="seu@email.com"
                className="flex-1 rounded-xl px-4 py-3 text-gray-900 font-medium placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-white"
                required
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl px-6 py-3 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {status === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Inscrever'}
              </button>
            </form>
          )}
          {status === 'invalid' && (
            <p className="text-sm text-white/90 mt-2 font-medium">Digite um e-mail válido.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default NewsletterSection;
