import React, { useState } from 'react';
import { Building2, Ship, Package, TrendingDown, Handshake, Send, CheckCircle, Loader2, FileText } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/context/LanguageContext';
import { isValidCNPJ, maskCNPJ, isValidEmail } from '@/utils/validation';
import { b2bRequestService, B2BShipping } from '@/services/b2bRequestService';
import { WORLD_COUNTRIES } from '@/data/worldCountries';

const COUNTRIES = WORLD_COUNTRIES.map(c => c.name);

const Business: React.FC = () => {
  const { toast } = useToast();
  const { t } = useLanguage();

  const SHIPPING_OPTIONS: { value: B2BShipping; labelKey: string; descKey: string; icon: React.ReactNode }[] = [
    { value: 'container', labelKey: 'business.shipping.container', descKey: 'business.shipping.container.desc', icon: <Ship className="w-5 h-5" /> },
    { value: 'aereo', labelKey: 'business.shipping.aereo', descKey: 'business.shipping.aereo.desc', icon: <Package className="w-5 h-5" /> },
    { value: 'combinar', labelKey: 'business.shipping.combinar', descKey: 'business.shipping.combinar.desc', icon: <Handshake className="w-5 h-5" /> },
  ];

  const BENEFITS = [
    { icon: <TrendingDown className="w-6 h-6" />, titleKey: 'business.benefit1.title', descKey: 'business.benefit1.desc' },
    { icon: <Ship className="w-6 h-6" />, titleKey: 'business.benefit2.title', descKey: 'business.benefit2.desc' },
    { icon: <Handshake className="w-6 h-6" />, titleKey: 'business.benefit3.title', descKey: 'business.benefit3.desc' },
    { icon: <FileText className="w-6 h-6" />, titleKey: 'business.benefit4.title', descKey: 'business.benefit4.desc' },
  ];

  const [form, setForm] = useState({
    razaoSocial: '', cnpj: '', responsavel: '', contact: '', email: '',
    country: 'Brasil', productDesc: '', estimatedQty: '', shipping: 'container' as B2BShipping, notes: '',
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.razaoSocial.trim() || !form.responsavel.trim() || !form.contact.trim() || !form.productDesc.trim()) {
      toast({ title: t('business.toast.missing'), variant: 'destructive' });
      return;
    }
    if (!isValidCNPJ(form.cnpj)) {
      toast({ title: t('business.toast.cnpjInvalid'), description: t('business.toast.cnpjDesc'), variant: 'destructive' });
      return;
    }
    if (form.email && !isValidEmail(form.email)) {
      toast({ title: t('business.toast.emailInvalid'), variant: 'destructive' });
      return;
    }
    setSending(true);
    const ok = await b2bRequestService.create({
      razaoSocial: form.razaoSocial.trim(),
      cnpj: form.cnpj.trim(),
      responsavel: form.responsavel.trim(),
      contact: form.contact.trim(),
      email: form.email.trim(),
      country: form.country,
      productDesc: form.productDesc.trim(),
      estimatedQty: form.estimatedQty.trim() || 'A definir',
      shipping: form.shipping,
      notes: form.notes.trim(),
    });
    setSending(false);
    if (ok) {
      setSent(true);
      toast({ title: `✅ ${t('business.toast.success')}`, description: t('business.toast.successDesc') });
    } else {
      toast({ title: t('business.toast.error'), description: t('business.toast.errorDesc'), variant: 'destructive' });
    }
  };

  return (
    <Layout>
      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-primary/80 text-white py-20">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-white/15 font-semibold text-sm px-4 py-1.5 rounded-full mb-4">
            <Building2 className="w-4 h-4" /> {t('business.badge')}
          </div>
          <h1 className="font-display text-4xl lg:text-5xl font-bold mb-4">
            {t('business.title')}
          </h1>
          <p className="text-white/85 text-lg">
            {t('business.subtitle')}
          </p>
        </div>
      </div>

      {/* Benefits */}
      <section className="py-14 bg-background">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {BENEFITS.map((b) => (
              <div key={b.titleKey} className="bg-card border border-border rounded-2xl p-5">
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">{b.icon}</div>
                <h3 className="font-bold text-foreground mb-1">{t(b.titleKey)}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{t(b.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* B2B Form */}
      <section className="pb-16 bg-background">
        <div className="container mx-auto px-4 max-w-2xl">
          {sent ? (
            <div className="text-center py-16 bg-card rounded-2xl border border-border">
              <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
              <h2 className="font-display text-2xl font-bold mb-2">{t('business.sent.title')}</h2>
              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                {t('business.sent.desc')}
              </p>
              <Button onClick={() => { setSent(false); set('productDesc', ''); set('notes', ''); }} variant="outline" className="rounded-xl">
                {t('business.sent.again')}
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="bg-card rounded-2xl border border-border p-6 lg:p-8 space-y-5">
              <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
                <Building2 className="w-6 h-6 text-primary" /> {t('business.form.title')}
              </h2>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold block mb-1">{t('business.form.razaoSocial')}</label>
                  <input value={form.razaoSocial} onChange={(e) => set('razaoSocial', e.target.value)} placeholder={t('business.form.razaoSocialPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1">{t('business.form.cnpj')}</label>
                  <input value={form.cnpj} onChange={(e) => set('cnpj', maskCNPJ(e.target.value))} placeholder="00.000.000/0000-00"
                    inputMode="numeric" className="w-full px-3 py-2 rounded-lg border border-border bg-background font-mono" />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold block mb-1">{t('business.form.responsavel')}</label>
                  <input value={form.responsavel} onChange={(e) => set('responsavel', e.target.value)} placeholder={t('business.form.responsavelPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1">{t('business.form.whatsapp')}</label>
                  <input value={form.contact} onChange={(e) => set('contact', e.target.value)} placeholder={t('business.form.whatsappPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold block mb-1">{t('business.form.email')}</label>
                  <input value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="comercial@empresa.com"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
                </div>
                <div>
                  <label className="text-sm font-semibold block mb-1">{t('business.form.country')}</label>
                  <select value={form.country} onChange={(e) => set('country', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background">
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold block mb-1">{t('business.form.product')}</label>
                <textarea value={form.productDesc} onChange={(e) => set('productDesc', e.target.value)} rows={3}
                  placeholder={t('business.form.productPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background resize-y" />
              </div>

              <div>
                <label className="text-sm font-semibold block mb-1">{t('business.form.qty')}</label>
                <input value={form.estimatedQty} onChange={(e) => set('estimatedQty', e.target.value)}
                  placeholder={t('business.form.qtyPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background" />
              </div>

              <div>
                <label className="text-sm font-semibold block mb-2">{t('business.form.shippingPref')}</label>
                <div className="grid sm:grid-cols-3 gap-3">
                  {SHIPPING_OPTIONS.map((opt) => (
                    <button type="button" key={opt.value} onClick={() => set('shipping', opt.value)}
                      className={`text-left p-3 rounded-xl border-2 transition-all ${
                        form.shipping === opt.value ? 'border-primary bg-primary/5' : 'border-border hover:border-gray-300'
                      }`}>
                      <div className="flex items-center gap-2 text-primary mb-1">{opt.icon}<span className="font-semibold text-sm text-foreground">{t(opt.labelKey)}</span></div>
                      <p className="text-[11px] text-muted-foreground leading-snug">{t(opt.descKey)}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold block mb-1">{t('business.form.notes')}</label>
                <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2}
                  placeholder={t('business.form.notesPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background resize-y" />
              </div>

              <Button type="submit" disabled={sending} className="w-full btn-primary rounded-xl py-6 text-lg font-bold gap-2">
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {sending ? t('business.form.sending') : t('business.form.submit')}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {t('business.form.noCommit')}
              </p>
            </form>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default Business;
