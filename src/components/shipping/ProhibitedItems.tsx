import React, { useState } from 'react';
import { AlertTriangle, XCircle, AlertCircle, ChevronDown, ChevronUp, Info } from 'lucide-react';

type Level = 'prohibited' | 'restricted' | 'attention';

interface Item {
  name: string;
  detail?: string;
}

interface Category {
  icon: string;
  title: string;
  level: Level;
  items: Item[];
}

const CATEGORIES: Category[] = [
  {
    icon: '🚫',
    title: 'Absolutamente Proibidos',
    level: 'prohibited',
    items: [
      { name: 'Armas de fogo, munições e réplicas', detail: 'Qualquer tipo, incluindo peças e acessórios' },
      { name: 'Explosivos, fogos de artifício e sinalizadores' },
      { name: 'Drogas e entorpecentes ilícitos', detail: 'Incluindo sementes de Cannabis' },
      { name: 'Material pornográfico infantil' },
      { name: 'Animais vivos' },
      { name: 'Restos mortais humanos' },
      { name: 'Moeda falsa e documentos falsificados' },
      { name: 'Mercadorias contrabandeadas ou pirateadas' },
      { name: 'Substâncias radioativas' },
      { name: 'Solos e terra in natura', detail: 'Risco fitossanitário' },
    ],
  },
  {
    icon: '⚠️',
    title: 'Restritos (exigem declaração ou documentação)',
    level: 'restricted',
    items: [
      { name: 'Medicamentos', detail: 'Uso pessoal: até 3 meses de tratamento. Necessita receita médica em inglês ou português. Máx. 10 unidades por item.' },
      { name: 'Suplementos alimentares', detail: 'Máx. 3 unidades por tipo. Deve estar na embalagem original com lista de ingredientes.' },
      { name: 'Baterias de lítio avulsas (sem dispositivo)', detail: 'Proibidas pela Japan Post. Baterias JÁ INSTALADAS em dispositivos são permitidas.' },
      { name: 'Aerossóis e sprays pressurizados', detail: 'Proibidos em EMS/Avião. Não disponível para envio.' },
      { name: 'Perfumes e produtos com álcool acima de 70%', detail: 'Via aérea: máx. 500ml por pacote. Deve ser declarado.' },
      { name: 'Plantas, sementes e bulbos', detail: 'Exige Certificado Fitossanitário (phytosanitary certificate) do MAPA do Japão.' },
      { name: 'Alimentos de origem animal (carne, laticínios)', detail: 'Exige inspeção veterinária e certificado sanitário. Geralmente bloqueado na aduana.' },
      { name: 'Óleos essenciais e inflamáveis', detail: 'Classificados como perigosos. Proibidos em via aérea. Marítimo requer documentação DGD.' },
      { name: 'Facas e objetos cortantes', detail: 'Permitidos se for uso culinário ou artístico. Réplicas de armas são proibidas.' },
      { name: 'Lasers e ponteiros laser', detail: 'Acima de 1mW pode ser retido na aduana brasileira.' },
    ],
  },
  {
    icon: '💡',
    title: 'Atenção especial (permitidos com cuidados)',
    level: 'attention',
    items: [
      { name: 'Cosméticos', detail: 'Permitidos. Acima de R$3.000 (valor total do pacote) pode incidir imposto de importação de 20%.' },
      { name: 'Eletrônicos', detail: 'Permitidos. Declare o valor correto. Pacotes acima de US$50 podem ser taxados pela Receita Federal.' },
      { name: 'Alimentos industrializados (snacks, doces, chás)', detail: 'Permitidos se selados e na embalagem original. Declare como "food/alimento".' },
      { name: 'Brinquedos e action figures', detail: 'Permitidos. Declare valor real — subfaturamento pode causar apreensão.' },
      { name: 'Papelaria e canetas', detail: 'Sem restrições. Declare normalmente.' },
      { name: 'Roupas e vestuário', detail: 'Permitidos. Acima de 3 peças iguais pode ser considerado comercial.' },
      { name: 'Calçados', detail: 'Permitidos. Mais de 1 par igual pode ser questionado.' },
      { name: 'Produtos com pilhas AAA/AA incluídas', detail: 'Permitidos. Pilhas alcalinas comuns não são perigosas. Baterias de lítio devem estar instaladas.' },
      { name: 'Vinhos e bebidas alcoólicas', detail: 'Proibidos em EMS/avião. Não disponível para envio no momento.' },
      { name: 'Itens de alto valor (relógios, joias)', detail: 'Declare o valor real. Seguro recomendado. CN23 obrigatório.' },
    ],
  },
];

