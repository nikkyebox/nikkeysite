/**
 * NikkeyBox — Servidor de WhatsApp
 *
 * Roda no PC do operador. Mantém uma sessão do WhatsApp Web autenticada
 * (escaneia o QR UMA vez — a sessão fica salva em .wwebjs_auth/ e é reusada
 * em todas as próximas vezes, sem pedir QR de novo).
 *
 * O painel admin do site chama este servidor para enviar mensagens
 * automáticas ao cliente quando o status do pedido muda.
 *
 * Iniciar:  npm install && npm start
 *
 * ⚠️ AVISO: whatsapp-web.js usa o WhatsApp Web de forma não-oficial.
 * Use um número dedicado da loja — há risco (baixo, mas real) de bloqueio
 * pelo WhatsApp se enviar spam. Envie só mensagens transacionais (status do pedido).
 */

const express = require('express');
const cors = require('cors');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const config = require('./config');

const app = express();
app.use(cors({ origin: config.allowedOrigins }));
app.use(express.json());

// ─── Estado do cliente WhatsApp ───────────────────────────────────────────────

let isReady = false;
let lastQr = null; // string do QR (para mostrar no painel admin)

const client = new Client({
  // LocalAuth persiste a sessão em disco → escaneia o QR só uma vez
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  lastQr = qr;
  isReady = false;
  console.log('\n[WhatsApp] Escaneie o QR code abaixo com o WhatsApp da LOJA:');
  console.log('(WhatsApp → Aparelhos conectados → Conectar um aparelho)\n');
  qrcodeTerminal.generate(qr, { small: true });
  console.log(`\nOu acesse http://localhost:${config.serverPort}/qr para ver o QR no navegador.\n`);
});

client.on('authenticated', () => {
  console.log('[WhatsApp] Autenticado! Salvando sessão...');
  lastQr = null;
});

client.on('ready', () => {
  isReady = true;
  lastQr = null;
  console.log('[WhatsApp] ✅ Pronto! Conectado e aguardando mensagens.');
});

client.on('disconnected', (reason) => {
  isReady = false;
  console.log('[WhatsApp] Desconectado:', reason);
});

client.on('auth_failure', (msg) => {
  isReady = false;
  console.error('[WhatsApp] Falha de autenticação:', msg);
});

client.initialize();

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Normaliza um telefone para o formato do WhatsApp: "5511999999999@c.us"
function normalizePhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, ''); // só dígitos
  if (!digits) return null;
  // Remove zeros à esquerda
  digits = digits.replace(/^0+/, '');
  // Se não tem DDI (número curto), prefixa com o país padrão (Brasil 55)
  // Heurística: BR tem 12-13 dígitos com DDI (55 + DDD + número).
  if (digits.length <= 11) {
    digits = config.defaultCountryCode + digits;
  }
  return `${digits}@c.us`;
}

function auth(req, res, next) {
  const token = req.headers['x-wa-token'];
  if (token !== config.authToken) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  next();
}

// ─── Endpoints ──────────────────────────────────────────────────────────────────

// Health/status — o site usa para saber se está online e conectado
app.get('/health', auth, (req, res) => {
  res.json({ ok: true, ready: isReady, hasQr: !!lastQr, version: '1.0.0' });
});

// QR code em PNG (para parear pelo navegador, sem olhar o terminal)
app.get('/qr', async (req, res) => {
  if (isReady) {
    return res.send('<h2>✅ WhatsApp já conectado!</h2><p>Pode fechar esta aba.</p>');
  }
  if (!lastQr) {
    return res.send('<h2>Aguardando QR...</h2><p>Recarregue em alguns segundos.</p><script>setTimeout(()=>location.reload(),3000)</script>');
  }
  try {
    const dataUrl = await qrcode.toDataURL(lastQr, { width: 320 });
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>Escaneie com o WhatsApp da loja</h2>
        <p>WhatsApp → Aparelhos conectados → Conectar um aparelho</p>
        <img src="${dataUrl}" alt="QR" />
        <p style="color:#888">A página recarrega sozinha após conectar.</p>
        <script>setTimeout(()=>location.reload(),8000)</script>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('Erro ao gerar QR: ' + e.message);
  }
});

// Envio de mensagem
app.post('/send-message', auth, async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp não conectado. Escaneie o QR primeiro.' });
  }

  const { phone, message } = req.body || {};
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone e message são obrigatórios' });
  }

  const chatId = normalizePhone(phone);
  if (!chatId) {
    return res.status(400).json({ error: 'Telefone inválido' });
  }

  try {
    // Confere se o número tem WhatsApp antes de enviar
    const numberId = await client.getNumberId(chatId.replace('@c.us', ''));
    if (!numberId) {
      return res.status(404).json({ error: 'Este número não tem WhatsApp' });
    }
    await client.sendMessage(numberId._serialized, message);
    console.log(`[WhatsApp] ✉️  Mensagem enviada para ${phone}`);
    res.json({ ok: true, sentTo: phone });
  } catch (err) {
    console.error('[WhatsApp] Erro ao enviar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(config.serverPort, () => {
  console.log(`[NikkeyBox WhatsApp Server] Rodando em http://localhost:${config.serverPort}`);
  console.log('[NikkeyBox WhatsApp Server] Aguardando inicialização do WhatsApp Web...');
});
