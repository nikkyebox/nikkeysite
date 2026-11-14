import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { renderRich } from '@/utils/richText';
import {
  Package, CreditCard, Plane, Landmark, Truck, Home,
  Smartphone, Search, QrCode, Copy, Check,
  ArrowRight, MapPin, Bell, Percent, ShieldCheck,
  Building2, ChevronDown, FileText, BadgeCheck, Briefcase, Clock,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/LanguageContext';

/* ════════════════════════════════════════════════════════════════
   "Como Funciona" — jornada do pedido, pagamento, impostos e rastreio,
   com desenhos interativos (SVG animado + passos clicáveis).
   ════════════════════════════════════════════════════════════════ */

type T = (key: string) => string;

const getJourney = (t: T) => [
  { icon: Package, color: '#a855f7', title: t('how.j1.title'), desc: t('how.j1.desc') },
  { icon: CreditCard, color: '#f59e0b', title: t('how.j2.title'), desc: t('how.j2.desc') },
  { icon: Package, color: '#8b5cf6', title: t('how.j3.title'), desc: t('how.j3.desc') },
  { icon: Plane, color: '#3b82f6', title: t('how.j4.title'), desc: t('how.j4.desc') },
  { icon: Landmark, color: '#ef4444', title: t('how.j5.title'), desc: t('how.j5.desc') },
  { icon: Truck, color: '#22c55e', title: t('how.j6.title'), desc: t('how.j6.desc') },
  { icon: Home, color: '#0ea5e9', title: t('how.j7.title'), desc: t('how.j7.desc') },
];

const getPayments = (t: T) => [
  {
    id: 'pix', icon: QrCode, color: '#22c55e', label: 'PIX', tag: t('how.pay.pix.tag'),
    short: t('how.pay.pix.short'),
    steps: [t('how.pay.pix.s1'), t('how.pay.pix.s2'), t('how.pay.pix.s3'), t('how.pay.pix.s4')],
  },
  {
    id: 'card', icon: CreditCard, color: '#6366f1', label: t('how.pay.card.label'), tag: t('how.pay.card.tag'),
    short: t('how.pay.card.short'),
    steps: [t('how.pay.card.s1'), t('how.pay.card.s2'), t('how.pay.card.s3'), t('how.pay.card.s4')],
  },
];

const getPickup = (t: T) => [
  { ic: Home, color: '#22c55e', t: t('how.pk1.t'), d: t('how.pk1.d') },
  { ic: MapPin, color: '#3b82f6', t: t('how.pk2.t'), d: t('how.pk2.d') },
  { ic: ShieldCheck, color: '#8b5cf6', t: t('how.pk3.t'), d: t('how.pk3.d') },
];

const getTrackStates = (t: T) => [
  { ic: Package, lb: t('how.st1.lb'), sub: t('how.st1.sub'), color: '#a855f7' },
  { ic: Plane, lb: t('how.st2.lb'), sub: t('how.st2.sub'), color: '#3b82f6' },
  { ic: Landmark, lb: t('how.st3.lb'), sub: t('how.st3.sub'), color: '#ef4444' },
  { ic: Truck, lb: t('how.st4.lb'), sub: t('how.st4.sub'), color: '#f59e0b' },
  { ic: Home, lb: t('how.st5.lb'), sub: t('how.st5.sub'), color: '#22c55e' },
];

const getTrackingSteps = (t: T) => [
  [t('how.tk1.title'), t('how.tk1.desc')],
  [t('how.tk2.title'), t('how.tk2.desc')],
  [t('how.tk3.title'), t('how.tk3.desc')],
  [t('how.tk4.title'), t('how.tk4.desc')],
];

// ---------- TAX (language-aware) ----------
type TaxKey = 'Brasil' | 'Europa' | 'Japão';

interface TaxEntry {
  flag: string; tone: string; label: string;
  headline: string;
  rows: [string, string][];
  note: string;
  flow: { lb: string; sub: string }[];
}

const getTax = (t: T): Record<TaxKey, TaxEntry> => ({
  Brasil: {
    flag: '🇧🇷', tone: '#f59e0b', label: t('how.tax.br.label'),
    headline: t('how.tax.br.headline'),
    rows: [
      [t('how.tax.br.r1a'), t('how.tax.br.r1b')],
      [t('how.tax.br.r2a'), t('how.tax.br.r2b')],
    ],
    note: t('how.tax.br.note'),
    flow: [
      { lb: t('how.tax.br.f1'), sub: t('how.tax.br.f1s') },
      { lb: t('how.tax.br.f2'), sub: t('how.tax.br.f2s') },
      { lb: t('how.tax.br.f3'), sub: t('how.tax.br.f3s') },
    ],
  },
  Europa: {
    flag: '🇪🇺', tone: '#3b82f6', label: t('how.tax.eu.label'),
    headline: t('how.tax.eu.headline'),
    rows: [
      [t('how.tax.eu.r1a'), t('how.tax.eu.r1b')],
      [t('how.tax.eu.r2a'), t('how.tax.eu.r2b')],
    ],
    note: t('how.tax.eu.note'),
    flow: [
      { lb: t('how.tax.eu.f1'), sub: t('how.tax.eu.f1s') },
      { lb: t('how.tax.eu.f2'), sub: t('how.tax.eu.f2s') },
      { lb: t('how.tax.eu.f3'), sub: t('how.tax.eu.f3s') },
    ],
  },
  Japão: {
    flag: '🇯🇵', tone: '#22c55e', label: t('how.tax.jp.label'),
    headline: t('how.tax.jp.headline'),
    rows: [
      [t('how.tax.jp.r1a'), t('how.tax.jp.r1b')],
      [t('how.tax.jp.r2a'), t('how.tax.jp.r2b')],
    ],
    note: t('how.tax.jp.note'),
    flow: [
      { lb: t('how.tax.jp.f1'), sub: t('how.tax.jp.f1s') },
      { lb: t('how.tax.jp.f2'), sub: t('how.tax.jp.f2s') },
      { lb: t('how.tax.jp.f3'), sub: t('how.tax.jp.f3s') },
    ],
  },
});

// ---------- SUBCOMPONENTS ----------

interface JourneyStepperProps { t: (key: string) => string; }
const JourneyStepper: React.FC<JourneyStepperProps> = ({ t }) => {
  const JOURNEY = getJourney(t);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % JOURNEY.length), 6000);
    return () => clearInterval(id);
  }, [paused, JOURNEY.length]);

  const pick = (i: number) => { setActive(i); setPaused(true); };
  const Cur = JOURNEY[active];
  const pct = (active / (JOURNEY.length - 1)) * 100;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 sm:p-8 shadow-sm">
      <div className="relative mb-8 pt-6">
        <div className="absolute left-0 right-0 top-[42px] h-1.5 bg-secondary rounded-full" />
        <div
          className="absolute left-0 top-[42px] h-1.5 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#a855f7,#f59e0b)' }}
        />
        <div
          className="absolute -top-1 transition-all duration-700 ease-out z-10"
          style={{ left: `calc(${pct}% - 16px)` }}
        >
          <div className="w-9 h-9 rounded-full bg-white shadow-lg border-2 flex items-center justify-center"
            style={{ borderColor: Cur.color }}>
            <Plane className="w-4 h-4" style={{ color: Cur.color }} />
          </div>
        </div>

        <div className="flex justify-between relative">
          {JOURNEY.map((s, i) => {
            const Ico = s.icon;
            const done = i <= active;
            return (
              <button
                key={i}
                onClick={() => pick(i)}
                className="flex flex-col items-center gap-2 group"
                style={{ width: `${100 / JOURNEY.length}%` }}
              >
                <span
                  className={cn(
                    'w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all duration-300 shrink-0',
                    done ? 'scale-100' : 'scale-90 opacity-50',
                    i === active && 'ring-4 ring-offset-2 ring-offset-card'
                  )}
                  style={{
                    background: done ? s.color : 'var(--secondary, #f1f5f9)',
                    borderColor: s.color,
                    color: done ? '#fff' : s.color,
                    boxShadow: i === active ? `0 0 0 4px ${s.color}33` : undefined,
                  }}
                >
                  <Ico className="w-5 h-5" />
                </span>
                <span className={cn(
                  'text-xs sm:text-xs font-semibold text-center leading-tight hidden sm:block transition-colors',
                  i === active ? 'text-foreground' : 'text-muted-foreground'
                )}>
                  {s.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div key={active} className="animate-fade-up flex items-start gap-4 bg-secondary/40 rounded-xl p-5 border border-border/60">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${Cur.color}1a` }}>
          <Cur.icon className="w-6 h-6" style={{ color: Cur.color }} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: Cur.color }}>
            {t('howItWorks.step')} {active + 1} {t('howItWorks.of')} {JOURNEY.length}
          </p>
          <h3 className="font-bold text-lg text-foreground mb-1">{Cur.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{Cur.desc}</p>
        </div>
      </div>
      <div className="text-center mt-3">
        {paused ? (
          <button onClick={() => setPaused(false)} className="text-xs font-semibold text-primary hover:underline">
            {t('howItWorks.paused')}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">{t('howItWorks.tapToPause')}</p>
        )}
      </div>
    </div>
  );
};

interface PaymentMethodsProps { t: (key: string) => string; }
const PaymentMethods: React.FC<PaymentMethodsProps> = ({ t }) => {
  const PAYMENTS = getPayments(t);
  const [open, setOpen] = useState('pix');
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {PAYMENTS.map((p) => {
        const Ico = p.icon;
        const isOpen = open === p.id;
        return (
          <button
            key={p.id}
            onClick={() => setOpen(p.id)}
            className={cn(
              'text-left rounded-2xl border p-5 transition-all duration-300',
              isOpen ? 'shadow-lg scale-[1.02] bg-card' : 'bg-card/60 hover:bg-card'
            )}
            style={{ borderColor: isOpen ? p.color : undefined }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${p.color}1a` }}>
                <Ico className="w-6 h-6" style={{ color: p.color }} />
              </span>
              <div>
                <h4 className="font-bold text-foreground leading-none">{p.label}</h4>
                <span className="text-xs text-muted-foreground">{p.tag}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{p.short}</p>

            <div className={cn('overflow-hidden transition-all duration-500', isOpen ? 'max-h-72' : 'max-h-0')}>
              <ol className="space-y-2 pt-2 border-t border-border">
                {p.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-xs text-foreground">
                    <span className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: p.color }}>{i + 1}</span>
                    <span className="leading-snug text-muted-foreground">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            {!isOpen && <span className="text-xs font-semibold" style={{ color: p.color }}>{t('howItWorks.seeStepByStep')}</span>}
          </button>
        );
      })}
    </div>
  );
};

