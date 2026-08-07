// Testa SÓ o login SMTP, sem enviar mensagem: `verify()` abre a conexão,
// autentica e fecha. Serve para separar "credencial recusada" de "destinatário
// recusado" quando o envio para de funcionar.
//
//   node scripts/testar-smtp.mjs                 → usa SMTP_USER ou o padrão
//   node scripts/testar-smtp.mjs conta@dominio   → testa esse login
//
// A senha vem de NOREPLY_EMAIL_PASSWORD (ou GMAIL_APP_PASSWORD) do .env.
// Nada é impresso da senha.
import { readFileSync } from 'node:fs';
import nodemailer from 'nodemailer';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const valor = (chave) => (env.match(new RegExp(`^${chave}=(.*)$`, 'm')) || [])[1]?.trim() || '';

const pass = valor('NOREPLY_EMAIL_PASSWORD') || valor('GMAIL_APP_PASSWORD');
const user = process.argv[2] || valor('SMTP_USER') || 'noreply@nikkeybox-store.com';

if (!pass) {
  console.error('Sem NOREPLY_EMAIL_PASSWORD/GMAIL_APP_PASSWORD no .env');
  process.exit(1);
}

console.log(`login: ${user} | senha: ${pass.length} chars`);
const transporte = nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass },
});

try {
  await transporte.verify();
  console.log('RESULTADO: login aceito pelo smtp.gmail.com');
} catch (erro) {
  console.log('RESULTADO: login RECUSADO');
  console.log('  code:', erro.code, '| responseCode:', erro.responseCode);
  console.log('  resposta:', String(erro.response || erro.message).split('\n')[0]);
}