const levelConfig = {
  prohibited: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    header: 'bg-red-100 dark:bg-red-900/40',
    title: 'text-red-700 dark:text-red-400',
    badge: 'bg-red-600',
    dot: 'bg-red-500',
    icon: XCircle,
  },
  restricted: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    header: 'bg-amber-100 dark:bg-amber-900/40',
    title: 'text-amber-700 dark:text-amber-400',
    badge: 'bg-amber-500',
    dot: 'bg-amber-500',
    icon: AlertTriangle,
  },
  attention: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    header: 'bg-blue-100 dark:bg-blue-900/40',
    title: 'text-blue-700 dark:text-blue-400',
    badge: 'bg-blue-500',
    dot: 'bg-blue-400',
    icon: Info,
  },
};

const ProhibitedItems: React.FC = () => {
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  const [search, setSearch] = useState('');

  const toggle = (i: number) => setOpen(prev => ({ ...prev, [i]: !prev[i] }));

  const q = search.toLowerCase();
  const filtered: Category[] = q
    ? CATEGORIES.map(cat => ({
        ...cat,
        items: cat.items.filter(
          it => it.name.toLowerCase().includes(q) || (it.detail || '').toLowerCase().includes(q)
        ),
      })).filter(cat => cat.items.length > 0)
    : CATEGORIES;

  return (
    <div className="space-y-6">
      {/* Aviso geral */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div className="text-sm text-red-700 dark:text-red-400 leading-relaxed">
          <strong>Atenção:</strong> Enviar itens proibidos pode resultar em apreensão do pacote, multa e até processo criminal.
          Em caso de dúvida, consulte a{' '}
          <a href="https://www.gov.br/receitafederal/pt-br" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
            Receita Federal do Brasil
          </a>{' '}
          e as{' '}
          <a href="https://www.post.japanpost.jp/int/restriction/index_en.html" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
            restrições da Japan Post
          </a>.
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Buscar item (ex: bateria, medicamento, perfume...)"
          className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        )}
      </div>

      {/* Categorias */}
      {filtered.map((cat, i) => {
        const cfg = levelConfig[cat.level];
        const Icon = cfg.icon;
        const isOpen = search ? true : (open[i] ?? false);

        return (
          <div key={i} className={`rounded-xl border overflow-hidden ${cfg.bg} ${cfg.border}`}>
            {/* Header */}
            <button
              onClick={() => !search && toggle(i)}
              className={`w-full flex items-center justify-between px-5 py-4 ${cfg.header} text-left`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cat.icon}</span>
                <div>
                  <span className={`font-bold text-base ${cfg.title}`}>{cat.title}</span>
                  <span className={`ml-2 text-xs text-white px-2 py-0.5 rounded-full ${cfg.badge}`}>
                    {cat.items.length} itens
                  </span>
                </div>
              </div>
              {!search && (
                isOpen
                  ? <ChevronUp className={`w-5 h-5 ${cfg.title}`} />
                  : <ChevronDown className={`w-5 h-5 ${cfg.title}`} />
              )}
            </button>

            {/* Items list */}
            {isOpen && (
              <div className="divide-y divide-border/50">
                {cat.items.map((item, j) => (
                  <div key={j} className="flex items-start gap-3 px-5 py-3">
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
                    <div className="text-sm">
                      <span className="font-semibold text-foreground">{item.name}</span>
                      {item.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Fonte */}
      <p className="text-xs text-muted-foreground text-center">
        Fontes: Japan Post International Restrictions · Receita Federal do Brasil · ANVISA · MAPA
      </p>
    </div>
  );
};

export default ProhibitedItems;
