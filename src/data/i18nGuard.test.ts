/**
 * Guarda de i18n: impede texto fixo (sem t()) nas telas que o cliente vê.
 *
 * Usa o compilador TypeScript para ler os .tsx de src/pages e src/components
 * (exceto admin, arquivos de painel e testes) e procura texto visível fixo:
 *  - texto JSX com letras (JsxText, após trim);
 *  - atributos de texto visível: placeholder, title, alt, aria-label;
 *  - literais (ou modelos) que são filhos de JSX, inclusive dentro de expressões
 *    como {'Texto'}, {ok ? 'Texto' : 'Outro'} e {a && 'Texto'};
 *  - literais com palavras-chave do português dentro de JSX;
 *  - textos de tela em objetos de configuração (label, title, desc...) e em
 *    chamadas toast/alert/confirm.
 * Ignora chamadas t('...'), rotas/URLs e os trechos da ALLOWLIST (marcas, siglas, dado).
 * A allowlist é por arquivo, com motivo. Não há exceção global para letras soltas.
 */
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Código-fonte lido como texto pelo Vite (sem depender de módulos do Node).
const SOURCES = import.meta.glob('/src/{pages,components}/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Arquivos e pastas que são só do painel administrativo (fora do escopo do cliente).
const EXCLUDED_PREFIXES = ['src/components/admin/'];
const EXCLUDED_FILES = new Set([
  'src/pages/Admin.tsx',
  'src/pages/SyncData.tsx',
  'src/pages/FirebaseSync.tsx',
  'src/components/layout/AdminPreviewBar.tsx',
]);

const VISIBLE_ATTRIBUTES = new Set(['placeholder', 'title', 'alt', 'aria-label']);

// Propriedades de objeto que costumam virar texto na tela (ex.: { label: 'Início' }).
const SCREEN_TEXT_PROPS = new Set([
  'label', 'title', 'desc', 'description', 'text', 'subtitle', 'message', 'caption',
  'placeholder', 'tooltip', 'headline', 'note', 'tag', 'heading', 'cta', 'btn', 'lb',
]);

// Chamadas que mostram texto ao usuário.
const SCREEN_CALL_RE = /^(toast(\.\w+)?|alert|confirm|window\.alert)$/;

// Palavras-chave do português com acento ou muito típicas de interface. Lista curta de propósito,
// para não pegar inglês por engano. Usada nos literais fora de expressão visível.
const PT_KEYWORDS = [
  'não', 'você', 'também', 'são', 'número', 'página', 'Próxim', 'Carregando', 'Fechar',
  'Voltar', 'Clique', 'Pedido', 'Produto', 'Senha', 'Carrinho', 'Cadastr', 'Entrar',
  'Enviar', 'Cancelar', 'Salvar', 'Anterior', 'Erro', 'Aguarde', 'Confirme', 'Cupom',
  'Frete', 'Endereço', 'Obrigado', 'Sucesso', 'Preço',
];
const PT_RE = new RegExp(`(?<!\\p{L})(${PT_KEYWORDS.join('|')})`, 'iu');

interface AllowEntry {
  /** Trecho (palavra inteira) que pode aparecer no texto visível sem tradução. */
  text: string;
  /** Arquivo onde a exceção vale. Sem arquivo, vale para qualquer tela (só marcas e siglas). */
  file?: string;
  /** Motivo: obrigatório, para a lista continuar pequena e justificada. */
  reason: string;
}

const ALLOWLIST: AllowEntry[] = [
  // Marcas e nomes próprios, que não são traduzidos.
  { text: 'NikkeyBox', reason: 'nome da marca' },
  { text: 'Yamato', reason: 'nome da transportadora (marca)' },
  { text: 'Sagawa', reason: 'nome da transportadora (marca)' },
  { text: 'Japan Post', reason: 'nome da transportadora (marca)' },
  { text: 'PayPay', reason: 'nome da forma de pagamento (marca)' },
  { text: 'PIX', reason: 'nome da forma de pagamento (marca)' },
  { text: 'Wise', reason: 'nome da forma de pagamento (marca)' },
  { text: 'Firebase', reason: 'nome do serviço (marca)' },
  { text: 'Google', reason: 'nome da empresa (marca)' },
  { text: 'WhatsApp', reason: 'nome do aplicativo (marca)' },
  { text: 'YouTube', reason: 'nome da plataforma (marca)' },
  { text: 'Resend', reason: 'nome do serviço de e-mail (marca)' },
  { text: 'Correios', reason: 'nome da empresa de correios (marca)' },
  { text: 'Instagram', reason: 'nome da rede social (marca)' },
  { text: 'Facebook', reason: 'nome da rede social (marca)' },
  { text: 'TikTok', reason: 'nome da rede social (marca)' },
  { text: 'Twitter', reason: 'nome da rede social (marca)' },
  { text: '@nikkeybox', reason: 'perfil de rede social (marca)' },
  // Siglas conhecidas.
  { text: 'CPF', reason: 'sigla fiscal brasileira' },
  { text: 'CNPJ', reason: 'sigla fiscal brasileira' },
  { text: 'LGPD', reason: 'sigla da lei de dados' },
  { text: 'HTTPS', reason: 'sigla técnica' },
  { text: 'SSL', reason: 'sigla técnica' },
  // Nome de país como valor de dado: fica sem exceção global, só por arquivo (ver abaixo).
  { text: '日本', reason: 'nome de país usado como valor de dado (rótulo de mapa)' },

  // ---- Exceções por arquivo (falso positivo de código, dado ou marca) ----
  { file: 'src/pages/Maintenance.tsx', text: 'Brasil', reason: 'rótulo de mapa SVG: nome de país como valor de dado' },
  { file: 'src/pages/Affiliate.tsx', text: 'k', reason: 'abreviação de milhar em valor monetário (¥200k)' },
  { file: 'src/pages/Affiliate.tsx', text: 'x', reason: 'sinal de multiplicação em preço ou quantidade' },
  { file: 'src/components/layout/Footer.tsx', text: 'X', reason: 'marca da rede social X (ex-Twitter)' },
  { file: 'src/components/layout/Footer.tsx', text: 'Nikkey', reason: 'parte da marca NikkeyBox no logo' },
  { file: 'src/components/layout/Footer.tsx', text: 'Box', reason: 'parte da marca NikkeyBox no logo' },
  { file: 'src/components/layout/Header.tsx', text: 'Nikkey', reason: 'parte da marca NikkeyBox no logo' },
  { file: 'src/components/layout/Header.tsx', text: 'Box', reason: 'parte da marca NikkeyBox no logo' },
  { file: 'src/components/layout/Sidebar.tsx', text: 'Nikkey', reason: 'parte da marca NikkeyBox no logo' },
  { file: 'src/components/layout/Sidebar.tsx', text: 'Box', reason: 'parte da marca NikkeyBox no logo' },
  { file: 'src/components/AppDownloadSection.tsx', text: 'Nikkey', reason: 'parte da marca NikkeyBox no logo' },
  { file: 'src/components/AppDownloadSection.tsx', text: 'Box', reason: 'parte da marca NikkeyBox no logo' },
  { file: 'src/pages/Checkout.tsx', text: 'x', reason: 'sinal de multiplicação em preço ou quantidade' },
  { file: 'src/components/SocialLoginButton.tsx', text: 'X', reason: 'marca da rede social X no botão de login' },
  { file: 'src/pages/Profile.tsx', text: 'confirmed', reason: 'código de status do pedido (valor de dado em inglês, não texto)' },
  { file: 'src/pages/OrderReview.tsx', text: 'x', reason: 'sinal de multiplicação em preço ou quantidade' },
  { file: 'src/pages/Profile.tsx', text: 'x', reason: 'sinal de multiplicação em preço ou quantidade' },
  { file: 'src/pages/ProductDetail.tsx', text: 'x', reason: 'sinal de multiplicação em preço ou quantidade' },
  { file: 'src/pages/Promotion.tsx', text: 'x', reason: 'sinal de multiplicação em preço ou quantidade' },
  { file: 'src/pages/Shipping.tsx', text: 'x', reason: 'dimensões de caixa em centímetros (dado)' },
  { file: 'src/pages/OrderReview.tsx', text: 'Japão', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/pages/OrderReview.tsx', text: 'Brasil', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/pages/OrderReview.tsx', text: 'Portugal', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/pages/OrderReview.tsx', text: 'França', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/pages/OrderReview.tsx', text: 'Itália', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/pages/OrderReview.tsx', text: 'Espanha', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/pages/OrderConfirmation.tsx', text: 'Brasil', reason: 'nome de país como valor de dado' },
  { file: 'src/pages/Shipping.tsx', text: 'Brasil', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/pages/Shipping.tsx', text: 'Portugal', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/pages/Shipping.tsx', text: 'França', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/pages/Shipping.tsx', text: 'Itália', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/pages/Shipping.tsx', text: 'Espanha', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/pages/Shipping.tsx', text: 'Japão', reason: 'nome de país como valor de dado (lista de países)' },
  { file: 'src/components/LanguageSwitcher.tsx', text: 'Português', reason: 'nome do idioma escrito na própria língua' },
  { file: 'src/components/LanguageSwitcher.tsx', text: 'English', reason: 'nome do idioma escrito na própria língua' },
  { file: 'src/components/LanguageSwitcher.tsx', text: '日本語', reason: 'nome do idioma escrito na própria língua' },
  // Nomes técnicos de chaves de cookie/localStorage (identificadores, não texto).
  { file: 'src/pages/CookiePolicy.tsx', text: 'nikkeybox-users', reason: 'nome técnico de chave no localStorage' },
  { file: 'src/pages/CookiePolicy.tsx', text: 'cart', reason: 'nome técnico de chave no localStorage' },
  { file: 'src/pages/CookiePolicy.tsx', text: 'loginAs', reason: 'nome técnico de chave no localStorage' },
  { file: 'src/pages/CookiePolicy.tsx', text: 'maintenance_state', reason: 'nome técnico de chave no localStorage' },
  { file: 'src/pages/CookiePolicy.tsx', text: 'cookie_consent', reason: 'nome técnico de chave no localStorage' },
  { file: 'src/pages/CookiePolicy.tsx', text: 'pwa_install_dismissed', reason: 'nome técnico de chave no localStorage' },
];

interface Finding {
  file: string;
  line: number;
  kind: string;
  text: string;
}

/** Caminhos no formato "src/…", já sem os arquivos excluídos. */
function clientFiles(): Array<{ file: string; text: string }> {
  return Object.entries(SOURCES)
    .map(([key, text]) => ({ file: key.replace(/^\//, ''), text }))
    .filter(({ file }) => !file.endsWith('.test.tsx'))
    .filter(({ file }) => !EXCLUDED_FILES.has(file) && !EXCLUDED_PREFIXES.some((p) => file.startsWith(p)));
}

/** Tem letra visível depois de tirar entidades HTML, símbolos tipo letra (ex.: ℹ, U+2100–U+214F)
 *  e, se ativado, os trechos da allowlist (sempre como palavra inteira). */
function hasVisibleLetters(raw: string, file: string, useAllowlist: boolean): boolean {
  if (isClassList(raw)) return false;
  let left = raw.replace(/&[a-zA-Z]+;|&#\d+;/g, ' ').replace(/[℀-⅏]/g, ' ');
  if (useAllowlist) {
    for (const entry of ALLOWLIST) {
      if (entry.file && entry.file !== file) continue;
      const escaped = entry.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      left = left.replace(new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'gu'), ' ');
    }
  }
  return /\p{L}/u.test(left);
}

/** Rotas e URLs (ex.: "/produtos", "https://...") não são texto para o cliente. */
function isPathOrUrl(value: string): boolean {
  return value.startsWith('/') || value.includes('://') || value.startsWith('mailto:') || value.startsWith('tel:');
}

/**
 * Lista de classes CSS (Tailwind): só tokens minúsculos, com - : / [ ] ou similares.
 * Não é texto para o cliente, então não entra na varredura.
 */
function isClassList(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const cssToken = /^[a-z0-9\-:/[\]._%!()#&>~*]+$/;
  return tokens.every((tok) => cssToken.test(tok)) && tokens.some((tok) => /[-:/[]/.test(tok));
}

function isInsideJsx(node: ts.Node): boolean {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxFragment(p) || ts.isJsxAttribute(p)) {
      return true;
    }
  }
  return false;
}

function isTranslationCall(node: ts.Node): boolean {
  const parent = node.parent;
  return !!parent && ts.isCallExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === 't';
}

/**
 * Literais que podem chegar à tela a partir de uma expressão: o próprio literal,
 * ramos de condicional, operandos de && || ??, parênteses e partes de modelo (template).
 */
function literalsOf(expr: ts.Expression | undefined): Array<{ node: ts.Node; text: string }> {
  if (!expr) return [];
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return [{ node: expr, text: expr.text }];
  }
  if (ts.isTemplateExpression(expr)) {
    return [expr.head.text, ...expr.templateSpans.map((s) => s.literal.text)]
      .map((text) => ({ node: expr, text }));
  }
  if (ts.isConditionalExpression(expr)) {
    return [...literalsOf(expr.whenTrue), ...literalsOf(expr.whenFalse)];
  }
  if (ts.isBinaryExpression(expr) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(expr.operatorToken.kind)) {
    return [...literalsOf(expr.left), ...literalsOf(expr.right)];
  }
  if (ts.isParenthesizedExpression(expr)) return literalsOf(expr.expression);
  return [];
}

function scanFile(file: string, text: string, useAllowlist = true): Finding[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const reported = new Set<number>();

  const add = (node: ts.Node, value: string, kind: string) => {
    if (reported.has(node.pos)) return;
    reported.add(node.pos);
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    findings.push({ file, line: line + 1, kind, text: value.trim().replace(/\s+/g, ' ') });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const value = node.getText(sf);
      if (hasVisibleLetters(value, file, useAllowlist)) add(node, value, 'texto JSX');
    } else if (ts.isJsxAttribute(node) && VISIBLE_ATTRIBUTES.has(node.name.getText(sf))) {
      const init = node.initializer;
      let value: string | undefined;
      if (init && ts.isStringLiteral(init)) value = init.text;
      else if (init && ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))) {
        value = init.expression.text;
      }
      if (value !== undefined && hasVisibleLetters(value, file, useAllowlist)) {
        add(node, value, `atributo ${node.name.getText(sf)}`);
      }
    } else if (ts.isJsxExpression(node) && node.expression && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      // Expressão filha de elemento: {'Texto'}, {ok ? 'Texto' : 'Outro'}, {a && 'Texto'}, modelos.
      for (const lit of literalsOf(node.expression)) {
        if (isPathOrUrl(lit.text)) continue;
        if (hasVisibleLetters(lit.text, file, useAllowlist)) add(lit.node, lit.text, 'literal em expressão JSX');
      }
    } else if (ts.isPropertyAssignment(node) && SCREEN_TEXT_PROPS.has(node.name.getText(sf))) {
      // Objeto de configuração que vira tela: { label: 'Início' }, { title: t('x') } ignorado.
      for (const lit of literalsOf(node.initializer)) {
        if (isPathOrUrl(lit.text)) continue;
        if (hasVisibleLetters(lit.text, file, useAllowlist)) add(lit.node, lit.text, `texto em objeto (${node.name.getText(sf)})`);
      }
    } else if (ts.isCallExpression(node) && SCREEN_CALL_RE.test(node.expression.getText(sf)) && node.arguments.length > 0) {
      for (const lit of literalsOf(node.arguments[0])) {
        if (isPathOrUrl(lit.text)) continue;
        if (hasVisibleLetters(lit.text, file, useAllowlist)) add(lit.node, lit.text, `texto em ${node.expression.getText(sf)}()`);
      }
    } else if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      !(node.parent && ts.isJsxAttribute(node.parent)) &&
      !(node.parent && ts.isJsxExpression(node.parent)) &&
      !isTranslationCall(node) &&
      !isPathOrUrl(node.text) &&
      isInsideJsx(node) &&
      PT_RE.test(node.text) &&
      hasVisibleLetters(node.text, file, useAllowlist)
    ) {
      add(node, node.text, 'literal PT em JSX');
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return findings;
}

const format = (f: Finding) => `${f.file}:${f.line} [${f.kind}] "${f.text}"`;

describe('guarda i18n: texto fixo nas telas do cliente', () => {
  const files = clientFiles();

  it('varre um conjunto realista de arquivos', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('não há texto fixo fora da allowlist', () => {
    const raw = files.flatMap(({ file, text }) => scanFile(file, text, false));
    const findings = files.flatMap(({ file, text }) => scanFile(file, text, true));
    const allowed = raw.length - findings.length;
    console.log(
      `[i18nGuard] arquivos: ${files.length} | candidatos brutos: ${raw.length} | na allowlist: ${allowed} | fora da allowlist: ${findings.length}`,
    );
    expect(findings.map(format)).toEqual([]);
  }, 60000);

  it('a varredura enxerga literais dentro de expressões JSX', () => {
    const sample = `const A = () => <p>{'Finalizar compra'}{ok ? 'Finalizar compra' : 'Voltar'}</p>;`;
    const found = scanFile('src/pages/Sample.tsx', sample, true).map((f) => f.kind);
    expect(found.filter((k) => k === 'literal em expressão JSX').length).toBeGreaterThanOrEqual(3);
  });
});
