import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, CreditCard, Plane, Landmark, Truck, Home,
  Smartphone, Search, QrCode, Wallet, Globe2, Copy, Check,
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

const getJourney = (lang: string) => {
  if (lang === 'en') return [
    { icon: Package, color: '#a855f7', title: 'You place the order', desc: 'Choose products in the catalog and complete your cart. Can be a ready product or a custom "Place Your Order".' },
    { icon: CreditCard, color: '#f59e0b', title: 'Payment', desc: 'Pay via PIX or Wise (Brazil), PayPay (Japan) or Wise (international). We start preparing only after payment confirmation.' },
    { icon: Package, color: '#8b5cf6', title: 'Preparation in Hiroshima', desc: 'We carefully pick and pack everything in our Japan store, with extra protection for the journey.' },
    { icon: Plane, color: '#3b82f6', title: 'Air / sea shipping', desc: 'The package travels from Japan to your country via the chosen carrier (EMS, Correios, Yamato, sea...).' },
    { icon: Landmark, color: '#ef4444', title: 'Customs & taxes', desc: 'On arrival, customs inspects the package. If there is tax, you receive a notification and pay online BEFORE release — never in cash to the postal worker.' },
    { icon: Truck, color: '#22c55e', title: 'Carrier delivers', desc: "Your country's postal service handles the last mile. You track everything with the tracking code." },
    { icon: Home, color: '#0ea5e9', title: 'Arrives at your door 🎉', desc: 'You receive at your door (or pick up at the post office if you prefer). Done — a piece of Japan has arrived!' },
  ];
  if (lang === 'ja') return [
    { icon: Package, color: '#a855f7', title: 'ご注文', desc: 'カタログから商品を選んでカートに入れます。既製品のほか、カスタム注文も承っています。' },
    { icon: CreditCard, color: '#f59e0b', title: 'お支払い', desc: 'PIXまたはWise（ブラジル）、PayPay（日本）、Wise（海外）でお支払いいただけます。入金確認後に準備を開始します。' },
    { icon: Package, color: '#8b5cf6', title: '広島での準備', desc: '日本の店舗で丁寧に商品をピッキングし、長距離輸送に備えた特別な梱包を施します。' },
    { icon: Plane, color: '#3b82f6', title: '航空便・船便での発送', desc: '選択した配送業者（EMS、Correios、ヤマト、船便など）で日本からお届け先の国へ発送します。' },
    { icon: Landmark, color: '#ef4444', title: '税関・関税', desc: '到着後、税関が荷物を検査します。関税がある場合は通知が届き、オンラインで支払い後に通関されます。配達員への現金払いは不要です。' },
    { icon: Truck, color: '#22c55e', title: '配達', desc: 'お届け先の郵便局が最後の配送を担当します。追跡番号ですべてのステップを確認できます。' },
    { icon: Home, color: '#0ea5e9', title: 'ご自宅に到着 🎉', desc: 'ご自宅でお受け取り（または郵便局での受取も可能）。日本のアイテムがお手元に届きます！' },
  ];
  return [
    { icon: Package, color: '#a855f7', title: 'Você faz o pedido', desc: 'Escolhe os produtos no catálogo e fecha o carrinho. Pode ser produto pronto ou um "Faça seu Pedido" personalizado.' },
    { icon: CreditCard, color: '#f59e0b', title: 'Pagamento', desc: 'Você paga por PIX ou Wise (Brasil), PayPay (Japão) ou Wise (internacional). Só preparamos o pacote depois do pagamento confirmado.' },
    { icon: Package, color: '#8b5cf6', title: 'Preparo em Hiroshima', desc: 'Separamos e embalamos tudo com carinho na nossa loja no Japão, com proteção extra para a viagem.' },
    { icon: Plane, color: '#3b82f6', title: 'Envio aéreo / marítimo', desc: 'O pacote viaja do Japão até o seu país pela transportadora escolhida (EMS, Correios, Yamato, navio...).' },
    { icon: Landmark, color: '#ef4444', title: 'Alfândega & impostos', desc: 'Na chegada, a Receita Federal fiscaliza o pacote. Se houver imposto, você recebe a notificação e paga online ANTES da liberação — nunca em dinheiro ao carteiro.' },
    { icon: Truck, color: '#22c55e', title: 'Correios entrega', desc: 'Os Correios do seu país assumem a última etapa. Você acompanha tudo pelo código de rastreio.' },
    { icon: Home, color: '#0ea5e9', title: 'Chega na sua casa 🎉', desc: 'Você recebe na porta (ou retira na agência, se preferir). Pronto — um pedacinho do Japão chegou!' },
  ];
};

