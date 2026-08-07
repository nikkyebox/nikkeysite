# Auditoria de bugs, melhorias técnicas e melhorias visuais

**Projeto:** NikkeyBox / `temu_shop`  
**Data:** 23/07/2026  
**Escopo:** frontend React/Vite, APIs serverless, regras do Firestore, internacionalização, pagamentos, estoque, promoção, dependências e experiência visual.

## Status (atualizado)

Todos os itens de prioridade crítica, alta e média deste documento foram implementados e verificados (build, `tsc --noEmit`, ESLint direcionado e suíte de testes focados passando). Além disso:

- Todos os traços da marca anterior ("Sweet Japan Treats" / "Doce de Leite Artesanal") foram removidos do ERP, do serviço de WhatsApp, dos scripts de tunnel, de imagens órfãs em `public/products/` e de chaves de tradução mortas.
- O endereço oficial (Fukuyama-shi, Hiroshima-ken) substituiu toda referência a Mie-ken/Iga-shi, com fonte única em `shared/company-profile.json`.
- Uma referência residual "サクラエクスプレス" (nome de marca anterior em japonês) foi corrigida para "NikkeyBox" em 4 chaves de tradução.
- Um teste automatizado (`src/data/translations.test.ts`) agora garante paridade de chaves entre os três idiomas e ausência de valores vazios/auto-referenciados — a verificação recomendada em MAINT-02.
- Um bug crítico encontrado durante a verificação final foi corrigido: o login do super-admin dependia de uma função serverless (`/api/admin-session`) que fica inalcançável em `vite dev` puro, travando o acesso ao próprio painel. Ver "Correção aplicada: login do super-admin dependia de função serverless inalcançável".

Itens marcados **[INFERÊNCIA]** permanecem como dedução do código; evidências sem essa marca foram observadas diretamente.

## Regra original desta auditoria (histórico)

- A auditoria nasceu com a regra de propor apenas recomendações, sem aplicar. Essa regra foi posteriormente superada por instrução explícita do usuário para aplicar todo o backlog.

## Correção autorizada aplicada no hero

A home renderiza `CinematicHeroShelfTransition`, que usa `CinematicHeroShelf`; o componente antigo `HeroCarousel`/`PromoCarouselSection` não está montado na home atual.

### Resultado

| Seleção regional | Exibição no hero | Convenção usada |
|---|---|---|
| Brasil | `R$ valor (¥ valor)` | Igual aos cards de produtos |
| Países da zona do euro | `€ valor (¥ valor)` | Igual aos cards de produtos |
| Outras regiões configuradas | `$ valor (¥ valor)` | Igual aos cards de produtos |
| Japão | `¥ valor` | Comportamento já usado pelos produtos no mercado doméstico |

Todos os seis produtos do hero foram verificados nas três moedas internacionais. Exemplos observados no primeiro item:

- Brasil: `R$ 47 (¥ 1,480)`
- Portugal: `€ 8 (¥ 1,450)`
- Estados Unidos: `$ 9.00 (¥ 1,450)`
- Japão: `¥ 1,440`

O hero agora reage imediatamente ao idioma escolhido:

- Português: títulos, descrições, CTAs, instruções e rótulo acessível em português.
- Inglês: títulos, descrições, CTAs, instruções e rótulo acessível em inglês.
- Japonês: títulos, descrições, CTAs, instruções e rótulo acessível em japonês; o subtítulo japonês duplicado é ocultado nesse idioma.

Arquivos alterados:

- `src/components/home/CinematicHeroShelf.tsx`
- `src/data/translations.ts`

## Correção aplicada: login do super-admin dependia de função serverless inalcançável

**Sintoma:** login do super-admin (`dracko2007@gmail.com`) parava de funcionar sempre que a API serverless não estava acessível (ex.: `vite dev` puro, sem `vercel dev` — proxy `/api/*` responde `ECONNREFUSED`).

**Causa raiz:** `adminService.authenticate()` enviava toda autenticação de admin — inclusive a do super-admin — para `POST /api/admin-session`, uma função serverless. Sem essa função rodando, o super-admin ficava travado fora do próprio painel.

**Correção:**

