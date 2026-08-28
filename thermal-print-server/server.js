/**
 * NikkeyBox — Servidor de Impressão Térmica
 *
 * Roda no PC conectado à impressora.
 * Recebe pedidos via HTTP POST do site e imprime ESC/POS na térmica de rede.
 *
 * Iniciar:  node server.js
 * Serviço:  node install-service.js  (Windows) | pm2 start server.js (Linux/Mac)
 */

const express = require('express');
const cors = require('cors');
const escpos = require('escpos');
escpos.Network = require('escpos-network');

const config = require('./config');

const app = express();

app.use(cors({ origin: config.allowedOrigins }));
app.use(express.json());

// Autenticação simples por token no header
function auth(req, res, next) {
  const token = req.headers['x-print-token'];
  if (token !== config.authToken) {
    return res.status(401).json({ error: 'Token inválido' });
  }
  next();
}

// Health-check — o site usa para detectar se o servidor está online
app.get('/health', auth, (req, res) => {
  res.json({ ok: true, version: '1.0.0' });
});

// Endpoint principal de impressão
app.post('/print', auth, async (req, res) => {
  const order = req.body;

  if (!order || !order.orderNumber) {
    return res.status(400).json({ error: 'Dados do pedido inválidos' });
  }

  try {
    await printOrder(order);
    res.json({ ok: true, printed: order.orderNumber });
  } catch (err) {
    console.error('[print] Erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Geração ESC/POS ────────────────────────────────────────────────────────

const COLS = config.paperColumns;

function line(char = '-') {
  return char.repeat(COLS);
}

function center(text) {
  const pad = Math.max(0, Math.floor((COLS - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function cols2(left, right) {
  const maxLeft = COLS - right.length - 1;
  const l = left.length > maxLeft ? left.slice(0, maxLeft - 1) + '…' : left;
  const spaces = COLS - l.length - right.length;
  return l + ' '.repeat(Math.max(1, spaces)) + right;
}

const STATUS_PT = {
  pending:    'Pendente',
  processing: 'Pagamento Confirmado',
  packing:    'Preparando Pacote',
  shipped:    'Enviado',
  delivered:  'Entregue',
  cancelled:  'Cancelado',
};

const PAYMENT_PT = {
  pix:    'PIX',
  card:   'Cartao de Credito',
  boleto: 'Boleto Bancario',
  wise:   'Wise (Transferencia)',
  paypal: 'PayPal',
  yucho:  'Banco Yucho',
};

function printOrder(order) {
  return new Promise((resolve, reject) => {
    const device = new escpos.Network(config.printerIp, config.printerPort);
    const printer = new escpos.Printer(device);

    const date = new Date(order.orderDate || order.date || Date.now());
    const dateStr = date.toLocaleString('pt-BR');

    const itemsSubtotal = (order.items || []).reduce(
      (s, i) => s + (i.price || 0) * (i.quantity || 1), 0
    );
    const discount =
      order.couponDiscount ||
      (itemsSubtotal > order.totalPrice ? itemsSubtotal - order.totalPrice : 0);
    const shippingCost = order.shipping?.cost ?? null;
    const grandTotal = order.totalPrice ?? order.total ?? 0;
    const grandTotalYen = order.grandTotalYen || order.totalYen;
    const orderCurrency = order.currency || 'BRL';
    const YEN_PER_BRL_FALLBACK = 28 / 1.04;
    const shippingCostDisplay = shippingCost == null
      ? null
      : shippingCost === 0
        ? 'GRATIS'
        : orderCurrency === 'JPY'
          ? `\u00a5${Math.round(shippingCost).toLocaleString()}`
          : `R$${(shippingCost / YEN_PER_BRL_FALLBACK).toFixed(2)}`;

    device.open((err) => {
      if (err) return reject(err);

      try {
        printer
          // Cabeçalho
          .font('a')
          .align('ct')
          .style('bu')
          .size(1, 1)
          .text('JAPAN EXPRESS')
          .style('normal')
          .size(0, 0)
          .text('Importacao Direta Japao-Brasil')
          .text(line())

          // Número e data
          .align('lt')
          .text(`Pedido : ${order.orderNumber || 'N/A'}`)
          .text(`Data   : ${dateStr}`)
          .text(`Status : ${STATUS_PT[order.status] || order.status}`)
          .text(`Pagto  : ${PAYMENT_PT[order.paymentMethod] || order.paymentMethod || 'N/A'}`)
          .text(line())

          // Cliente
          .style('b')
          .text('CLIENTE')
          .style('normal')
          .text(`Nome   : ${order.shippingAddress?.name || order.customerName || 'N/A'}`)
          .text(`Email  : ${order.customerEmail || 'N/A'}`)
          .text(`Tel    : ${order.shippingAddress?.phone || order.phone || 'N/A'}`);

        if (order.cpf) {
          printer.text(`CPF    : ${order.cpf}`);
        }

        printer
          .text(line('-'))
          .style('b')
          .text('ENDERECO')
          .style('normal')
          .text(`CEP    : ${order.shippingAddress?.postalCode || 'N/A'}`)
          .text(`Estado : ${order.shippingAddress?.prefecture || 'N/A'}`)
          .text(`Cidade : ${order.shippingAddress?.city || 'N/A'}`)
          .text(`Rua    : ${order.shippingAddress?.address || 'N/A'}`);

        if (order.shippingAddress?.building) {
          printer.text(`Compl. : ${order.shippingAddress.building}`);
        }

        printer
          .text(line())
          .style('b')
          .text('ITENS')
          .style('normal');

        (order.items || []).forEach((item) => {
          const name = `${item.productName || item.name}${item.size ? ` (${item.size})` : ''}`;
          const val = `R$${(item.price * item.quantity).toFixed(2)}`;
          printer.text(cols2(`${item.quantity}x ${name}`, val));
        });

        printer.text(line('-'));

        // Subtotal
        printer.text(cols2('Subtotal', `R$${itemsSubtotal.toFixed(2)}`));

        if (discount > 0) {
          const couponLabel = order.couponCode
            ? `Cupom (${order.couponCode})`
            : 'Desconto';
          printer.text(cols2(couponLabel, `-R$${discount.toFixed(2)}`));
        }

        if (shippingCostDisplay != null) {
          const freteLabel = order.shippingCarrier
            ? `Frete (${order.shippingCarrier})`
            : 'Frete';
          printer.text(cols2(freteLabel, shippingCostDisplay));
        }

        const taxTotal =
          (order.federalTax != null && order.icmsTax != null)
            ? order.federalTax + order.icmsTax
            : order.taxAmount || 0;

        if (taxTotal > 0) {
          printer.text(cols2('Impostos (II+ICMS)', `R$${taxTotal.toFixed(2)}`));
        }

        printer
          .text(line())
          .style('bu')
          .size(0, 1)
          .text(cols2('TOTAL', `R$${grandTotal.toFixed(2)}`))
          .size(0, 0)
          .style('normal');

        if (grandTotalYen) {
          printer
            .align('ct')
            .text(`(${Number(grandTotalYen).toLocaleString()} ienes)`);
        }

        printer
          .text(line())
          .align('ct')
          .text(dateStr)
          .text('www.nikkeybox-store.com')
          .text(' ')
          // Feed e corte
          .feed(4)
          .cut()
          .close();

        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(config.serverPort, () => {
  console.log(`[NikkeyBox Print Server] Rodando em http://localhost:${config.serverPort}`);
  console.log(`[NikkeyBox Print Server] Impressora: ${config.printerIp}:${config.printerPort}`);
});