const getPayments = (lang: string) => {
  if (lang === 'en') return [
    {
      id: 'pix', icon: QrCode, color: '#22c55e', label: 'PIX', tag: 'Brazil 🇧🇷',
      short: 'Instant payment with QR Code or copy-paste code.',
      steps: [
        'At checkout, choose PIX.',
        'Open your bank app and scan the QR Code (or paste the code).',
        'Confirm the exact amount and pay.',
        'Payment is identified automatically and your order enters preparation.',
      ],
    },
    {
      id: 'paypay', icon: Wallet, color: '#ef4444', label: 'PayPay', tag: 'Japan 🇯🇵',
      short: 'Most used digital wallet in Japan, via QR Code.',
      steps: [
        'At checkout, choose PayPay.',
        'Open the PayPay app and tap "Scan".',
        'Scan the NikkeyBox QR Code.',
        'Enter the exact amount and confirm payment.',
      ],
    },
    {
      id: 'wise', icon: Globe2, color: '#3b82f6', label: 'Wise', tag: 'Brazil 🇧🇷 & International 🌍',
      short: 'Cheap international transfer — Brazil, Europe and other countries.',
      steps: [
        'At checkout, choose Wise.',
        'You receive a Wise payment link (or Wisetag).',
        'Open the link and pay in your local currency (EUR, USD...).',
        'Send us the receipt and we confirm preparation.',
      ],
    },
  ];
  if (lang === 'ja') return [
    {
      id: 'pix', icon: QrCode, color: '#22c55e', label: 'PIX', tag: 'ブラジル 🇧🇷',
      short: 'QRコードまたはコピー＆ペーストコードで即時支払い。',
      steps: [
        'チェックアウトでPIXを選択。',
        '銀行アプリを開いてQRコードをスキャン（またはコードを貼り付け）。',
        '正確な金額を確認して支払い。',
        '支払いが自動認識され、注文の準備が開始されます。',
      ],
    },
    {
      id: 'paypay', icon: Wallet, color: '#ef4444', label: 'PayPay', tag: '日本 🇯🇵',
      short: 'QRコードで使える、日本で最も利用されている電子財布。',
      steps: [
        'チェックアウトでPayPayを選択。',
        'PayPayアプリを開いて「スキャン」をタップ。',
        'NikkeyBoxのQRコードをスキャン。',
        '正確な金額を入力して支払いを確認。',
      ],
    },
    {
      id: 'wise', icon: Globe2, color: '#3b82f6', label: 'Wise', tag: 'ブラジル 🇧🇷 & 海外 🌍',
      short: '低コストの国際送金 — ブラジル、ヨーロッパ、その他の国々。',
      steps: [
        'チェックアウトでWiseを選択。',
        'Wise支払いリンク（またはWisetag）が届きます。',
        'リンクを開いて地元通貨（EUR、USDなど）で支払い。',
        '領収書をお送りいただければ準備を確認します。',
      ],
    },
  ];
  return [
    {
      id: 'pix', icon: QrCode, color: '#22c55e', label: 'PIX', tag: 'Brasil 🇧🇷',
      short: 'Pagamento instantâneo com QR Code ou código copia-e-cola.',
      steps: [
        'No checkout, escolha PIX.',
        'Abra o app do seu banco e escaneie o QR Code (ou cole o código).',
        'Confirme o valor exato e pague.',
        'O pagamento é identificado automaticamente e seu pedido entra em preparo.',
      ],
    },
    {
      id: 'paypay', icon: Wallet, color: '#ef4444', label: 'PayPay', tag: 'Japão 🇯🇵',
      short: 'Carteira digital mais usada no Japão, via QR Code.',
      steps: [
        'No checkout, escolha PayPay.',
        'Abra o app PayPay e toque em "Scan".',
        'Escaneie o QR Code da NikkeyBox.',
        'Digite o valor exato e confirme o pagamento.',
      ],
    },
    {
      id: 'wise', icon: Globe2, color: '#3b82f6', label: 'Wise', tag: 'Brasil 🇧🇷 & Internacional 🌍',
      short: 'Transferência internacional barata — Brasil, Europa e outros países.',
      steps: [
        'No checkout, escolha Wise.',
        'Você recebe um link de cobrança Wise (ou Wisetag).',
        'Abra o link e pague na sua moeda local (EUR, USD...).',
        'Nos envie o comprovante e confirmamos o preparo.',
      ],
    },
  ];
};

