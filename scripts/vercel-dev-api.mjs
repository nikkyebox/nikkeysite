// Serve as funções de `api/` dentro do próprio `vite dev`, sem `vercel dev`.
//
// Reproduz o que a Vercel faz em produção para os casos usados pelo projeto:
//   - reescritas de `vercel.json` (ex.: /api/admin-session → /api/admin?action=session);
//   - `req.query`, `req.body` (JSON e form-urlencoded) e `res.status().json()`;
//   - `config.api.bodyParser = false` respeitado (webhook do Stripe lê o corpo cru);
//   - variáveis de `.env`, `.env.local` e `.env.<mode>` disponíveis em `process.env`.
// Os handlers são carregados com `server.ssrLoadModule`, então mudanças em `api/`
// e em `api/_lib/` valem sem reiniciar o servidor.

import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

const isLiteralSource = (source) => !/[()[\]*+?\^$|]/.test(source);

export function loadRewrites(root) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  return (config.rewrites || []).filter((rule) => isLiteralSource(rule.source));
}

export function applyRewrite(pathname, search, rewrites) {
  const rule = rewrites.find((r) => r.source === pathname);
  if (!rule) return { pathname, search };
  const [destPath, destQuery = ''] = rule.destination.split('?');
  const merged = new URLSearchParams(destQuery);
  for (const [key, value] of new URLSearchParams(search)) merged.append(key, value);
  const qs = merged.toString();
  return { pathname: destPath, search: qs ? `?${qs}` : '' };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function parseBody(buffer, contentType) {
  if (!buffer.length) return undefined;
  const text = buffer.toString('utf8');
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  return text;
}

function shimResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    if (!res.headersSent && !res.getHeader('content-type')) {
      res.setHeader('content-type', 'application/json; charset=utf-8');
    }
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

export function vercelApiDevPlugin() {
  let root = process.cwd();
  let rewrites = [];

  return {
    name: 'vercel-api-dev',
    apply: 'serve',

    configResolved(config) {
      root = config.root;
      // Mesmo comportamento do `vercel dev`: variáveis de ambiente locais viram process.env.
      const env = loadEnv(config.mode, root, '');
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      rewrites = loadRewrites(root);
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const target = applyRewrite(url.pathname, url.search, rewrites);
        if (!target.pathname.startsWith('/api/')) return next();

        const name = target.pathname.slice('/api/'.length).replace(/\/+$/, '');
        const file = path.join(root, 'api', `${name}.js`);
        shimResponse(res);
        // Como na Vercel: rota /api inexistente é 404, não o index.html do SPA.
        if (!name || name.includes('..') || !fs.existsSync(file)) {
          return res.status(404).json({ error: 'not_found' });
        }

        try {
          const mod = await server.ssrLoadModule(file);
          const handler = mod.default;
          if (typeof handler !== 'function') {
            return res.status(500).json({ error: 'handler_not_found' });
          }

          const search = new URLSearchParams(target.search);
          req.query = Object.fromEntries(search);

          const bodyParser = mod.config?.api?.bodyParser !== false;
          if (bodyParser && !['GET', 'HEAD'].includes(req.method || 'GET')) {
            const buffer = await readBody(req);
            req.rawBody = buffer;
            req.body = parseBody(buffer, String(req.headers['content-type'] || ''));
          }

          await handler(req, res);
        } catch (error) {
          console.error(`[api-dev] ${target.pathname}:`, error);
          if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
        }
      });
    },
  };
}
