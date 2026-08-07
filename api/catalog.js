import geo from './_handlers/geo.js';
import productEnrich from './_handlers/product-enrich.js';
import sitemap from './_handlers/sitemap.js';
import wiseRate from './_handlers/wise-rate.js';

const HANDLERS = {
  geo,
  'product-enrich': productEnrich,
  sitemap,
  'wise-rate': wiseRate,
};

export default async function handler(req, res) {
  const value = req.query?.action;
  const action = String(Array.isArray(value) ? value[0] : value || '');
  const selected = HANDLERS[action];
  if (!selected) return res.status(400).json({ error: 'invalid_action' });
  return selected(req, res);
}