const getPickup = (lang: string) => {
  if (lang === 'en') return [
    { ic: Home, color: '#22c55e', t: 'Home delivery', d: 'After clearance (and tax paid online, if any), the carrier delivers to your address. Taxes are always paid in advance via app — never in cash at the door.' },
    { ic: MapPin, color: '#3b82f6', t: 'Pick up at post office', d: 'If no one is home, the package stays at a nearby post office for pickup with ID.' },
    { ic: ShieldCheck, color: '#8b5cf6', t: 'Inspect and sign', d: 'Check the packaging upon delivery. In case of damage, document it and let us know — we help with the carrier.' },
  ];
  if (lang === 'ja') return [
    { ic: Home, color: '#22c55e', t: '自宅配達', d: '通関完了後（関税がある場合はオンライン支払い後）、配達員が指定住所にお届けします。税金は必ずアプリで事前に支払い、配達員への現金払いは不要です。' },
    { ic: MapPin, color: '#3b82f6', t: '郵便局での受取', d: '不在の場合、荷物は近くの郵便局に保管されます。身分証明書を持参して受け取ってください。' },
    { ic: ShieldCheck, color: '#8b5cf6', t: '確認とサイン', d: '受取時に梱包状態を確認してください。破損があった場合は記録して連絡ください。配送業者との対応をサポートします。' },
  ];
  return [
    { ic: Home, color: '#22c55e', t: 'Entrega em casa', d: 'Depois de liberado (e do imposto pago online, se houver), o carteiro entrega no endereço do pedido. O pagamento de tributos é sempre feito antes, pelo app — nunca em dinheiro na porta.' },
    { ic: MapPin, color: '#3b82f6', t: 'Retirar na agência', d: 'Se ninguém estiver em casa, o pacote fica numa agência dos Correios perto de você para retirada com documento.' },
    { ic: ShieldCheck, color: '#8b5cf6', t: 'Confira e assine', d: 'Confira a embalagem na entrega. Em caso de avaria, registre e nos avise — ajudamos com a transportadora.' },
  ];
};

