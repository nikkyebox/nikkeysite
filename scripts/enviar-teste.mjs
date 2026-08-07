// Envia UMA mensagem real pelo mesmo caminho da produção (`api/_lib/mailer.js`),
// para conferir remetente, From visível e entrega depois de mexer em SMTP_USER
// ou na App Password.
//
//   node scripts/enviar-teste.mjs destino@exemplo.com
//
// Carrega o .env manualmente (Vercel injeta em produção; aqui não há runtime).
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
for (const linha of env.split(/\r?\n/)) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const destino = process.argv[2];
if (!destino) {
  console.error('Informe o destinatário.');
  process.exit(1);
}

const { sendMail, MAIL_FROM, MAIL_REPLY_TO } = await import('../api/_lib/mailer.js');

console.log(`login: ${process.env.SMTP_USER || MAIL_FROM} | From: ${MAIL_FROM} | Reply-To: ${MAIL_REPLY_TO}`);

const agora = new Date().toISOString();
try {
  const r = await sendMail({
    to: destino,
    subject: `Teste de envio da loja — ${agora}`,
    html: `<p>Mensagem de teste do <strong>NikkeyBox</strong>.</p>
<p>Se você está lendo isso, o SMTP autenticou e entregou.</p>
<p>Confira no cabeçalho: o remetente precisa aparecer como <code>${MAIL_FROM}</code>.</p>
<p>Enviado em ${agora}.</p>`,
  });
  console.log('ENVIADO:', JSON.stringify(r));
} catch (erro) {
  console.log('FALHOU:', erro?.code || erro?.message, '| statusCode:', erro?.statusCode ?? '-');
  console.log('  detalhe:', String(erro?.response || erro?.message || '').split('\n')[0]);
  process.exitCode = 1;
}