- `src/services/adminService.ts`: o super-admin agora autentica direto contra o Identity Toolkit do Firebase (`identitytoolkit.googleapis.com/v1/accounts:signInWithPassword`, REST pública, com a `firebaseConfig.apiKey` já embutida no bundle do client) — sem chamar nenhuma função serverless. `POST /api/admin-session` continua existindo, mas exclusivamente para sub-admins (usuário/senha migrados para conta Firebase Auth real).
- `src/context/UserContext.tsx`: `login()` agora aceita sessão de admin com ou sem `customToken` — usa `signInWithCustomToken` quando vem da API (sub-admin) e `signInWithEmailAndPassword` quando o super-admin já validou a senha direto no Identity Toolkit.
- `api/_lib/auth.js`: `requireAdmin()` ganhou o mesmo fallback de bootstrap por e-mail verificado que já existe em `firestore.rules`, então as rotas server-side que exigem admin (`decrement-stock`, `admin-users`, etc.) reconhecem o super-admin mesmo sem uma custom claim pré-configurada.
- `api/admin-session.js`: removido o branch de super-admin (agora redundante e inalcançável pelo client) — o endpoint ficou exclusivamente para sub-admins, com comentário explicando o porquê.

**Verificação:** `npx tsc --noEmit` limpo; `npx eslint` limpo nos arquivos tocados; suíte `api/admin-session.test.js` reescrita (7 testes cobrindo sub-admin já migrado, sub-admin legado com migração automática, credenciais inválidas e guarda de impersonação) e suíte completa (`npx vitest run`, 55/55) passando; `npx vite build` sem erros. Testado ao vivo no navegador contra `vite dev` isolado (sem `vercel dev`): o login do super-admin agora chama `identitytoolkit.googleapis.com` diretamente (confirmado via inspeção de rede) e **zero** requisições a `/api/admin-session` — a chamada anterior que travava em `ECONNREFUSED` não ocorre mais nesse fluxo.

Arquivos alterados:

- `src/services/adminService.ts`
- `src/context/UserContext.tsx`
- `api/_lib/auth.js`
- `api/admin-session.js`
- `api/admin-session.test.js`

## Prioridade crítica

### SEC-01 — Endpoint público pode alterar estoque com credenciais administrativas