const getTrackStates = (lang: string) => {
  if (lang === 'en') return [
    { ic: Package, lb: 'Package posted', sub: 'Hiroshima, Japan', color: '#a855f7' },
    { ic: Plane, lb: 'International transit', sub: 'Flight to destination', color: '#3b82f6' },
    { ic: Landmark, lb: 'Customs inspection', sub: 'Awaiting clearance', color: '#ef4444' },
    { ic: Truck, lb: 'Out for delivery', sub: 'Your city', color: '#f59e0b' },
    { ic: Home, lb: 'Package delivered 🎉', sub: 'Received', color: '#22c55e' },
  ];
  if (lang === 'ja') return [
    { ic: Package, lb: '荷物を発送', sub: '広島、日本', color: '#a855f7' },
    { ic: Plane, lb: '国際輸送中', sub: '目的地へのフライト', color: '#3b82f6' },
    { ic: Landmark, lb: '税関検査', sub: '通関待ち', color: '#ef4444' },
    { ic: Truck, lb: '配達中', sub: 'お届け先の市区町村', color: '#f59e0b' },
    { ic: Home, lb: '配達完了 🎉', sub: '受け取り済み', color: '#22c55e' },
  ];
  return [
    { ic: Package, lb: 'Objeto postado', sub: 'Hiroshima, Japão', color: '#a855f7' },
    { ic: Plane, lb: 'Em trânsito internacional', sub: 'Voo para o Brasil', color: '#3b82f6' },
    { ic: Landmark, lb: 'Fiscalização aduaneira', sub: 'Aguardando liberação', color: '#ef4444' },
    { ic: Truck, lb: 'Saiu para entrega', sub: 'Sua cidade', color: '#f59e0b' },
    { ic: Home, lb: 'Objeto entregue 🎉', sub: 'Recebido', color: '#22c55e' },
  ];
};

const getTrackingSteps = (lang: string) => {
  if (lang === 'en') return [
    ['Download the "Correios" App', 'Available on App Store (iOS) and Google Play (Android).'],
    ['Copy the tracking code', 'We send it as soon as the package is posted in Japan.'],
    ['Paste in the app search', 'Tap "Track" and see each step in real time.'],
    ['Enable notifications', 'The app alerts you when the package is out for delivery or at the agency.'],
  ];
  if (lang === 'ja') return [
    ['「Correios」アプリをダウンロード', 'App Store（iOS）またはGoogle Play（Android）から入手できます。'],
    ['追跡番号をコピー', '荷物が日本で発送されると同時にお知らせします。'],
    ['アプリの検索欄に貼り付け', '「追跡」をタップしてリアルタイムで各ステップを確認。'],
    ['通知を有効にする', '配達開始または郵便局到着時にアプリが通知します。'],
  ];
  return [
    ['Baixe o app "Correios"', 'Disponível na App Store (iOS) e Google Play (Android).'],
    ['Copie o código de rastreio', 'Enviamos por mensagem assim que o pacote é postado no Japão.'],
    ['Cole na busca do app', 'Toque em "Rastrear" e veja cada etapa em tempo real.'],
    ['Ative as notificações', 'O app avisa quando o pacote sai para entrega ou chega na agência.'],
  ];
};

// ---------- TAX (language-aware) ----------
type TaxKey = 'Brasil' | 'Europa' | 'Japão';

interface TaxEntry {
  flag: string; tone: string; label: string;
  headline: string;
  rows: [string, string][];
  note: string;
  flow: { lb: string; sub: string }[];
}

