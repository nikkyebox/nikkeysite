# NikkeyBox — Servidor de Impressão Térmica

Mini-servidor Node.js que recebe pedidos do site e imprime ESC/POS na impressora térmica de rede.

## Requisitos

- Node.js 18+ instalado
- Impressora térmica com IP fixo na rede local (porta 9100)

## 1. Configurar

Edite `config.js`:

```js
printerIp:    '192.168.11.100', // IP fixo da impressora
printerPort:  9100,              // porta padrão da maioria das térmicas
paperColumns: 48,                // 32 para papel 58mm · 48 para papel 80mm
authToken:    'troque-por-token-secreto',
```

O mesmo `authToken` deve ser configurado no painel admin do site em **Ferramentas → Impressora Térmica**.

## 2. Instalar dependências

```bash
cd thermal-print-server
npm install
```

## 3. Testar manualmente

```bash
node server.js
# → [NikkeyBox Print Server] Rodando em http://localhost:3210
```

## 4. Instalar como serviço (inicia com o PC)

**Linux/Ubuntu (systemd):**
```bash
sudo node install-service.js
```

Verifica o status:
```bash
sudo systemctl status nikkey-box-print
sudo journalctl -u nikkey-box-print -f   # logs ao vivo
```

Para parar/reiniciar:
```bash
sudo systemctl stop nikkey-box-print
sudo systemctl restart nikkey-box-print
```

## Testar impressão via curl

```bash
curl -X POST http://localhost:3210/print \
  -H "Content-Type: application/json" \
  -H "x-print-token: nikkey-box-print-token-2024" \
  -d '{
    "orderNumber": "SE-BR-999",
    "status": "pending",
    "paymentMethod": "pix",
    "customerEmail": "teste@email.com",
    "shippingAddress": {
      "name": "João Silva",
      "phone": "11999999999",
      "postalCode": "01310-100",
      "prefecture": "SP",
      "city": "São Paulo",
      "address": "Av. Paulista, 1000"
    },
    "items": [{"productName": "Kit Shampoo", "size": "P", "quantity": 1, "price": 50}],
    "totalPrice": 124
  }'
```

## Descobrir o IP da impressora na rede

```bash
# Escaneia a rede local procurando a porta 9100
nmap -p 9100 192.168.11.0/24
```
