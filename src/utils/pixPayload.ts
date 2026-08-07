// Gera um "PIX Copia e Cola" (BR Code estático no padrão EMV do Banco Central)
// a partir de uma chave PIX real. Inclui o CRC16-CCITT exigido pelos apps de banco.

function emv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF) — exigido pelo padrão PIX.
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Remove acentos e limita tamanho (o padrão PIX aceita só ASCII em nome/cidade).
function sanitize(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .slice(0, max);
}

export interface PixParams {
  key: string;        // chave PIX (e-mail, CPF, telefone, aleatória)
  amount: number;     // valor em BRL
  receiverName: string;
  city: string;
  txid?: string;      // identificador do pedido (opcional, máx 25, sem espaços)
}

export function buildPixPayload({ key, amount, receiverName, city, txid = '***' }: PixParams): string {
  const merchantAccount = emv('00', 'br.gov.bcb.pix') + emv('01', key.trim());
  const safeTxid = sanitize(txid, 25).replace(/\s/g, '') || '***';

  let payload =
    emv('00', '01') +                                   // formato do payload
    emv('26', merchantAccount) +                        // conta do recebedor (PIX)
    emv('52', '0000') +                                 // categoria do comerciante
    emv('53', '986') +                                  // moeda = BRL
    emv('54', amount.toFixed(2)) +                      // valor
    emv('58', 'BR') +                                   // país
    emv('59', sanitize(receiverName, 25) || 'RECEBEDOR') + // nome do recebedor
    emv('60', sanitize(city, 15) || 'CIDADE') +         // cidade
    emv('62', emv('05', safeTxid));                     // dados adicionais (txid)

  payload += '6304';                                    // ID + tamanho do CRC
  return payload + crc16(payload);
}