const getTax = (lang: string): Record<TaxKey, TaxEntry> => {
  if (lang === 'en') return {
    Brasil: {
      flag: '🇧🇷', tone: '#f59e0b', label: 'Brazil',
      headline: 'Brazilian Federal Revenue (Receita Federal) inspects packages and collects taxes',
      rows: [
        ['Taxes, fees and inspection', 'Defined by the competent authorities according to the shipment and destination'],
        ['Official notification', 'Any charge is communicated through official channels; amounts and release times are not guaranteed'],
      ],
      note: 'Correios only delivers — the Federal Revenue is the taxing authority. You\'re notified by the Correios app/email/SMS and pay online (Pix, card or boleto) BEFORE the package is released. Never pay in cash to the postal worker. ⚠️ Beware of fake links: always confirm in the official app or at correios.com.br.',
      flow: [
        { lb: 'Product + shipping', sub: 'paid on site' },
        { lb: 'Federal Revenue', sub: 'inspects & calculates' },
        { lb: 'You', sub: 'pay online to release' },
      ],
    },
    Europa: {
      flag: '🇪🇺', tone: '#3b82f6', label: 'Europe',
      headline: 'VAT + local postal fee — paid upon delivery',
      rows: [
        ['At checkout', '€ 0.00 tax charged'],
        ['At local customs', 'Country VAT (20–23%) + postal fee'],
      ],
      note: 'We ship via standard international postal service. Local VAT and postal handling fees (CTT, La Poste...) are charged upon delivery.',
      flow: [
        { lb: 'Product + shipping', sub: 'paid on site' },
        { lb: 'Local customs', sub: 'inspects & calculates' },
        { lb: 'You', sub: 'pay upon delivery' },
      ],
    },
    Japão: {
      flag: '🇯🇵', tone: '#22c55e', label: 'Japan',
      headline: 'Domestic shipping — no import tax',
      rows: [
        ['Import tax', 'Exempt (¥0)'],
        ['Consumption tax (Shouhizei 10%)', 'Already included in price'],
      ],
      note: 'Shipped from Hiroshima within Japan: no customs procedures. Free shipping over ¥6,000.',
      flow: [
        { lb: 'Product + shipping', sub: 'paid on site' },
        { lb: 'No customs', sub: 'domestic delivery' },
        { lb: 'You', sub: 'receive at home' },
      ],
    },
  };
  if (lang === 'ja') return {
    Brasil: {
      flag: '🇧🇷', tone: '#f59e0b', label: 'ブラジル',
      headline: 'ブラジル連邦税務署（Receita Federal）がパッケージを検査して税金を徴収',
      rows: [
        ['税金・手数料・検査', '発送内容と配送先に応じて、管轄当局が決定します'],
        ['公式通知', '請求がある場合は公式チャネルで案内され、金額と通関期間は保証されません'],
      ],
      note: 'Correiosは配送のみ — 課税するのは連邦税務署です。Correiosのアプリ/メール/SMSで通知が届き、荷物引き渡し前にオンラインで支払います。配達員への現金払いは不要です。⚠️ 偽リンクに注意：必ず公式アプリまたはcorreios.com.brで確認してください。',
      flow: [
        { lb: '商品 + 送料', sub: 'サイトで支払い' },
        { lb: '連邦税務署', sub: '検査・計算' },
        { lb: 'あなた', sub: 'オンラインで支払い' },
      ],
    },
    Europa: {
      flag: '🇪🇺', tone: '#3b82f6', label: 'ヨーロッパ',
      headline: 'VAT + 現地郵便手数料 — 配達時に支払い',
      rows: [
        ['チェックアウト時', '税金 € 0.00'],
        ['現地税関', '国内VAT（20〜23%）+ 郵便手数料'],
      ],
      note: '国際郵便として発送します。現地VAT・郵便手数料（CTT、La Posteなど）は配達時に徴収されます。',
      flow: [
        { lb: '商品 + 送料', sub: 'サイトで支払い' },
        { lb: '現地税関', sub: '検査・計算' },
        { lb: 'あなた', sub: '配達時に支払い' },
      ],
    },
    Japão: {
      flag: '🇯🇵', tone: '#22c55e', label: '日本',
      headline: '国内発送 — 輸入税なし',
      rows: [
        ['輸入税', '免除（¥0）'],
        ['消費税（消費税 10%）', '価格に含む'],
      ],
      note: '広島から国内発送のため、通関手続きは一切ありません。¥6,000以上のご注文は送料無料。',
      flow: [
        { lb: '商品 + 送料', sub: 'サイトで支払い' },
        { lb: '税関なし', sub: '国内配送' },
        { lb: 'あなた', sub: '自宅で受取' },
      ],
    },
  };
  return {
    Brasil: {
      flag: '🇧🇷', tone: '#f59e0b', label: 'Brasil',
      headline: 'Receita Federal inspeciona pacotes e cobra tributos',
      rows: [
        ['Tributos, taxas e fiscalização', 'Definidos pelas autoridades competentes conforme a remessa e o destino'],
        ['Comunicação oficial', 'Eventual cobrança é informada por canais oficiais; valores e prazo de liberação não são garantidos'],
      ],
      note: 'Os Correios apenas entregam — quem tributa é a Receita Federal. Você é avisado pelo app/e-mail/SMS dos Correios e paga online (Pix, cartão ou boleto) ANTES da liberação. Nunca se paga em dinheiro ao carteiro. ⚠️ Cuidado com links falsos: confirme sempre no app oficial ou em correios.com.br.',
      flow: [
        { lb: 'Produto + frete', sub: 'pago no site' },
        { lb: 'Receita Federal', sub: 'fiscaliza e calcula' },
        { lb: 'Você', sub: 'paga online p/ liberar' },
      ],
    },
    Europa: {
      flag: '🇪🇺', tone: '#3b82f6', label: 'Europa',
      headline: 'IVA + taxa postal local, pagos na entrega',
      rows: [
        ['No site (checkout)', '€ 0,00 de imposto'],
        ['Na alfândega local', 'IVA do país (20–23%) + taxa postal'],
      ],
      note: 'Enviamos via remessa postal internacional. O IVA e a taxa dos correios locais (CTT, La Poste...) são cobrados na entrega.',
      flow: [
        { lb: 'Produto + frete', sub: 'pago no site' },
        { lb: 'Alfândega local', sub: 'fiscaliza e calcula' },
        { lb: 'Você', sub: 'paga na entrega' },
      ],
    },
    Japão: {
      flag: '🇯🇵', tone: '#22c55e', label: 'Japão',
      headline: 'Envio nacional — sem imposto de importação',
      rows: [
        ['Imposto de importação', 'Isento (¥0)'],
        ['Consumo (Shouhizei 10%)', 'Já incluso no preço'],
      ],
      note: 'Despachado de Hiroshima dentro do Japão: nenhum trâmite alfandegário. Frete grátis acima de ¥6.000.',
      flow: [
        { lb: 'Produto + frete', sub: 'pago no site' },
        { lb: 'Sem alfândega', sub: 'envio doméstico' },
        { lb: 'Você', sub: 'recebe em casa' },
      ],
    },
  };
};

