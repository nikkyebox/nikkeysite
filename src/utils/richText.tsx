import React from 'react';

/**
 * Monta um texto traduzido com marcação simples, sem HTML dentro do dicionário:
 *  - **negrito**  -> <strong>
 *  - *itálico*    -> <em>
 *  - {nome}       -> valor do mapa `values` (texto ou elemento React, ex.: link)
 * Placeholders sem valor são mantidos como texto literal.
 */
export type RichValues = Record<string, React.ReactNode>;

const TOKEN_SOURCE = String.raw`\*\*(.+?)\*\*|\*(.+?)\*|\{(\w+)\}`;

export function renderRich(text: string, values: RichValues = {}, keyPrefix = 'rich'): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = new RegExp(TOKEN_SOURCE, 'g');
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${index++}`;
    if (match[1] !== undefined) {
      out.push(<strong key={key}>{renderRich(match[1], values, key)}</strong>);
    } else if (match[2] !== undefined) {
      out.push(<em key={key}>{renderRich(match[2], values, key)}</em>);
    } else {
      const name = match[3];
      out.push(
        <React.Fragment key={key}>{name in values ? values[name] : `{${name}}`}</React.Fragment>
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}