**Evidência:** `api/decrement-stock.js` aceita `productId` e `qty`, usa CORS `*`, não valida usuário, pedido ou pagamento e autentica internamente com `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Depois grava `stock.quantity` e `salesCount` com privilégios de administrador.

**Risco [INFERÊNCIA]:** qualquer cliente que descubra o endpoint pode reduzir o estoque de qualquer produto e aumentar artificialmente a contagem de vendas. Repetições simultâneas também podem levar o estoque abaixo de zero.

**Correção futura recomendada:** retirar esse endpoint do fluxo público; baixar estoque somente após confirmação server-side do pagamento, usando transação idempotente vinculada a um pedido real. Preferir Firebase Admin SDK/service account, nunca login por senha de administrador.

**Critério de aceite:** requisições sem evento de pagamento válido retornam `401/403`; repetir o mesmo evento não reduz o estoque duas vezes; estoque nunca fica negativo.

### PAY-01 — Stripe confia no valor enviado pelo navegador

**Evidência:** `api/create-payment-intent.js` recebe `amount`, `currency` e `orderId` do body e cria o PaymentIntent sem consultar o pedido ou recalcular itens/preços no servidor. O comentário afirma que o valor é recalculado, mas a implementação apenas valida o mínimo da moeda. Em `StripeCardForm`/`OrderReview`, o cliente trata o PaymentIntent como suficiente para finalizar.

**Risco [INFERÊNCIA]:** um usuário pode alterar a requisição e gerar um PaymentIntent de valor menor associado ao número de um pedido de valor maior.

**Problema adicional observado:** `pendingOrder.status` é alterado para `Pago` no cliente, mas o objeto persistido no Firestore é criado explicitamente com `status: 'pending'`. O painel pode continuar mostrando como pendente um pagamento confirmado pelo Stripe.

**Correção futura recomendada:** criar o pedido no servidor, recalcular o total usando preços autoritativos, criar o PaymentIntent a partir desse pedido e promover o status exclusivamente por webhook Stripe validado e idempotente.

**Critério de aceite:** o navegador não escolhe o valor cobrado; webhook confirma `amount`, `currency` e `orderId`; o pedido pago aparece como pago no Firestore; reenvio do webhook não duplica efeitos.

### PUSH-01 — API de push não exige autenticação administrativa

**Evidência:** `api/send-push.js` aceita até 500 e-mails, título, mensagem, URL e imagem sem validar token ou papel de administrador. O servidor consulta as inscrições e envia notificações com as chaves VAPID.

**Risco [INFERÊNCIA]:** envio de spam, phishing ou mensagens ofensivas em nome da NikkeyBox para clientes inscritos, além de consumo de recursos.

**Correção futura recomendada:** exigir Firebase ID token com custom claim/admin document, limitar taxa de forma persistente, determinar destinatários no servidor e registrar auditoria de campanha.

### PROMO-01 — Limites e estoque promocional não são autoritativos

**Evidência:** o limite por pessoa é armazenado em `localStorage` (`promo_bought_*`) e pode ser apagado pelo navegador. `OrderReview` tenta incrementar `siteContent/homePromotion.soldCount` diretamente pelo cliente, mas `firestore.rules` permite escrita em `siteContent` somente para administrador; o erro é capturado silenciosamente.

**Risco [INFERÊNCIA]:** o limite individual pode ser contornado e a quantidade global vendida pode não avançar para clientes comuns, permitindo venda além do lote promocional.

**Correção futura recomendada:** reservar/consumir promoção em transação server-side ligada ao pedido e a uma identidade persistente; nunca usar `localStorage` como controle de negócio. Definir política explícita para visitante anônimo.

### DATA-01 — Endereço e centro logístico divergem entre Mie, Hiroshima e Tóquio [RESOLVIDO]

**Evidência observada (histórica):**

- `CN23Modal` e dados postais usavam `Iga-shi, Mie-ken`, CEP `518-0225`.
- várias páginas, traduções, checkout e e-mails afirmavam que o centro fica em Hiroshima;
- alguns textos mencionavam despacho internacional por Tóquio;
- traduções japonesas ainda citavam um centro em Mie enquanto tags da mesma seção diziam Hiroshima.

**Risco [INFERÊNCIA]:** documentos alfandegários, cálculo de frete, dados legais, SEO e comunicação ao cliente podiam usar origens contraditórias.

**Correção aplicada:** endereço oficial confirmado como `257-18 Shimoyamamori, Ekiya-cho, Fukuyama-shi, Hiroshima-ken 720-1143, Japan`. Criada fonte única `shared/company-profile.json`, consumida por `shared/company-profile.js` (frontend/API), `src/config/companyProfile.ts` (tipos) e `erp/app.py` (Python). Todas as referências a `Mie-ken`/`Iga-shi`/`Kirigaoka`/`518-0225` foram removidas do código (frontend, ERP, romanização de endereços).

## Prioridade alta

### RULES-01 — Regras do Firestore permitem dados críticos definidos pelo cliente

Pontos observados em `firestore.rules`:

- criação de pedido guest exige poucos campos, mas não recalcula total, preço, moeda ou itens;
- `coupon_usage` permite criação por qualquer usuário autenticado sem amarrar `userId` ao token;
- `cpf_index` permite escrita por qualquer usuário autenticado, inclusive anônimo;
- `affiliate_pending` aceita dados de comissão enviados pelo cliente sem validar pedido/cupom;
- coleções de analytics permitem `create/update` público;
- solicitações públicas e newsletter têm validação mínima e nenhum limite de taxa na regra.

**Risco [INFERÊNCIA]:** fraude de totais/comissões/cupons, corrupção do índice antifraude, métricas manipuladas e spam.

**Correção futura recomendada:** mover mutações financeiras e antifraude para Cloud Functions/API com Admin SDK; endurecer schema, ownership e campos imutáveis nas regras; avaliar Firebase App Check e rate limiting.

### MAIL-01 — Envio de e-mail permite conteúdo arbitrário sem autorização de admin

**Evidência:** `api/send-email.js` valida se o destinatário é cliente, dono de pedido ou usuário, mas o tipo `promo` aceita `subject` e HTML enviados pelo cliente sem autenticação administrativa. Não há rate limit persistente.

**Risco [INFERÊNCIA]:** um atacante com e-mails conhecidos pode enviar conteúdo de marketing/phishing com a identidade visual da loja; fluxos de boas-vindas/2FA também podem ser usados para mail bombing.

**Correção futura recomendada:** exigir token admin para promoções, manter templates no servidor, validar payloads por schema e aplicar limites por usuário/IP/destinatário.

### STOCK-02 — Estoque é baixado antes da confirmação real em pagamentos manuais

**Evidência:** `OrderReview` chama `/api/decrement-stock` quando o usuário finaliza o pedido. Para PIX, Wise, PayPay e depósito, o próprio usuário apenas clica em “já realizei o pagamento”; não existe confirmação bancária antes da baixa.

**Risco [INFERÊNCIA]:** pedidos pendentes, abandonados ou falsos podem consumir estoque disponível.

**Correção futura recomendada:** reservar com expiração ou baixar somente quando o admin/provedor confirmar o pagamento.

### DEPS-01 — Dependências de produção com vulnerabilidades conhecidas

`npm audit --omit=dev` encontrou **23 vulnerabilidades**: **1 crítica, 10 altas e 12 moderadas**. Entre os pacotes afetados estão `websocket-driver`, React Router/@remix-run/router, `@grpc/grpc-js`, `nodemailer`, `undici`/Firebase, `lodash`, `glob`, `minimatch`, `postcss`, `protobufjs` e `yaml`.

**Correção futura recomendada:** atualizar em uma branch dedicada, começando por patches sem breaking change; atualizar Nodemailer e Firebase com testes de e-mail/auth/Firestore; revisar redirects após atualizar React Router. Não executar `npm audit fix --force` sem validar as mudanças.

### RECOVERY-01 — Cron de recuperação falha aberto se o segredo não existir

**Evidência:** `api/cart-recovery.js` só compara `Authorization` quando `CRON_SECRET` está definido. Uma implantação sem essa variável deixa o endpoint executável sem segredo.

**Correção futura recomendada:** falhar com `503` quando o segredo estiver ausente e `401` quando estiver incorreto.

## Prioridade média

### I18N-01 — Internacionalização incompleta fora do hero

Com japonês selecionado, a auditoria visual encontrou conteúdo em português/inglês em vários pontos:

- “itens”, “Mais Vistos”, “Ofertas”, newsletter e seção de instalação na home;
- `CountrySwitcher`: busca, toast e detalhes fixos em português;
- página de rastreamento em português;
- assistente usa somente bifurcação português/inglês em vários textos; para japonês aparece “Try KimiClaw!”.

**Correção futura recomendada:** mover todos os textos visíveis, toasts, placeholders e `aria-labels` para o dicionário; adicionar uma verificação automática que falha quando a chave retorna o próprio nome.

### CURRENCY-01 — Fallback monetário contraditório

**Evidência:** `worldCountries.ts` define o fallback universal como USD, mas `getCurrencyByCountry` retorna BRL quando o país não é encontrado.

**Risco [INFERÊNCIA]:** preferências antigas ou países ainda não cadastrados podem exibir real em vez de dólar.

**Correção futura recomendada:** usar `FALLBACK_CONFIG.currency` e cobrir país desconhecido em teste.

### MEDIA-01 — Miniaturas quebradas no Vlog

A navegação real em `/vlog` retornou `404` para:

- `https://img.youtube.com/vi/1xN5_p-lU0Y/hqdefault.jpg`
- `https://img.youtube.com/vi/S7R97sV1w8k/hqdefault.jpg`