// ---------- SUBCOMPONENTS ----------

interface JourneyStepperProps { language: string; t: (key: string) => string; }
const JourneyStepper: React.FC<JourneyStepperProps> = ({ language, t }) => {
  const JOURNEY = getJourney(language);
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
          <div className="w-9 h-9 rounded-full bg-white shadow-lg border-2 flex items-center justify-center animate-bounce"
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
                  'text-[10px] sm:text-xs font-semibold text-center leading-tight hidden sm:block transition-colors',
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
          <button onClick={() => setPaused(false)} className="text-[11px] font-semibold text-primary hover:underline">
            {t('howItWorks.paused')}
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground">{t('howItWorks.tapToPause')}</p>
        )}
      </div>
    </div>
  );
};

interface PaymentMethodsProps { language: string; t: (key: string) => string; }
const PaymentMethods: React.FC<PaymentMethodsProps> = ({ language, t }) => {
  const PAYMENTS = getPayments(language);
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
                <span className="text-[11px] text-muted-foreground">{p.tag}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{p.short}</p>

            <div className={cn('overflow-hidden transition-all duration-500', isOpen ? 'max-h-72' : 'max-h-0')}>
              <ol className="space-y-2 pt-2 border-t border-border">
                {p.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-xs text-foreground">
                    <span className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: p.color }}>{i + 1}</span>
                    <span className="leading-snug text-muted-foreground">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            {!isOpen && <span className="text-[11px] font-semibold" style={{ color: p.color }}>{t('howItWorks.seeStepByStep')}</span>}
          </button>
        );
      })}
    </div>
  );
};

