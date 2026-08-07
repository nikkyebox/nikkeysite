// Retorna país/cidade do visitante a partir dos headers de geolocalização do Vercel.
// HTTPS nativo, mesma origem (sem problema de CSP), funciona em todos os planos.
export default function handler(req, res) {
  const countryCode = req.headers['x-vercel-ip-country'] || '';
  const city = decodeURIComponent(req.headers['x-vercel-ip-city'] || '') || '';
  const region = req.headers['x-vercel-ip-country-region'] || '';

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    countryCode,        // ex: 'BR'
    city,               // ex: 'São Paulo'
    regionName: region, // ex: 'SP'
  });
}
