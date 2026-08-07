// Cotação ¥ → BRL/EUR/USD para o cliente, com a MESMA cadeia usada no servidor
// para calcular pedidos (api/_lib/fx.js): Wise → open.er-api → fallback fixo.
//
// Antes este arquivo falava com a Wise por conta própria e devolvia 502 quando
// ela recusava. A Wise fechou o endpoint público `api.wise.com/v1/rates`: ele
// responde 401 mesmo sem token (o token sempre foi opcional aqui). Resultado:
// toda visita fazia uma requisição condenada, esperava o 502 e só então caía
// no open.er-api — com o console cheio de erro.
//
// Devolve `source` para que o cliente aplique o cushion certo: a taxa da Wise
// já bate com o app (0%), as demais precisam de +4% pela defasagem diária.
// Se a Wise voltar a funcionar, isto se corrige sozinho — sem mudar código.
import { getFxRates } from '../_lib/fx.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'public, max-age=600');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const rates = await getFxRates();
  return res.json({
    JPY_BRL: rates.BRL,
    JPY_EUR: rates.EUR,
    JPY_USD: rates.USD,
    source: rates.source,
    ts: rates.loadedAt,
  });
}