interface TaxExplainerProps { language: string; }
const TaxExplainer: React.FC<TaxExplainerProps> = ({ language }) => {
  const [c, setC] = useState<TaxKey>('Brasil');
  const TAX = getTax(language);
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
                <span className="text-[11px] font-bold text-foreground leading-none">{s.lb}</span>
                <span className="text-[10px] text-muted-foreground">{s.sub}</span>
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
        <p className="text-[11px] text-muted-foreground leading-relaxed bg-background/60 rounded-lg p-2.5">
          ⚠️ {tx.note}
        </p>
      </div>
    </div>
  );
};

interface CorreiosTrackingProps { language: string; t: (key: string) => string; }
const CorreiosTracking: React.FC<CorreiosTrackingProps> = ({ language, t }) => {
  const TRACK_STATES = getTrackStates(language);
  const trackingSteps = getTrackingSteps(language);
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
          title="Toque para pausar/continuar"
          className="w-[270px] rounded-[2.2rem] border-[10px] border-foreground/90 bg-background shadow-2xl overflow-hidden cursor-pointer select-none">
          <div className="h-6 bg-foreground/90 flex items-center justify-center">
            <div className="w-16 h-1.5 bg-background/40 rounded-full" />
          </div>
          <div className="px-4 py-3 text-white flex items-center gap-2" style={{ background: 'linear-gradient(135deg,#facc15,#eab308)' }}>
            <span className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center">📮</span>
            <span className="font-bold text-sm">App Correios</span>
          </div>
          <div className="p-3">
            <div className="flex items-center gap-2 bg-secondary rounded-lg px-2.5 py-2 mb-3">
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] font-mono text-foreground tracking-wide">{fakeCode}</span>
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
                      <p className="text-[11px] font-bold text-foreground leading-tight">{s.lb}</p>
                      <p className="text-[9px] text-muted-foreground">{s.sub}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <button onClick={() => setPaused((p) => !p)} className="text-[11px] font-semibold text-primary hover:underline mt-3">
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
const getBizSteps = (lang: string) => {
  if (lang === 'en') return [
    { ic: BadgeCheck, t: 'Radar / Siscomex Registration', d: 'The company needs a Radar (Importer Registration) approved by the Federal Revenue to operate in Siscomex — Brazil\'s official foreign trade system.' },
    { ic: Briefcase, t: 'Customs Broker', d: 'A customs broker registers the operation and handles documentation. For large volumes/values, this is practically mandatory.' },
    { ic: FileText, t: 'Import Declaration (DI)', d: 'Formal imports are registered via Import Declaration (DI) in Siscomex, with the NCM tax classification of each product and the customs value.' },
    { ic: Percent, t: 'Applicable Taxes and Fees', d: 'Taxes, fees and customs requirements are defined by the competent authorities according to the shipment, destination and each product\'s NCM classification. Amounts and processing times are not guaranteed.' },
  ];
  if (lang === 'ja') return [
    { ic: BadgeCheck, t: 'Radar / Siscomex 登録', d: '企業はブラジルの公式貿易システムSiscomexを利用するため、連邦税務署でRadar（輸入者登録）の承認が必要です。' },
    { ic: Briefcase, t: '通関業者', d: '通関業者が業務登録と書類手続きを行います。大量・高額の輸入にはほぼ必須です。' },
    { ic: FileText, t: '輸入申告書（DI）', d: '正式な輸入はSiscomexの輸入申告書（DI）で登録され、各商品のNCM税分類と関税価格が記載されます。' },
    { ic: Percent, t: '適用される税金・手数料', d: '税金、手数料、通関要件は、発送内容、配送先、各商品のNCM分類に応じて管轄当局が決定します。金額と手続き期間は保証されません。' },
  ];
  return [
    { ic: BadgeCheck, t: 'Habilitação no Radar / Siscomex', d: 'A empresa precisa do Radar (Registro e Rastreamento da Atuação dos Intervenientes Aduaneiros) habilitado na Receita Federal para operar no Siscomex — o sistema oficial de comércio exterior.' },
    { ic: Briefcase, t: 'Despachante aduaneiro', d: 'Um despachante registra a operação e cuida da documentação. Para grandes volumes/valores, é praticamente obrigatório.' },
    { ic: FileText, t: 'Declaração de Importação (DI)', d: 'A importação formal é registrada via DI no Siscomex, com a classificação fiscal (NCM) de cada produto e o valor aduaneiro.' },
    { ic: Percent, t: 'Tributos e taxas aplicáveis', d: 'Tributos, taxas e exigências aduaneiras são definidos pelas autoridades competentes conforme a remessa, o destino e a classificação NCM de cada produto. Valores e prazos de processamento não são garantidos.' },
  ];
};