interface TaxExplainerProps { t: (key: string) => string; }
const TaxExplainer: React.FC<TaxExplainerProps> = ({ t }) => {
  const [c, setC] = useState<TaxKey>('Brasil');
  const TAX = getTax(t);
  const tx = TAX[c];
  const FLOW_ICONS = [Package, Landmark, Smartphone];
  return (
    <div className="bg-card rounded-2xl border border-border p-5 sm:p-7 shadow-sm">
      <div className="flex gap-2 mb-5">
        {(Object.keys(TAX) as TaxKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setC(k)}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all',
              c === k ? 'text-white shadow' : 'bg-secondary/40 text-muted-foreground hover:text-foreground'
            )}
            style={{ background: c === k ? TAX[k].tone : undefined, borderColor: c === k ? TAX[k].tone : 'transparent' }}
          >
            <span className="mr-1">{TAX[k].flag}</span>{TAX[k].label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mb-5">
        {tx.flow.map((s, i, arr) => {
          const Ico = FLOW_ICONS[i];
          return (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center text-center gap-1.5 flex-1">
                <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: `${tx.tone}1a` }}>
                  <Ico className="w-5 h-5" style={{ color: tx.tone }} />
                </span>
                <span className="text-xs font-bold text-foreground leading-none">{s.lb}</span>
                <span className="text-xs text-muted-foreground">{s.sub}</span>
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>

      <div key={c} className="animate-fade-up rounded-xl p-4 border" style={{ background: `${tx.tone}0d`, borderColor: `${tx.tone}33` }}>
        <p className="font-bold text-foreground flex items-center gap-2 mb-3">
          <Percent className="w-4 h-4" style={{ color: tx.tone }} /> {tx.headline}
        </p>
        <div className="space-y-2 mb-3">
          {tx.rows.map(([a, b], i) => (
            <div key={i} className="flex justify-between items-center text-xs gap-3 border-b border-border/50 pb-2 last:border-0">
              <span className="text-muted-foreground">{a}</span>
              <span className="font-bold text-foreground text-right" style={{ color: tx.tone }}>{b}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed bg-background/60 rounded-lg p-2.5">
          ⚠️ {tx.note}
        </p>
      </div>
    </div>
  );
};

interface CorreiosTrackingProps { t: (key: string) => string; }
const CorreiosTracking: React.FC<CorreiosTrackingProps> = ({ t }) => {
  const TRACK_STATES = getTrackStates(t);
  const trackingSteps = getTrackingSteps(t);
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const fakeCode = 'LB123456789JP';

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setStep((s) => (s + 1) % (TRACK_STATES.length + 1)), 3500);
    return () => clearInterval(id);
  }, [paused, TRACK_STATES.length]);

  const copy = () => {
    navigator.clipboard?.writeText(fakeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6 items-center">
      <div className="flex flex-col items-center">
        <div
          onClick={() => setPaused((p) => !p)}
          title={t('ui.pauseHint')}
          className="w-[270px] rounded-[2.2rem] border-[10px] border-foreground/90 bg-background shadow-2xl overflow-hidden cursor-pointer select-none">
          <div className="h-6 bg-foreground/90 flex items-center justify-center">
            <div className="w-16 h-1.5 bg-background/40 rounded-full" />
          </div>
          <div className="px-4 py-3 text-white flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#facc15,#eab308)' }}>
            <span className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center">📮</span>
            <span className="font-bold text-sm">{t('ui.correiosApp')}</span>
          </div>
          <div className="p-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-2.5 py-2 mb-3">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-mono text-foreground tracking-wide">{fakeCode}</span>
            </div>
            <div className="space-y-0">
              {TRACK_STATES.map((s, i) => {
                const reached = i < step;
                const current = i === step - 1;
                const Ico = s.ic;
                return (
                  <div key={i} className="flex gap-2.5 items-start">
                    <div className="flex flex-col items-center">
                      <span className={cn('w-6 h-6 rounded-full flex items-center justify-center transition-all duration-500',
                        current && 'ring-4', reached ? '' : 'opacity-30')}
                        style={{ background: reached ? s.color : '#cbd5e1', boxShadow: current ? `0 0 0 3px ${s.color}44` : undefined }}>
                        <Ico className="w-3 h-3 text-white" />
                      </span>
                      {i < TRACK_STATES.length - 1 && (
                        <span className="w-0.5 h-5 transition-colors duration-500" style={{ background: reached ? s.color : '#e2e8f0' }} />
                      )}
                    </div>
                    <div className={cn('pb-1 transition-opacity duration-500', reached ? 'opacity-100' : 'opacity-40')}>
                      <p className="text-xs font-bold text-foreground leading-tight">{s.lb}</p>
                      <p className="text-xs text-muted-foreground">{s.sub}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <button onClick={() => setPaused((p) => !p)} className="text-xs font-semibold text-primary hover:underline mt-3">
          {paused ? t('howItWorks.phonePause') : t('howItWorks.phoneTap')}
        </button>
      </div>

      <div>
        <h3 className="font-bold text-xl text-foreground mb-3 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" /> {t('howItWorks.tracking.instructions.title')}
        </h3>
        <ol className="space-y-3 mb-5">
          {trackingSteps.map(([title, desc], i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <div>
                <p className="font-semibold text-sm text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-col sm:flex-row flex-wrap gap-2 mb-4">
          <Button onClick={copy} variant="outline" className="gap-2 justify-center min-w-0 flex-1 sm:flex-none">
            {copied ? <Check className="w-4 h-4 text-green-600 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
            <span className="truncate">{copied ? t('howItWorks.tracking.btn.copied') : t('howItWorks.tracking.btn.copy')}</span>
          </Button>
          <Button asChild className="btn-primary gap-2 justify-center min-w-0 flex-1 sm:flex-none">
            <Link to="/rastrear"><MapPin className="w-4 h-4 shrink-0" /> <span className="truncate">{t('howItWorks.tracking.btn.track')}</span></Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground flex items-start gap-1.5 bg-secondary/40 rounded-lg p-3">
          <Bell className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          {t('howItWorks.tracking.tip')}
        </p>
      </div>
    </div>
  );
};

// ---------- Business Import (expandable banner) ----------
const getBizSteps = (t: T) => [
  { ic: BadgeCheck, t: t('how.biz.s1.t'), d: t('how.biz.s1.d') },
  { ic: Briefcase, t: t('how.biz.s2.t'), d: t('how.biz.s2.d') },
  { ic: FileText, t: t('how.biz.s3.t'), d: t('how.biz.s3.d') },
  { ic: Percent, t: t('how.biz.s4.t'), d: t('how.biz.s4.d') },
];

const getBizBody = (t: (key: string) => string) => ({
  intro: <>{renderRich(t('how.biz.intro'))}</>,
  note: <>{renderRich(t('how.biz.note'))}</>,
});

interface BusinessImportProps { t: (key: string) => string; }
const BusinessImport: React.FC<BusinessImportProps> = ({ t }) => {
  const [open, setOpen] = useState(false);
  const BIZ_STEPS = getBizSteps(t);
  const bizBody = getBizBody(t);
  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-4 p-5 text-left hover:bg-primary/5 transition-colors"
      >
        <span className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-primary" />
        </span>
        <div className="flex-1">
          <h3 className="font-bold text-foreground">{t('howItWorks.biz.title')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('howItWorks.biz.subtitle')}
          </p>
        </div>
        <ChevronDown className={cn('w-5 h-5 text-primary shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      <div className={cn('transition-all duration-500 overflow-hidden', open ? 'max-h-[700px]' : 'max-h-0')}>
        <div className="px-5 pb-5 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed bg-background/60 rounded-xl p-3 border border-border">
            {bizBody.intro}
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            {BIZ_STEPS.map((s) => (
              <div key={s.t} className="bg-background rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <s.ic className="w-4 h-4 text-primary shrink-0" />
                  <h4 className="font-bold text-sm text-foreground">{s.t}</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {bizBody.note}
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button asChild className="btn-primary gap-2">
              <Link to="/empresas"><Building2 className="w-4 h-4" /> {t('howItWorks.biz.btn')}</Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/faca-seu-pedido">{t('howItWorks.biz.quote')}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------- PAGE ----------
const HowItWorks: React.FC = () => {
  const { t } = useLanguage();
  const PICKUP = getPickup(t);

  return (
    <Layout>
      {/* Hero */}
      <div className="gradient-hero py-16">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4">
            {t('howItWorks.title')}
          </h1>
          <p className="text-muted-foreground text-lg">
            {t('howItWorks.subtitle')}
          </p>
        </div>
      </div>

      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-5xl space-y-16">

          {/* 1. Jornada */}
          <div>
            <header className="mb-5 text-center">
              <h2 className="font-display text-2xl font-bold text-foreground">{t('howItWorks.journey.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('howItWorks.journey.subtitle')}</p>
            </header>
            <JourneyStepper t={t} />
          </div>

          {/* 2. Pagamento */}
          <div>
            <header className="mb-5 text-center">
              <h2 className="font-display text-2xl font-bold text-foreground flex items-center justify-center gap-2">
                <CreditCard className="w-6 h-6 text-primary" /> {t('howItWorks.payment.title')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('howItWorks.payment.subtitle')}</p>
            </header>
            <PaymentMethods t={t} />
          </div>

          {/* 3. Impostos */}
          <div>
            <header className="mb-5 text-center">
              <h2 className="font-display text-2xl font-bold text-foreground flex items-center justify-center gap-2">
                <Landmark className="w-6 h-6 text-primary" /> {t('howItWorks.tax.title')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('howItWorks.tax.subtitle')}</p>
            </header>
            <TaxExplainer t={t} />
            <p className="text-center text-xs text-muted-foreground mt-3">
              {t('howItWorks.taxSimText')} <Link to="/frete" className="text-primary font-semibold hover:underline">{t('howItWorks.taxSimLink')}</Link>.
            </p>
            <div className="mt-5">
              <BusinessImport t={t} />
            </div>
          </div>

          {/* 4. Como retirar */}
          <div>
            <header className="mb-5 text-center">
              <h2 className="font-display text-2xl font-bold text-foreground flex items-center justify-center gap-2">
                <Truck className="w-6 h-6 text-primary" /> {t('howItWorks.pickup.title')}
              </h2>
            </header>
            <div className="grid md:grid-cols-3 gap-4">
              {PICKUP.map((p) => (
                <div key={p.t} className="bg-card rounded-2xl border border-border p-5 hover:shadow-md transition-shadow">
                  <span className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: `${p.color}1a` }}>
                    <p.ic className="w-6 h-6" style={{ color: p.color }} />
                  </span>
                  <h4 className="font-bold text-foreground mb-1">{p.t}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 5. Rastreamento */}
          <div>
            <header className="mb-5 text-center">
              <h2 className="font-display text-2xl font-bold text-foreground flex items-center justify-center gap-2">
                <Search className="w-6 h-6 text-primary" /> {t('howItWorks.tracking.title')}
              </h2>
            </header>
            <div className="bg-card rounded-2xl border border-border p-5 sm:p-8 shadow-sm">
              <CorreiosTracking t={t} />
            </div>
          </div>

          {/* CTA final */}
          <div className="text-center bg-primary/5 border border-primary/20 rounded-2xl p-8">
            <Clock className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="font-display text-xl font-bold text-foreground mb-2">{t('howItWorks.cta.title')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('howItWorks.cta.subtitle')}</p>
            <Button asChild className="btn-primary gap-2">
              <Link to="/produtos">{t('howItWorks.cta.btn')} <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          </div>

        </div>
      </section>
    </Layout>
  );
};

export default HowItWorks;