**Correção futura recomendada:** corrigir IDs, usar thumbnail local ou mostrar placeholder com proporção fixa e texto alternativo.

### DEV-01 — `npm run dev` não serve as APIs da Vercel

A navegação local gerou `500` em `/api/wise-rate` em todas as rotas testadas, pois o Vite isolado não emula as funções serverless.

**Correção futura recomendada:** adicionar um script de desenvolvimento integrado com `vercel dev`, proxy local ou mock explícito. Manter o fallback de câmbio visível em modo de desenvolvimento.

## Qualidade, manutenção e performance

### QA-01 — Lint global não é uma barreira utilizável

`npm run lint` encontrou **325 problemas: 286 erros e 39 avisos**. Parte vem de arquivos históricos/auxiliares ignorados pelo Git, porque `eslint.config.js` ignora apenas `dist`; outra parte está em código ativo e inclui `any`, efeitos com dependências ausentes, blocos vazios e erros reais.

Plano futuro:

1. alinhar os ignores do ESLint com artefatos, backups e scripts fora do frontend;
2. separar lint de frontend, APIs e scripts;
3. corrigir primeiro hooks e erros no fluxo de pedido/pagamento;
4. tornar lint obrigatório no CI somente depois de zerar o baseline.

Os dois arquivos alterados nesta tarefa passam no ESLint direcionado.

### QA-02 — Typecheck possui erros e não faz parte do build padrão

`npx tsc -b --pretty false` encontrou cinco erros preexistentes em:

- `PromotionManager.tsx`;
- `AffiliateManager.tsx`;
- `CouponManager.tsx`;
- `Affiliate.tsx`.

O script `build` executa apenas `vite build`, portanto pode gerar produção mesmo com erros de TypeScript.

**Correção futura recomendada:** corrigir o baseline e criar `check` com `tsc -b`, lint e testes antes do build/deploy.

### QA-03 — Cobertura automatizada insuficiente para fluxos financeiros

Existem três arquivos de teste e seis testes. Um teste é apenas `expect(true).toBe(true)` e outro verifica somente se o App renderiza. Não há testes para:

- cálculo de total e moeda;
- criação/confirmação Stripe;
- estoque e idempotência;
- regras Firestore;
- cupons, CPF, afiliados e promoções;
- troca de idioma/região.

Priorizar testes de contrato para os fluxos acima e testes no Firebase Emulator Suite para as regras.

### PERF-01 — Consulta de pedidos sem paginação

`firebaseSyncService.getAllOrdersFromFirestore` contém um TODO explícito para paginação acima de aproximadamente 500 pedidos e atualmente lê toda a coleção.

**Risco [INFERÊNCIA]:** custo crescente de reads, painel mais lento e maior uso de memória.

### PERF-02 — Chunks e precache grandes

O build de produção concluiu, mas avisou sobre chunks acima de 500 kB:

- `firebase-*.js`: 744,94 kB minificado;
- `index-*.js`: 491,23 kB minificado;
- PWA: 215 entradas e aproximadamente 16,6 MiB no precache.

Também há um aviso de que `adminAuth.ts` é importado de forma estática e dinâmica, impedindo o isolamento em chunk separado.

**Correção futura recomendada:** retirar código administrativo do bundle público, separar serviços Firebase por rota, revisar o que realmente precisa de precache e não precachear vídeos/imagens pesadas.

### MAINT-01 — Dados do hero duplicam o catálogo

Os seis itens e preços em iene do hero são editoriais e estáticos. Mesmo com a exibição regional corrigida, podem divergir do preço/estoque/nome real do catálogo.

**Correção futura recomendada:** guardar apenas IDs e conteúdo editorial no hero e obter preço/estoque da mesma fonte tipada dos cards, com fallback explícito para indisponibilidade.

### MAINT-02 — Dicionário monolítico e chaves sem tipagem

`translations.ts` concentra três idiomas em um arquivo muito grande; `t(key)` aceita qualquer string e devolve a própria chave quando ela não existe. Isso deixa textos faltantes chegarem à produção silenciosamente.

**Correção futura recomendada:** separar namespaces, gerar o tipo de chaves a partir do idioma-base e validar paridade entre idiomas no CI.

### MAINT-03 — Preferências não sincronizam entre abas abertas

`LanguageContext` lê o storage na montagem, mas não escuta o evento `storage`. Uma aba pode continuar mostrando idioma/região antigos após a alteração em outra aba.

## Melhorias visuais e de UX

### UX-01 — O hero domina a rolagem da página

Medições reais em desktop:

- spacer do hero: aproximadamente `10.921 px`;
- altura total da home: aproximadamente `14.326 px`.

Cerca de três quartos do percurso vertical ficam dedicados aos oito painéis horizontais. O botão “Pular” ajuda, mas a experiência ainda funciona como scroll hijacking.

**Melhoria futura:** reduzir a distância por painel, permitir avanço por roda/teclado com snapping previsível e manter o conteúdo seguinte visível mais cedo.

### UX-02 — Muito espaço vazio abaixo do hero no celular

No viewport de 390 × 844, o hero pinado usa cerca de 53dvh e deixa uma grande área vazia abaixo do painel durante o percurso. A home medida chegou a aproximadamente `8.174 px` de altura.

**Melhoria futura recomendada:** no mobile, desativar o pin horizontal e usar carrossel por swipe/scroll-snap, ou elevar a área útil para 75–85dvh e reduzir o percurso. Preservar `prefers-reduced-motion`, que já é tratado pelo componente.

### UX-03 — Hierarquia acima da dobra compete por atenção

Faixa promocional, cabeçalho, vídeo cinematográfico, contador, botão de pular e assistente flutuante aparecem juntos. O CTA principal desaparece durante parte da vinheta.

**Melhoria futura:** manter um único objetivo primário acima da dobra, reduzir elementos simultâneos e mostrar um CTA persistente após poucos segundos.

### UX-04 — Faixa promocional móvel fica cortada