const getBizBody = (lang: string) => {
  if (lang === 'en') return {
    intro: <>For commercial goods, competent authorities define when <strong>formal import procedures</strong> apply and what requirements must be met, based on the shipment and destination:</>,
    note: <>⚠️ Notifications and payments do <strong>not</strong> come through the Correios app as in regular purchases — everything goes through Siscomex and the customs broker. Timelines and costs also differ.</>,
  };
  if (lang === 'ja') return {
    intro: <>商用品については、発送内容と配送先に応じて、管轄当局が<strong>正式輸入手続き</strong>の適用と必要要件を決定します：</>,
    note: <>⚠️ 通知と支払いは通常購入のようにCorreiosアプリでは届きません — すべてSiscomexと通関業者を通じて行われます。期間とコストも異なります。</>,
  };
  return {
    intro: <>Para bens comerciais, as autoridades competentes definem quando se aplicam <strong>procedimentos formais de importação</strong> e quais requisitos devem ser cumpridos, conforme a remessa e o destino:</>,
    note: <>⚠️ A notificação e o pagamento <strong>não</strong> chegam pelo app dos Correios como nas compras comuns — tudo passa pelo Siscomex e pelo despachante. Os prazos e custos também são diferentes.</>,
  };
};

interface BusinessImportProps { t: (key: string) => string; language: string; }
const BusinessImport: React.FC<BusinessImportProps> = ({ t, language }) => {
  const [open, setOpen] = useState(false);
  const BIZ_STEPS = getBizSteps(language);
  const bizBody = getBizBody(language);
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

          <p className="text-[11px] text-muted-foreground leading-relaxed">
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
  const { t, language } = useLanguage();
  const PICKUP = getPickup(language);

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
            <JourneyStepper language={language} t={t} />
          </div>

          {/* 2. Pagamento */}
          <div>
            <header className="mb-5 text-center">
              <h2 className="font-display text-2xl font-bold text-foreground flex items-center justify-center gap-2">
                <CreditCard className="w-6 h-6 text-primary" /> {t('howItWorks.payment.title')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('howItWorks.payment.subtitle')}</p>
            </header>
            <PaymentMethods language={language} t={t} />
          </div>

          {/* 3. Impostos */}
          <div>
            <header className="mb-5 text-center">
              <h2 className="font-display text-2xl font-bold text-foreground flex items-center justify-center gap-2">
                <Landmark className="w-6 h-6 text-primary" /> {t('howItWorks.tax.title')}
              </h2>
              <p className="text-sm text-muted-foreground">{t('howItWorks.tax.subtitle')}</p>
            </header>
            <TaxExplainer language={language} />
            <p className="text-center text-xs text-muted-foreground mt-3">
              {t('howItWorks.taxSimText')} <Link to="/frete" className="text-primary font-semibold hover:underline">{t('howItWorks.taxSimLink')}</Link>.
            </p>
            <div className="mt-5">
              <BusinessImport t={t} language={language} />
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
              <CorreiosTracking language={language} t={t} />
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
