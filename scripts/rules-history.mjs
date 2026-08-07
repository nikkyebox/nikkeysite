#!/usr/bin/env node
/**
 * Histórico e rollback do ruleset do Firestore.
 *
 * Existe porque `firebase deploy --only firestore:rules` publica o
 * `firestore.rules` INTEIRO, e este projeto roda de propósito um ruleset
 * cirúrgico (ver o cabeçalho do `firestore.rules`). Um deploy por engano
 * derruba a abordagem incremental e pode quebrar telas do cliente.
 *
 * O estrago é reversível: o Firebase guarda todo ruleset já publicado, com o
 * fonte completo. Reverter é apontar o release `cloud.firestore` de volta para
 * um ruleset antigo — não é preciso ter o arquivo, o servidor já tem.
 *
 * Uso:
 *   node scripts/rules-history.mjs list                 lista os rulesets, o mais novo primeiro
 *   node scripts/rules-history.mjs show <rulesetId>     imprime o fonte de um ruleset
 *   node scripts/rules-history.mjs save <rulesetId> <arquivo>
 *   node scripts/rules-history.mjs current              qual ruleset está no ar
 *   node scripts/rules-history.mjs rollback <rulesetId> republica um ruleset antigo
 *
 * Precisa de `serviceAccountKey.json` na raiz (mesmo arquivo que os outros
 * scripts usam) e da role de Firebase Rules Admin nessa conta de serviço.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import process from 'node:process';

const conta = JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'));
const PROJETO = conta.project_id;
// A API distingue as duas coisas e devolve 400 se forem trocadas: a URL leva
// host e versão, o *nome do recurso* dentro do corpo não.
const RECURSO = `projects/${PROJETO}`;
const BASE = `https://firebaserules.googleapis.com/v1/${RECURSO}`;
// O release do Firestore tem nome fixo; o do Storage é `firebase.storage/<bucket>`.
const RELEASE_NOME = `${RECURSO}/releases/cloud.firestore`;
const RELEASE = `${BASE}/releases/cloud.firestore`;

// firebase-admin v14: `cert` sai de `firebase-admin/app`, não de
// `admin.credential.cert` — foi o que quebrou o `publish-rules.cjs` original.
const credencial = initializeApp({ credential: cert(conta) }).options.credential;

async function token() {
  return (await credencial.getAccessToken()).access_token;
}

async function api(caminho, init = {}) {
  const resposta = await fetch(caminho.startsWith('http') ? caminho : `${BASE}${caminho}`, {
    ...init,
    headers: {
      authorization: `Bearer ${await token()}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(`${resposta.status} ${resposta.statusText} — ${JSON.stringify(corpo)}`);
  }
  return corpo;
}

/** Só o id curto: a API devolve o caminho completo `projects/x/rulesets/y`. */
function idCurto(nome) {
  return String(nome || '').split('/').pop();
}

async function listar() {
  const { rulesets = [] } = await api('/rulesets?pageSize=50');
  const atual = idCurto((await api(RELEASE)).rulesetName);
  console.log(`Projeto: ${PROJETO}\n`);
  for (const ruleset of rulesets) {
    const id = idCurto(ruleset.name);
    const marca = id === atual ? ' ← NO AR' : '';
    console.log(`${ruleset.createTime}  ${id}${marca}`);
  }
  console.log(`\n${rulesets.length} ruleset(s). Ver o fonte: node scripts/rules-history.mjs show <id>`);
}

async function fonte(id) {
  const { source } = await api(`/rulesets/${id}`);
  // Um ruleset pode ter mais de um arquivo; na prática o Firestore usa um só.
  return (source?.files || []).map((arquivo) => arquivo.content).join('\n');
}

async function atual() {
  const release = await api(RELEASE);
  console.log(`No ar: ${idCurto(release.rulesetName)}`);
  console.log(`Publicado em: ${release.updateTime}`);
}

async function rollback(id) {
  await api(`/rulesets/${id}`); // 404 aqui é melhor que um release apontando para o nada
  await api(RELEASE, {
    method: 'PATCH',
    body: JSON.stringify({ release: { name: RELEASE_NOME, rulesetName: `${RECURSO}/rulesets/${id}` } }),
  });
  console.log(`Revertido: o release cloud.firestore agora aponta para ${id}.`);
  console.log('Confira com: node scripts/rules-history.mjs current');
}

/**
 * Publica um arquivo de regras e move o release para ele.
 *
 * Preferível a `firebase deploy --only firestore:rules` por dois motivos: não
 * encosta em Storage nem em índices, e imprime o id do ruleset ANTERIOR antes
 * de trocar — que é exatamente o que se precisa para desfazer.
 */
async function publicar(caminho) {
  const conteudo = readFileSync(caminho, 'utf8');
  const anterior = idCurto((await api(RELEASE)).rulesetName);
  console.log(`Ruleset atual (guarde este id para desfazer): ${anterior}\n`);

  const criado = await api('/rulesets', {
    method: 'POST',
    body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: conteudo }] } }),
  });
  const novo = idCurto(criado.name);
  await api(RELEASE, {
    method: 'PATCH',
    body: JSON.stringify({ release: { name: RELEASE_NOME, rulesetName: `${RECURSO}/rulesets/${novo}` } }),
  });
  console.log(`Publicado ${novo} (de ${caminho}).`);
  console.log(`Desfazer: node scripts/rules-history.mjs rollback ${anterior}`);
}

/**
 * O que um `firebase deploy --only firestore:rules` mudaria agora. É a
 * pergunta que importa antes de publicar: o arquivo do repo tem blocos que
 * nunca subiram, e o deploy sobe todos de uma vez.
 */
async function diferenca() {
  const noAr = (await fonte(idCurto((await api(RELEASE)).rulesetName))).split('\n');
  const noRepo = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').split('\n');
  const soNoAr = noAr.filter((linha) => linha.trim() && !noRepo.includes(linha));
  const soNoRepo = noRepo.filter((linha) => linha.trim() && !noAr.includes(linha));
  console.log(`no ar: ${noAr.length} linhas · firestore.rules: ${noRepo.length} linhas\n`);
  console.log(`--- só no ar (${soNoAr.length} linhas — o deploy REMOVE) ---`);
  for (const linha of soNoAr) console.log(`- ${linha}`);
  console.log(`\n+++ só no repo (${soNoRepo.length} linhas — o deploy ADICIONA) +++`);
  for (const linha of soNoRepo) console.log(`+ ${linha}`);
}

const [comando, argumento, destino] = process.argv.slice(2);

try {
  if (comando === 'list') await listar();
  else if (comando === 'current') await atual();
  else if (comando === 'show') console.log(await fonte(argumento));
  else if (comando === 'save') {
    writeFileSync(destino, await fonte(argumento), 'utf8');
    console.log(`Fonte do ruleset ${argumento} salvo em ${destino}.`);
  } else if (comando === 'rollback') await rollback(argumento);
  else if (comando === 'diff') await diferenca();
  else if (comando === 'publish') await publicar(argumento || 'firestore.rules');
  else {
    console.error('Uso: list | current | diff | show <id> | save <id> <arquivo> | publish [arquivo] | rollback <id>');
    process.exitCode = 1;
  }
} catch (erro) {
  console.error(`Falhou: ${erro.message}`);
  process.exitCode = 1;
}
