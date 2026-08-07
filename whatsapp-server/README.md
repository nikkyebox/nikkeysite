# NikkeyBox — Servidor de WhatsApp

Servidor local que envia mensagens automáticas de WhatsApp para os clientes
quando o status do pedido muda (Preparando, Enviado), usando o número da loja.

## Como funciona

- Roda no PC do operador (mesmo que processa os pedidos).
- Mantém uma sessão do WhatsApp Web autenticada — você escaneia o QR **uma vez**
  e a sessão fica salva em `.wwebjs_auth/`. Nas próximas vezes conecta sozinho,
  **sem pedir QR de novo**.
- O painel admin do site chama este servidor (`http://localhost:3220`) para enviar.

## Instalação (uma vez)

```bash
cd whatsapp-server
npm install
```

## Iniciar

```bash
npm start
```

Na **primeira vez**, um QR code aparece no terminal. Escaneie com o WhatsApp da loja:

> WhatsApp → ⋮ (menu) → **Aparelhos conectados** → **Conectar um aparelho**

Também pode abrir `http://localhost:3220/qr` no navegador para ver o QR.

Depois de conectar, aparece `✅ Pronto!` e a sessão fica salva. Pode fechar o
terminal e reabrir com `npm start` — não pede QR de novo.

## Instalar como serviço (inicia no boot automaticamente)

Execute o script de instalação **uma única vez**:

```bash
bash install-service.sh
```

Ele instala o pm2, inicia o servidor e configura o startup. No final imprime
um comando para rodar com `sudo` — copie e execute para finalizar.

### Comandos úteis

```bash
pm2 status                  # ver se está rodando
pm2 logs japan-whatsapp     # logs em tempo real
pm2 restart japan-whatsapp  # reiniciar
pm2 stop japan-whatsapp     # parar
```

## Configurar no painel admin

No site: **Admin → Configurações → WhatsApp**
- Ativar: ✅
- URL do servidor: `http://localhost:3220`
- Token: o mesmo de `config.js` (`authToken`)

## ⚠️ Aviso importante

O `whatsapp-web.js` usa o WhatsApp Web de forma **não-oficial**. Use um número
**dedicado da loja** e envie **apenas mensagens transacionais** (status de pedido).
Enviar spam pode levar ao bloqueio do número pelo WhatsApp.

## Endpoints

| Método | Rota             | Descrição                                  |
|--------|------------------|--------------------------------------------|
| GET    | `/health`        | Status (online + conectado). Requer token. |
| GET    | `/qr`            | Página com o QR code para parear.          |
| POST   | `/send-message`  | `{ phone, message }`. Requer token.        |