Em 390 px, os textos da faixa superior ultrapassam a largura visível e aparecem truncados.

**Melhoria futura:** transformar em carrossel/marquee acessível com pausa, reduzir a quantidade de mensagens ou alternar uma mensagem por vez.

### UX-05 — Assistente flutuante sobrepõe conteúdo e carece de rótulos

No mobile, o botão e o balão do KimiClaw ocupam uma área grande no canto inferior direito. O navegador identificou o botão principal e o botão de fechar sem nome acessível; o código confirma ausência de `aria-label`.

**Melhoria futura:** adicionar nomes acessíveis, respeitar `env(safe-area-inset-bottom)`, reduzir/ocultar o balão depois da primeira exposição e evitar sobreposição de CTAs.

### UX-06 — Seletores de país e idioma não expõem estado acessível

Os botões não possuem `aria-expanded`, `aria-haspopup`, papéis de menu/listbox ou navegação completa por teclado.

**Melhoria futura:** usar o Select/Popover acessível já presente no projeto ou implementar o padrão ARIA completo com Escape, setas, foco e retorno de foco.

### UX-07 — Estados de carregamento parecem vazios

Na navegação real, `/promocao` ficou sem texto enquanto carregava e `/produtos` mostrou inicialmente zero resultados antes de chegar a 265 itens.

**Melhoria futura:** skeletons com dimensões estáveis, `role="status"`, mensagem traduzida e distinção clara entre “carregando” e “nenhum resultado”.

### UX-08 — Densidade do cabeçalho desktop

Busca, categoria, país, idioma, conta, carrinho e muitos links disputam uma única faixa. Em larguras intermediárias a leitura fica apertada mesmo sem overflow horizontal.

**Melhoria futura:** manter no primeiro nível apenas Produtos, Ofertas, Frete e Como Funciona; agrupar rotas institucionais/serviços em “Mais”.

## Roteiro sugerido para aplicação futura

### Fase 1 — Segurança e dinheiro

1. Corrigir Stripe com pedido autoritativo e webhook.
2. Fechar `decrement-stock`, `send-push`, `send-email` promocional e cron.
3. Mover estoque, comissão, cupom, CPF e promoção para transações server-side.
4. Criar testes de idempotência e de tentativa de fraude.

### Fase 2 — Integridade de dados

1. Confirmar endereço/hub oficial e centralizar a configuração.
2. Endurecer regras Firestore e testar no emulador.
3. Corrigir status de pagamento e reserva/baixa de estoque.
4. Implementar paginação de pedidos.

### Fase 3 — Base de qualidade

1. Atualizar dependências vulneráveis.
2. Corrigir os cinco erros de TypeScript.
3. Limpar o escopo do ESLint e zerar o código ativo.
4. Criar pipeline `check` obrigatório.

### Fase 4 — Internacionalização e acessibilidade

1. Eliminar textos hardcoded restantes.
2. Tipar e validar traduções.
3. Corrigir seletores e botões sem nome.
4. Testar teclado, leitor de tela e preferências entre abas.

### Fase 5 — Experiência visual e performance

1. Redesenhar o comportamento do hero no mobile.
2. Reduzir o percurso de rolagem no desktop.
3. Simplificar cabeçalho/faixa promocional/assistente.
4. Reduzir bundle Firebase e precache PWA.
5. Corrigir thumbnails e estados de carregamento.

## Evidências de verificação

- Navegação real em desktop e mobile com Chromium.
- Rotas públicas verificadas: `/`, `/produtos`, `/ofertas`, `/frete`, `/como-funciona`, `/sobre`, `/vlog`, `/faca-seu-pedido`, `/empresas`, `/rastrear` e `/promocao`.
- Hero verificado em português, inglês e japonês.
- Todos os seis preços do hero verificados em BRL, EUR e USD, sempre acompanhados da referência em iene; JPY verificado no Japão.
- `npx eslint src/components/home/CinematicHeroShelf.tsx src/data/translations.ts`: passou.
- `npm test`: 3 arquivos e 6 testes passaram.
- `npm run build` com heap limitado: concluiu; 2.738 módulos transformados; avisos de chunk documentados acima.
- `npx tsc -b --pretty false`: falhou por cinco erros preexistentes e não relacionados à correção do hero.
- `npm run lint`: falhou por 325 problemas preexistentes.
- `npm audit --omit=dev`: encontrou 23 vulnerabilidades, sem aplicar atualização automática.
