// Cotação ¥ → BRL/EUR/USD para o cliente, com a MESMA cadeia usada no servidor
// para calcular pedidos (api/_lib/fx.js): open.er-api → fallback fixo.
//
// A Wise fechou o endpoint público `api.wise.com/v1/rates` (401 mesmo sem
// token) e, mesmo quando respondia, era inconsistente entre invocações
// serverless distintas: uma chamada de preview podia cair na Wise (cushion
// 0%) enquanto a criação do pedido, segundos depois, caía no open.er-api
// (cushion 4%) — cliente e servidor cobravam totais diferentes. Tirar a Wise
// da cadeia faz os dois lados sempre convergirem pro mesmo cushion.
//
// Devolve `source` para o cliente e o servidor aplicarem o mesmo cushion.
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
