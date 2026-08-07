#!/usr/bin/env node
/**
 * Trava do `firebase deploy --only firestore:rules`.
 *
 * O deploy publica o `firestore.rules` inteiro sem dizer o que muda e sem
 * deixar à mão o id do ruleset anterior — que é o que se precisa para desfazer.
 * Este hook roda como `predeploy` e obriga uma confirmação explícita.
 *
 * Liberar de propósito:
 *   RULES_DEPLOY_OK=1 firebase deploy --only firestore:rules
 *
 * O caminho recomendado continua sendo o script, que mostra o diff antes e
 * imprime o comando de rollback depois:
 *   node scripts/rules-history.mjs diff
 *   node scripts/rules-history.mjs publish
 */
import process from 'node:process';

if (process.env.RULES_DEPLOY_OK === '1') {
  console.log('[guard-rules] RULES_DEPLOY_OK=1 — seguindo com o deploy.');
  process.exit(0);
}

console.error(`
[guard-rules] Deploy de regras bloqueado.

  Este comando publica o firestore.rules INTEIRO. Antes de soltar, veja o que
  muda em produção:

      node scripts/rules-history.mjs diff

  Publicar pelo script (mostra o id anterior, para desfazer):

      node scripts/rules-history.mjs publish

  Se ainda assim quiser o deploy do firebase-tools:

      RULES_DEPLOY_OK=1 firebase deploy --only firestore:rules

  Deu errado? Nada se perde — o Firebase guarda todo ruleset publicado:

      node scripts/rules-history.mjs list
      node scripts/rules-history.mjs rollback <id-anterior>
`);
process.exit(1);
