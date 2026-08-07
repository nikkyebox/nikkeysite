/**
 * 🏮 NikkeyBox - WhatsApp Automation Service
 * ====================================================
 * Servidor Node.js que conecta ao WhatsApp Web via QR Code
 * e permite enviar mensagens automáticas pelo ERP.
 * 
 * Executar: node server.js
 * API: http://localhost:3001
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// =====================================================
// STATE
// =====================================================
let qrCodeDataUrl = null;
let isReady = false;
let isConnecting = false;
let connectionInfo = null;
let messageLog = [];

// =====================================================
// WHATSAPP CLIENT
// =====================================================
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, '.wwebjs_auth')
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            '--single-process',
        ]
    }
});

// QR Code event
client.on('qr', async (qr) => {
    console.log('📱 QR Code recebido! Escaneie com o WhatsApp.');
    isConnecting = true;
    isReady = false;
    try {
        qrCodeDataUrl = await QRCode.toDataURL(qr, { 
            width: 300, 
            margin: 2,
            color: { dark: '#1a1a2e', light: '#ffffff' }
        });
    } catch (err) {
        console.error('Erro ao gerar QR:', err);
    }
});

// Ready event
client.on('ready', () => {
    console.log('✅ WhatsApp conectado com sucesso!');
    isReady = true;
    isConnecting = false;
    qrCodeDataUrl = null;
    
    // Get connection info
    const info = client.info;
    connectionInfo = {
        phone: info?.wid?.user || 'N/A',
        name: info?.pushname || 'N/A',
        platform: info?.platform || 'N/A',
        connectedAt: new Date().toISOString()
    };
    console.log('📱 Conectado como:', connectionInfo.name, '-', connectionInfo.phone);
});

// Auth failure
client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
    isReady = false;
    isConnecting = false;
});

// Disconnected
client.on('disconnected', (reason) => {
    console.log('⚠️ WhatsApp desconectado:', reason);
    isReady = false;
    isConnecting = false;
    connectionInfo = null;
});

// Log messages received (for monitoring)
client.on('message', (msg) => {
    if (!msg.fromMe) {
        console.log(`📩 Mensagem de ${msg.from}: ${msg.body.substring(0, 50)}...`);
    }
});

// =====================================================
// API ROUTES
// =====================================================

// Root route (friendly confirmation check)
app.get('/', (req, res) => {
    res.send('🏮 NikkeyBox - Servidor WhatsApp está online e rodando! 🚀');
});

// Status
app.get('/api/status', (req, res) => {
    res.json({
        isReady,
        isConnecting,
        hasQRCode: !!qrCodeDataUrl,
        connectionInfo,
        messagesSent: messageLog.length
    });
});

// QR Code
app.get('/api/qrcode', (req, res) => {
    if (isReady) {
        res.json({ status: 'connected', message: 'WhatsApp já está conectado!' });
    } else if (qrCodeDataUrl) {
        res.json({ status: 'qr_ready', qrCode: qrCodeDataUrl });
    } else if (isConnecting) {
        res.json({ status: 'connecting', message: 'Aguardando QR Code...' });
    } else {
        res.json({ status: 'disconnected', message: 'Serviço não iniciado.' });
    }
});

// Send message
app.post('/api/send', async (req, res) => {
    const { phone, message } = req.body;
    
    if (!isReady) {
        return res.status(503).json({ 
            success: false, 
            error: 'WhatsApp não está conectado. Escaneie o QR Code primeiro.' 
        });
    }
    
    if (!phone || !message) {
        return res.status(400).json({ 
            success: false, 
            error: 'Campos "phone" e "message" são obrigatórios.' 
        });
    }
    
    try {
        // Format phone number - ensure it has country code and @c.us suffix
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        
        // Add Japan country code if not present
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '81' + formattedPhone.substring(1);
        }
        if (!formattedPhone.startsWith('81') && formattedPhone.length <= 11) {
            formattedPhone = '81' + formattedPhone;
        }
        
        const chatId = formattedPhone + '@c.us';
        
        // Check if number is registered on WhatsApp
        const isRegistered = await client.isRegisteredUser(chatId);
        if (!isRegistered) {
            return res.status(404).json({
                success: false,
                error: `Número ${phone} não está registrado no WhatsApp.`
            });
        }
        
        // Send message
        const result = await client.sendMessage(chatId, message);
        
        const logEntry = {
            phone: formattedPhone,
            message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
            timestamp: new Date().toISOString(),
            status: 'sent',
            messageId: result.id?._serialized || 'N/A'
        };
        messageLog.unshift(logEntry);
        
        // Keep only last 100 messages
        if (messageLog.length > 100) messageLog = messageLog.slice(0, 100);
        
        console.log(`✅ Mensagem enviada para ${formattedPhone}`);
        
        res.json({ 
            success: true, 
            messageId: result.id?._serialized,
            phone: formattedPhone
        });
    } catch (error) {
        console.error('❌ Erro ao enviar:', error);
        
        const logEntry = {
            phone,
            message: message.substring(0, 100),
            timestamp: new Date().toISOString(),
            status: 'failed',
            error: error.message
        };
        messageLog.unshift(logEntry);
        
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Send order notification (pre-formatted)
app.post('/api/send-order-notification', async (req, res) => {
    const { phone, orderNumber, customerName, items, total, paymentMethod, type } = req.body;
    
    if (!isReady) {
        return res.status(503).json({ success: false, error: 'WhatsApp não conectado.' });
    }
    
    let message = '';
    
    if (type === 'new_order') {
        // ===== COMPRA FINALIZADA =====
        message = `🏮 *NikkeyBox*\n\n`;
        message += `Olá ${customerName}! 📦\n\n`;
        message += `Seu pedido *${orderNumber}* foi recebido com sucesso! ✅\n\n`;
        message += `📦 *Itens do pedido:*\n`;
        if (items && items.length > 0) {
            items.forEach(item => {
                const name = item.productName || item.name || 'Produto';
                const size = item.size || '';
                const qty = item.quantity || 1;
                const price = item.price ? `- ¥${Number(item.price * qty).toLocaleString()}` : '';
                message += `  • ${name} (${size}) x${qty} ${price}\n`;
            });
        }
        message += `\n💰 *Total:* ¥${Number(total).toLocaleString()}\n`;
        if (req.body.shipping) {
            message += `🚚 *Frete:* ¥${Number(req.body.shipping.cost || 0).toLocaleString()} (${req.body.shipping.carrier || 'A definir'})\n`;
        }
        message += `💳 *Pagamento:* ${paymentMethod === 'bank' ? 'Depósito Bancário' : paymentMethod === 'paypay' ? 'PayPay' : paymentMethod}\n\n`;
        if (paymentMethod === 'bank') {
            message += `🏦 *Dados para depósito:*\n`;
            message += `Banco: ゆうちょ銀行 (Japan Post Bank)\n`;
            message += `記号 (Kigou): *12260*\n`;
            message += `番号 (Bangou): *33664351*\n`;
            message += `\n📌 *振込用 (Outros bancos):*\n`;
            message += `金融機関コード: 9900\n`;
            message += `店名: 二二八店 (228)\n`;
            message += `口座番号: 3366435 (普通)\n`;
            message += `名義: ロドリゲス シオカワ ミリアン パウラ\n\n`;
        } else if (paymentMethod === 'paypay') {
            message += `📱 *PayPay:* 070-1367-1679\n\n`;
        }
        message += `⏳ *Próximos passos:*\n`;
        message += `1. Confirme o pagamento\n`;
        message += `2. Prepararemos seu pedido com carinho\n`;
        message += `3. Enviaremos o código de rastreio\n\n`;
        message += `Obrigada pela compra! 💛\n`;
        message += `_NikkeyBox_`;
        
    } else if (type === 'status_update') {
        
        if (req.body.status === 'processing') {
            // ===== PROCESSANDO =====
            message = `🏮 *NikkeyBox*\n\n`;
            message += `Olá ${customerName}! 👋\n\n`;
            message += `Ótima notícia! Seu pedido *${orderNumber}* está sendo preparado! 🔄\n\n`;
            message += `📦 Seu pedido está sendo preparado com todo cuidado.\n\n`;
            message += `⏳ Em breve você receberá o código de rastreio para acompanhar a entrega.\n\n`;
            message += `Qualquer dúvida, estamos à disposição! 😊\n`;
            message += `_NikkeyBox_`;
            
        } else if (req.body.status === 'confirmed') {
            // ===== PAGAMENTO CONFIRMADO =====
            message = `🏮 *NikkeyBox*\n\n`;
            message += `Olá ${customerName}! 👋\n\n`;
            message += `✅ *Pagamento confirmado!*\n\n`;
            message += `Seu pedido *${orderNumber}* teve o pagamento confirmado com sucesso!\n\n`;
            message += `Já vamos começar a preparar seus doces com todo carinho! 🍫✨\n\n`;
            message += `Fique de olho, em breve enviaremos atualizações!\n\n`;
            message += `Obrigada! 💛\n`;
            message += `_NikkeyBox_`;
            
        } else if (req.body.status === 'shipped') {
            // ===== ENVIADO + RASTREIO =====
            message = `🏮 *NikkeyBox*\n\n`;
            message += `Olá ${customerName}! 👋\n\n`;
            message += `🚚 *Seu pedido foi enviado!*\n\n`;
            message += `Pedido *${orderNumber}* saiu para entrega!\n\n`;
            if (req.body.trackingNumber) {
                message += `📦 *Código de rastreio:* ${req.body.trackingNumber}\n\n`;
                // Auto-detect carrier from tracking URL or provide multiple links
                if (req.body.trackingUrl) {
                    message += `🔗 *Acompanhe aqui:*\n${req.body.trackingUrl}\n\n`;
                } else {
                    message += `🔗 *Rastreie seu pedido:*\n`;
                    message += `Japan Post: https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${req.body.trackingNumber}&locale=ja\n`;
                    message += `Yamato: https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number=${req.body.trackingNumber}\n\n`;
                }
            }
            if (req.body.carrier) {
                message += `🏢 *Transportadora:* ${req.body.carrier}\n\n`;
            }
            message += `📬 Seu pedido está a caminho!\n\n`;
            message += `_NikkeyBox_`;
            
        } else if (req.body.status === 'delivered') {
            // ===== ENTREGUE + AGRADECIMENTO =====
            message = `🏮 *NikkeyBox*\n\n`;
            message += `Olá ${customerName}! 👋\n\n`;
            message += `📬 *Pedido entregue!*\n\n`;
            message += `Seu pedido *${orderNumber}* foi entregue com sucesso! 🎉\n\n`;
            message += `Esperamos que você aproveite muito seu pedido! ✨\n\n`;
            message += `💛 *Ficamos muito felizes em tê-lo(a) como cliente!*\n\n`;
            message += `Se puder, nos conte o que achou! Sua opinião é muito importante para nós. ⭐\n\n`;
            message += `🔄 Para fazer um novo pedido, acesse:\nhttps://nikkeybox-store.com\n\n`;
            message += `*Muito obrigada pela confiança!* 🙏💛\n`;
            message += `_NikkeyBox_`;
            
        } else if (req.body.status === 'cancelled') {
            // ===== CANCELADO =====
            message = `🏮 *NikkeyBox*\n\n`;
            message += `Olá ${customerName},\n\n`;
            message += `Informamos que o pedido *${orderNumber}* foi cancelado.\n\n`;
            message += `Se houver alguma dúvida ou se precisar de ajuda, estamos à disposição.\n\n`;
            message += `Esperamos vê-lo(a) novamente em breve! 💛\n`;
            message += `_NikkeyBox_`;
            
        } else {
            // ===== OUTROS STATUS =====
            const statusLabels = {
                'pending': '⏳ Aguardando',
            };
            const statusMsg = statusLabels[req.body.status] || `Status: ${req.body.status}`;
            
            message = `🏮 *NikkeyBox*\n\n`;
            message += `Olá ${customerName}!\n\n`;
            message += `Atualização do pedido *${orderNumber}*:\n`;
            message += `${statusMsg}\n\n`;
            message += `Qualquer dúvida, fale conosco!\n`;
            message += `_NikkeyBox_`;
        }
        
    } else if (type === 'birthday') {
        message = `🏮 *NikkeyBox*\n\n`;
        message += `🎂 Feliz Aniversário, ${customerName}! 🎉\n\n`;
        message += `Para comemorar, temos um presente especial para você!\n\n`;
        if (req.body.couponCode) {
            message += `🎟️ Use o cupom *${req.body.couponCode}* e ganhe desconto na sua próxima compra!\n\n`;
        }
        message += `Acesse: https://nikkeybox-store.com\n\n`;
        message += `Parabéns! 💛\n`;
        message += `_NikkeyBox_`;
        
    } else if (type === 'new_order_store') {
        // ===== NOTIFICAÇÃO PARA A LOJA (Paula) =====
        message = `🔔 *NOVO PEDIDO!*\n\n`;
        message += `📋 *Pedido:* ${orderNumber}\n`;
        message += `📅 *Data:* ${new Date().toLocaleDateString('pt-BR')}\n\n`;
        message += `👤 *Cliente:* ${customerName}\n`;
        if (req.body.customerPhone) message += `📱 *Tel:* ${req.body.customerPhone}\n`;
        if (req.body.customerEmail) message += `📧 *Email:* ${req.body.customerEmail}\n\n`;
        message += `📦 *Itens:*\n`;
        if (items && items.length > 0) {
            items.forEach(item => {
                const name = item.productName || item.name || 'Produto';
                message += `  • ${name} (${item.size || ''}) x${item.quantity || 1}\n`;
            });
        }
        message += `\n💰 *Total:* ¥${Number(total).toLocaleString()}\n`;
        message += `💳 *Pagamento:* ${paymentMethod === 'bank' ? 'Depósito Bancário' : paymentMethod === 'paypay' ? 'PayPay' : paymentMethod}\n\n`;
        if (req.body.shippingAddress) {
            const addr = req.body.shippingAddress;
            message += `📍 *Endereço:*\n`;
            message += `〒${addr.postalCode || ''}\n`;
            message += `${addr.prefecture || ''} ${addr.city || ''}\n`;
            message += `${addr.address || ''} ${addr.building || ''}\n\n`;
        }
        message += `👉 Acesse o ERP para gerenciar este pedido.`;
        
    } else {
        message = req.body.customMessage || message;
    }
    
    if (!message) {
        return res.status(400).json({ success: false, error: 'Nenhuma mensagem gerada.' });
    }
    
    // Forward to the send endpoint
    req.body.message = message;
    
    try {
        let formattedPhone = phone.replace(/[^0-9]/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '81' + formattedPhone.substring(1);
        }
        if (!formattedPhone.startsWith('81') && formattedPhone.length <= 11) {
            formattedPhone = '81' + formattedPhone;
        }
        
        const chatId = formattedPhone + '@c.us';
        const result = await client.sendMessage(chatId, message);
        
        messageLog.unshift({
            phone: formattedPhone,
            message: message.substring(0, 100) + '...',
            timestamp: new Date().toISOString(),
            status: 'sent',
            type: type || 'custom',
            messageId: result.id?._serialized
        });
        
        if (messageLog.length > 100) messageLog = messageLog.slice(0, 100);
        
        res.json({ success: true, messageId: result.id?._serialized });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Message log
app.get('/api/messages', (req, res) => {
    res.json({ messages: messageLog });
});

// Disconnect
app.post('/api/disconnect', async (req, res) => {
    try {
        await client.logout();
        isReady = false;
        isConnecting = false;
        connectionInfo = null;
        qrCodeDataUrl = null;
        res.json({ success: true, message: 'Desconectado com sucesso.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Restart (re-initialize)
app.post('/api/restart', async (req, res) => {
    try {
        if (isReady) {
            await client.destroy();
        }
        isReady = false;
        isConnecting = true;
        connectionInfo = null;
        qrCodeDataUrl = null;
        
        client.initialize();
        res.json({ success: true, message: 'Reiniciando conexão...' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =====================================================
// START SERVER
// =====================================================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`\n🏮 NikkeyBox - WhatsApp Service`);
    console.log(`📡 API rodando em: http://localhost:${PORT}`);
    console.log(`📱 Iniciando conexão WhatsApp...\n`);
    
    // Initialize WhatsApp client
    isConnecting = true;
    client.initialize();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔴 Encerrando serviço WhatsApp...');
    if (isReady) {
        await client.destroy();
    }
    process.exit(0);
});
