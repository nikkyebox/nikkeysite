/**
 * Geração de SKU (código de produto) da NikkeyBox.
 * Padrão: JE-<CAT>-<NNNN>  (ex.: JE-COS-0001, JE-DOC-0012)
 * - Único por categoria (números sequenciais dentro de cada categoria).
 * - Determinístico e estável em re-rodadas: produtos que já têm SKU válido são preservados.
 * - Módulo puro (sem dependências de alias "@/") para poder ser importado tanto pela
 *   app (via "@/utils/sku") quanto por scripts Node/Bun usando caminho relativo.
 */

export interface SkuItem {
  category: string;
  sku?: string;
}

/** Mapeia categorias conhecidas para códigos curtos e legíveis. */
const CATEGORY_CODES: Record<string, string> = {
  cosmeticos: 'COS',
  doces: 'DOC',
  acessorios: 'ACE',
  papelaria: 'PAP',
  eletronicos: 'ELE',
  masculino: 'MAS',
  vestuario: 'VES',
  higiene: 'HIG',
  docedeleite: 'DLT',
};

/** Código de categoria: usa a tabela fixa ou deriva das primeiras letras. */
export function categoryCode(category: string): string {
  const known = CATEGORY_CODES[category];
  if (known) return known;
  const cleaned = (category || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();
  return cleaned.slice(0, 3) || 'GEN';
}

/** Prefixo de SKU para uma categoria (ex.: "JE-COS"). */
export function skuPrefix(category: string): string {
  return `JE-${categoryCode(category)}`;
}

/** Verifica se o valor é um SKU válido no padrão NikkeyBox. */
export function isValidSku(sku: string | undefined | null): boolean {
  return !!sku && /^JE-[A-Z]{2,4}-\d{4}$/.test(sku);
}

/**
 * Gera o próximo SKU único para a categoria informada, pulando os números já
 * em uso (lidos dos SKUs existentes passados em `existing`).
 */
export function generateUniqueSku(category: string, existing: SkuItem[] = []): string {
  const prefix = skuPrefix(category);
  const re = new RegExp(`^${prefix}-(\\d{4})$`);
  const used = new Set<number>();
  for (const item of existing) {
    const m = item.sku?.trim().match(re);
    if (m) used.add(Number(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

/**
 * Atribui SKUs (id -> sku) APENAS aos itens que ainda não possuem um SKU válido.
 * Respeita SKUs já existentes (não duplica números). Determinístico (ordena por id
 * dentro de cada categoria). Usado pelo script de backfill (Firestore) e pode ser
 * reaproveitado em operações em massa pelo painel admin.
 */
export function assignSkus<T extends SkuItem & { id: string }>(items: T[]): Record<string, string> {
  const assignments: Record<string, string> = {};

  const byCategory = new Map<string, T[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  for (const [category, list] of byCategory) {
    const prefix = skuPrefix(category);
    const re = new RegExp(`^${prefix}-(\\d{4})$`);
    const used = new Set<number>();
    for (const item of list) {
      const m = item.sku?.trim().match(re);
      if (m) used.add(Number(m[1]));
    }

    let n = 1;
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    for (const item of sorted) {
      if (isValidSku(item.sku)) continue; // já tem SKU válido — preserva
      while (used.has(n)) n++;
      const sku = `${prefix}-${String(n).padStart(4, '0')}`;
      assignments[item.id] = sku;
      used.add(n);
      n++;
    }
  }

  return assignments;
}
