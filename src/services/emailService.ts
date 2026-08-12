/**
 * Email Service
 * 
 * Sends order confirmation emails using Resend API
 */

import type { EmailOrderData, CartItem, ShippingLabelData } from '@/types/order';
import { productEnglishName } from '@/utils/productName';
import { authenticatedFetch } from '@/services/authenticatedFetch';
import { COMPANY_PROFILE } from '@/config/companyProfile';

const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};

// O e-mail chega no Brasil: WhatsApp precisa do DDI, senão a discagem falha.
// O PayPay é a exceção — app japonês que identifica a conta pelo número local,
// e o formato internacional simplesmente não encontra a loja.
const WHATSAPP = COMPANY_PROFILE.whatsapp.international;
const PAYPAY_ID = COMPANY_PROFILE.whatsapp.domestic;


interface EmailData {
  to: string;
  subject: string;
  html: string;
  orderNumber: string;
  customerName: string;
  trackingNumber?: string;
  shippingLabelData?: ShippingLabelData;
}


export const emailService = {
  /**
   * Send order confirmation email using Resend
   */
  sendOrderConfirmation: async (data: EmailData): Promise<boolean> => {
    devLog('📧 Email Service - Sending order confirmation email');
    devLog('📧 Order Number:', data.orderNumber);
    if (data.trackingNumber) {
      devLog('🔢 Tracking Number:', data.trackingNumber);
    }
    
    // O servidor lê o pedido real e renderiza o template; assunto/HTML do
    // navegador nunca são aceitos como conteúdo de e-mail.
    try {
      const response = await authenticatedFetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: data.trackingNumber ? 'tracking' : 'order',
          orderId: data.orderNumber,
        }),
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        devError('❌ send-email error:', response.status, errText);
        return false;
      }
      devLog('✅ Email enviado via /api/send-email (noreply)');
      return true;
    } catch (error) {
      devError('❌ Error sending email:', error);
      return false;
    }
  },

  /**
   * Generate HTML email template for order confirmation
   * Includes shipping label with QR code for store owner
   */
  generateOrderEmailHTML: (orderData: EmailOrderData, trackingNumber?: string): string => {
    const { orderNumber, formData, items, totalPrice, shipping, paymentMethod, deliveryTime } = orderData;
    
    // Generate QR code data
    const qrData = JSON.stringify({
      orderNumber,
      trackingNumber: trackingNumber || '',
      recipientName: formData.name,
      recipientPostal: formData.postalCode,
      recipientAddress: `${formData.prefecture} ${formData.city} ${formData.address} ${formData.building || ''}`.trim(),
      recipientPhone: formData.phone,
      senderName: `${COMPANY_PROFILE.contactName} / ${COMPANY_PROFILE.brand}`,
      senderPostal: COMPANY_PROFILE.fulfillmentOrigin.postalCode,
      senderAddress: COMPANY_PROFILE.fulfillmentOrigin.formatted,
      senderPhone: COMPANY_PROFILE.whatsapp.domestic,
      carrier: shipping?.carrier || '',
      deliveryTime: deliveryTime || 'Qualquer horário'
    });

    // Note: In backend, generate actual QR code image and embed as base64
    // For now, this is a placeholder that backend will replace with:
    // <img src="data:image/png;base64,{qrCodeBase64}" alt="QR Code" />
    const qrCodePlaceholder = `[QR CODE WILL BE GENERATED IN BACKEND - Data: ${qrData.substring(0, 50)}...]`;
    
    const deliveryTimeText = 
      deliveryTime === 'morning' ? '9:00-12:00 (Manhã)' :
      deliveryTime === 'afternoon' ? '12:00-17:00 (Tarde)' :
      deliveryTime === 'evening' ? '17:00-20:00 (Noite)' :
      'Qualquer horário';

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirmação de Pedido</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .header {
            background: linear-gradient(135deg, #A855F7 0%, #D8B4FE 100%);
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
          }
          .content {
            background: white;
            padding: 30px;
            border: 1px solid #ddd;
          }
          .section {
            background: #f9f9f9;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            border-left: 4px solid #A855F7;
          }
          .section h2 {
            color: #A855F7;
            margin-top: 0;
            margin-bottom: 15px;
            font-size: 18px;
          }
          .order-number {
            font-size: 24px;
            font-weight: bold;
            color: #A855F7;
            margin: 10px 0;
            text-align: center;
            padding: 15px;
            background: #fff3cd;
            border-radius: 8px;
          }
          .product-item {
            padding: 10px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
          }
          .product-item:last-child {
            border-bottom: none;
          }
          .total {
            font-size: 20px;
            font-weight: bold;
            color: #A855F7;
            text-align: right;
            margin-top: 20px;
            padding: 15px;
            background: #fff;
            border: 2px solid #A855F7;
            border-radius: 8px;
          }
          .shipping-label {
            border: 3px solid #000;
            padding: 20px;
            margin: 20px 0;
            background: white;
            page-break-inside: avoid;
          }
          .label-header {
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            background: #000;
            color: white;
            padding: 10px;
            margin: -20px -20px 20px -20px;
          }
          .label-section {
            border: 2px solid #000;
            padding: 15px;
            margin: 15px 0;
          }
          .label-section-title {
            background: #f0f0f0;
            padding: 8px;
            font-weight: bold;
            margin: -15px -15px 10px -15px;
          }
          .postal-code {
            font-size: 22px;
            font-weight: bold;
            letter-spacing: 2px;
            margin: 5px 0;
          }
          .address-line {
            margin: 5px 0;
            font-size: 15px;
          }
          .qr-section {
            text-align: center;
            padding: 20px;
            background: #f9f9f9;
            border: 2px dashed #666;
            margin: 15px 0;
          }
          .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
            background: #f9f9f9;
            border-radius: 0 0 10px 10px;
          }
          .info-box {
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 15px;
            margin: 15px 0;
          }
          @media print {
            body { background: white; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🌸 NikkeyBox</h1>
          <p>Confirmação de Pedido</p>
        </div>
        
        <div class="content">
          <div class="order-number">Pedido: ${orderNumber}</div>
          
          <div class="section">
            <h2>✅ Pedido Confirmado!</h2>
            <p>Olá ${formData.name},</p>
            <p>Obrigado pela sua compra! Seu pedido foi confirmado e está sendo preparado.</p>
            <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            ${trackingNumber ? `<p><strong>Rastreamento:</strong> <span style="font-family: monospace; font-size: 16px; background: #fff3cd; padding: 5px 10px; border-radius: 4px;">${trackingNumber}</span></p>` : ''}
          </div>

          <div class="section">
            <h2>📦 Produtos</h2>
            ${items.map((item: CartItem) => `
              <div class="product-item">
                <div>
                  <strong>${productEnglishName(item.product as any)}</strong><br>
                  <small>Tamanho: ${item.size} | Quantidade: ${item.quantity}</small>
                </div>
                <div style="text-align: right;">
                  <strong>¥${(item.product.prices[item.size] * item.quantity).toLocaleString()}</strong>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="section">
            <h2>📍 Endereço de Entrega</h2>
            <div style="padding: 10px; background: white; border: 1px solid #ddd; border-radius: 4px;">
              <strong>${formData.name}</strong><br>
              〒${formData.postalCode}<br>
              ${formData.prefecture} ${formData.city}<br>
              ${formData.address}<br>
              ${formData.building ? formData.building + '<br>' : ''}
              📞 ${formData.phone}<br>
              📧 ${formData.email}
            </div>
          </div>

          <div class="section">
            <h2>💰 Resumo do Pedido</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px;">Subtotal:</td>
                <td style="text-align: right; padding: 8px;">¥${totalPrice.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px;">Frete (${shipping?.carrier || 'N/A'}):</td>
                <td style="text-align: right; padding: 8px;">¥${shipping?.cost?.toLocaleString() || '0'}</td>
              </tr>
              <tr style="border-top: 2px solid #A855F7;">
                <td style="padding: 8px;"><strong>Total:</strong></td>
                <td style="text-align: right; padding: 8px;"><strong style="font-size: 20px; color: #A855F7;">¥${((totalPrice || 0) + (shipping?.cost || 0)).toLocaleString()}</strong></td>
              </tr>
            </table>
            <p style="margin-top: 10px;"><strong>Entrega:</strong> ${shipping?.estimatedDays || 'N/A'} dias úteis</p>
            ${deliveryTime ? `<p><strong>Horário Preferido:</strong> ${deliveryTimeText}</p>` : ''}
          </div>

          <div class="section">
            <h2>💳 Pagamento</h2>
            <p><strong>Método:</strong> ${paymentMethod === 'bank' ? 'Depósito Bancário' : 'PayPay'}</p>
            ${paymentMethod === 'bank' ? `
              <div class="info-box">
                <p><strong>Por favor, realize o depósito para:</strong></p>
                <p style="margin: 10px 0;">
                  <strong>Banco:</strong> ゆうちょ銀行 (Japan Post Bank)<br>
                  <strong>記号 (Kigou):</strong> 12260<br>
                  <strong>番号 (Bangou):</strong> 33664351<br>
                  <strong>名義:</strong> ロドリゲス シオカワ ミリアン パウラ
                </p>
                <p style="margin: 10px 0; padding: 10px; background: #f0f7ff; border-left: 3px solid #2196f3;">
                  <strong>📌 振込用 (Transferência de outros bancos):</strong><br>
                  金融機関コード: 9900<br>
                  店名: 二二八店 (228)<br>
                  口座番号: 3366435 (普通)
                </p>
                <p style="color: #856404; margin-top: 10px;">
                  ⚠️ <strong>Importante:</strong> Envie o comprovante via WhatsApp: ${WHATSAPP}
                </p>
              </div>
            ` : `
              <div class="info-box">
                <p><strong>Envie o pagamento via PayPay para:</strong></p>
                <p style="font-size: 24px; font-weight: bold; margin: 10px 0;">${PAYPAY_ID}</p>
                <p style="color: #856404;">
                  ⚠️ <strong>Importante:</strong> Após o pagamento, envie a confirmação via WhatsApp
                </p>
              </div>
            `}
          </div>

          <hr style="margin: 30px 0; border: none; border-top: 2px solid #ddd;">

          <!-- SHIPPING LABEL FOR STORE OWNER -->
          <div class="info-box no-print" style="background: #fff3cd; border-color: #ffc107;">
            <h2 style="margin-top: 0; color: #856404;">📋 Para a Loja (Paula Shiokawa)</h2>
            <p><strong>Esta seção contém a etiqueta de envio para imprimir e colar no pacote.</strong></p>
          </div>

          <div class="shipping-label">
            <div class="label-header">
              ETIQUETA DE ENVIO - Pedido ${orderNumber}
            </div>

            ${trackingNumber ? `
              <div style="text-align: center; background: #4caf50; color: white; padding: 10px; margin: 0 -20px 20px -20px;">
                <strong>Rastreamento:</strong> ${trackingNumber}
              </div>
            ` : ''}

            <div style="text-align: center; background: #f0f0f0; padding: 10px; margin-bottom: 20px; font-size: 18px; font-weight: bold;">
              ${shipping?.carrier || 'Transportadora'}
            </div>

            <!-- Recipient Section -->
            <div class="label-section">
              <div class="label-section-title">📍 DESTINATÁRIO (お届け先)</div>
              <div class="postal-code">〒 ${formData.postalCode}</div>
              <div class="address-line"><strong>${formData.name} 様</strong></div>
              <div class="address-line">${formData.prefecture} ${formData.city}</div>
              <div class="address-line">${formData.address}</div>
              ${formData.building ? `<div class="address-line">${formData.building}</div>` : ''}
              <div class="address-line">📞 ${formData.phone}</div>
              ${deliveryTime ? `
                <div style="margin-top: 10px; padding: 10px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px;">
                  <strong>⏰ Horário Preferido:</strong> ${deliveryTimeText}
                </div>
              ` : ''}
            </div>

            <!-- Sender Section -->
            <div class="label-section">
              <div class="label-section-title">📤 REMETENTE (ご依頼主)</div>
              <div class="postal-code">〒 ${COMPANY_PROFILE.fulfillmentOrigin.postalCode}</div>
              <div class="address-line"><strong>${COMPANY_PROFILE.contactName}</strong></div>
              <div class="address-line">${COMPANY_PROFILE.fulfillmentOrigin.prefecture}, ${COMPANY_PROFILE.fulfillmentOrigin.country}</div>
              <div class="address-line">${COMPANY_PROFILE.fulfillmentOrigin.formattedJa.replace(`〒${COMPANY_PROFILE.fulfillmentOrigin.postalCode} `, '')}</div>
              <div class="address-line">📞 ${COMPANY_PROFILE.whatsapp.domestic}</div>
            </div>

            <!-- QR Code Section -->
            <div class="qr-section">
              <div style="font-weight: bold; margin-bottom: 10px; font-size: 16px;">
                📱 QRコード (Código de Rastreamento)
              </div>
              <div style="display: inline-block; padding: 15px; background: white; border: 3px solid #000;">
                <div style="width: 150px; height: 150px; display: flex; align-items: center; justify-content: center; background: #f0f0f0;">
                  ${qrCodePlaceholder}
                </div>
              </div>
              <div style="margin-top: 10px; font-size: 13px; color: #666;">
                Escaneie este código na transportadora para registro automático
              </div>
            </div>

            <!-- Instructions -->
            <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border: 1px solid #2196f3; border-radius: 4px; font-size: 12px;">
              <strong style="color: #1976d2;">📋 Instruções de Envio:</strong>
              <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                <li>Imprima esta etiqueta</li>
                <li>Cole na caixa de forma visível</li>
                <li>Apresente o QR code ao atendente da transportadora</li>
                <li>Guarde o número de rastreamento: <strong>${trackingNumber || 'será gerado'}</strong></li>
              </ul>
            </div>
          </div>

          <hr style="margin: 30px 0; border: none; border-top: 2px solid #ddd;">

          <div class="section">
            <h2>📝 Próximos Passos</h2>
            <ol style="margin: 0; padding-left: 20px;">
              <li>Realize o pagamento conforme as instruções acima</li>
              <li>Envie o comprovante via WhatsApp (${WHATSAPP})</li>
              <li>Aguarde a confirmação do pagamento</li>
              <li>Seu pedido será enviado em até 2 dias úteis</li>
              <li>Você receberá o código de rastreamento por email</li>
            </ol>
          </div>
        </div>

        <div class="footer">
          <p><strong>NikkeyBox</strong> - Importados do Japão 🌸</p>
          <p>📍 Endereço Teste</p>
          <p>📞 ${WHATSAPP} | 📧 ${COMPANY_PROFILE.email}</p>
          <p style="margin-top: 15px; font-size: 12px; color: #999;">
            Se tiver dúvidas, entre em contato conosco via WhatsApp!
          </p>
        </div>
      </body>
      </html>
    `;
  },

  /**
   * Generate customer email (WITHOUT shipping label)
   */
  generateCustomerEmailHTML: (orderData: EmailOrderData, trackingNumber?: string): string => {
    const { orderNumber, formData, items, totalPrice, shipping, paymentMethod, deliveryTime } = orderData;
    
    const deliveryTimeText = 
      deliveryTime === 'morning' ? '9:00-12:00 (Manhã)' :
      deliveryTime === 'afternoon' ? '12:00-17:00 (Tarde)' :
      deliveryTime === 'evening' ? '17:00-20:00 (Noite)' :
      'Qualquer horário';

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Confirmação de Pedido</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
          .header { background: linear-gradient(135deg, #A855F7 0%, #D8B4FE 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: white; padding: 30px; border: 1px solid #ddd; }
          .section { background: #f9f9f9; padding: 20px; margin-bottom: 20px; border-radius: 8px; border-left: 4px solid #A855F7; }
          .section h2 { color: #A855F7; margin-top: 0; margin-bottom: 15px; font-size: 18px; }
          .order-number { font-size: 24px; font-weight: bold; color: #A855F7; margin: 10px 0; text-align: center; padding: 15px; background: #fff3cd; border-radius: 8px; }
          .product-item { padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; }
          .product-item:last-child { border-bottom: none; }
          .info-box { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 15px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; background: #f9f9f9; border-radius: 0 0 10px 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🌸 NikkeyBox</h1>
          <p>Confirmação de Pedido</p>
        </div>
        
        <div class="content">
          <div class="order-number">Pedido: ${orderNumber}</div>
          
          <div class="section">
            <h2>✅ Pedido Confirmado!</h2>
            <p>Olá ${formData.name},</p>
            <p>Obrigado pela sua compra! Seu pedido foi confirmado e está sendo preparado.</p>
            <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            ${trackingNumber ? `<p><strong>Rastreamento:</strong> <span style="font-family: monospace; font-size: 16px; background: #fff3cd; padding: 5px 10px; border-radius: 4px;">${trackingNumber}</span></p>` : ''}
          </div>

          <div class="section">
            <h2>📦 Produtos</h2>
            ${items.map((item: CartItem) => `
              <div class="product-item">
                <div>
                  <strong>${productEnglishName(item.product as any)}</strong><br>
                  <small>Tamanho: ${item.size} | Quantidade: ${item.quantity}</small>
                </div>
                <div style="text-align: right;">
                  <strong>¥${(item.product.prices[item.size] * item.quantity).toLocaleString()}</strong>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="section">
            <h2>📍 Endereço de Entrega</h2>
            <div style="padding: 10px; background: white; border: 1px solid #ddd; border-radius: 4px;">
              <strong>${formData.name}</strong><br>
              〒${formData.postalCode}<br>
              ${formData.prefecture} ${formData.city}<br>
              ${formData.address}<br>
              ${formData.building ? formData.building + '<br>' : ''}
              📞 ${formData.phone}
            </div>
          </div>

          <div class="section">
            <h2>💰 Resumo do Pedido</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px;">Subtotal:</td>
                <td style="text-align: right; padding: 8px;">¥${totalPrice.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px;">Frete (${shipping?.carrier || 'N/A'}):</td>
                <td style="text-align: right; padding: 8px;">¥${shipping?.cost?.toLocaleString() || '0'}</td>
              </tr>
              <tr style="border-top: 2px solid #A855F7;">
                <td style="padding: 8px;"><strong>Total:</strong></td>
                <td style="text-align: right; padding: 8px;"><strong style="font-size: 20px; color: #A855F7;">¥${((totalPrice || 0) + (shipping?.cost || 0)).toLocaleString()}</strong></td>
              </tr>
            </table>
            <p style="margin-top: 10px;"><strong>Entrega:</strong> ${shipping?.estimatedDays || 'N/A'} dias úteis</p>
            ${deliveryTime ? `<p><strong>Horário Preferido:</strong> ${deliveryTimeText}</p>` : ''}
          </div>

          <div class="section">
            <h2>💳 Pagamento</h2>
            <p><strong>Método:</strong> ${paymentMethod === 'bank' ? 'Depósito Bancário' : 'PayPay'}</p>
            ${paymentMethod === 'bank' ? `
              <div class="info-box">
                <p><strong>Por favor, realize o depósito para:</strong></p>
                <p style="margin: 10px 0;">
                  <strong>Banco:</strong> ゆうちょ銀行 (Japan Post Bank)<br>
                  <strong>記号 (Kigou):</strong> 12260<br>
                  <strong>番号 (Bangou):</strong> 33664351<br>
                  <strong>名義:</strong> ロドリゲス シオカワ ミリアン パウラ
                </p>
                <p style="margin: 10px 0; padding: 10px; background: #f0f7ff; border-left: 3px solid #2196f3;">
                  <strong>📌 振込用 (Transferência de outros bancos):</strong><br>
                  金融機関コード: 9900<br>
                  店名: 二二八店 (228)<br>
                  口座番号: 3366435 (普通)
                </p>
                <p style="color: #856404; margin-top: 10px;">
                  ⚠️ <strong>Importante:</strong> Envie o comprovante via WhatsApp: ${WHATSAPP}
                </p>
              </div>
            ` : `
              <div class="info-box">
                <p><strong>Envie o pagamento via PayPay para:</strong></p>
                <p style="font-size: 24px; font-weight: bold; margin: 10px 0;">${PAYPAY_ID}</p>
                <p style="color: #856404;">
                  ⚠️ <strong>Importante:</strong> Após o pagamento, envie a confirmação via WhatsApp
                </p>
              </div>
            `}
          </div>

          <div class="section">
            <h2>📝 Próximos Passos</h2>
            <ol style="margin: 0; padding-left: 20px;">
              <li>Realize o pagamento conforme as instruções acima</li>
              <li>Envie o comprovante via WhatsApp (${WHATSAPP})</li>
              <li>Aguarde a confirmação do pagamento</li>
              <li>Seu pedido será enviado em até 2 dias úteis</li>
              <li>Você receberá o código de rastreamento por email</li>
            </ol>
          </div>
        </div>

        <div class="footer">
          <p><strong>NikkeyBox</strong> - Importados do Japão 🌸</p>
          <p>📍 Endereço Teste</p>
          <p>📞 ${WHATSAPP} | 📧 ${COMPANY_PROFILE.email}</p>
          <p style="margin-top: 15px; font-size: 12px; color: #999;">
            Se tiver dúvidas, entre em contato conosco via WhatsApp!
          </p>
        </div>
      </body>
      </html>
    `;
  },

  /**
   * Generate store owner email (WITH shipping label)
   */
  generateStoreEmailHTML: (orderData: EmailOrderData, trackingNumber?: string): string => {
    // Reuse the original method that includes shipping label
    return emailService.generateOrderEmailHTML(orderData, trackingNumber);
  }
};


