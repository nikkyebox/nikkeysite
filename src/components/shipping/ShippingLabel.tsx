import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Package, Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShippingLabelProps {
  orderNumber: string;
  sender: {
    name: string;
    postalCode: string;
    address: string;
    phone: string;
  };
  recipient: {
    name: string;
    postalCode: string;
    prefecture: string;
    city: string;
    address: string;
    building?: string;
    phone: string;
  };
  carrier: string;
  deliveryTime?: string;
}

const ShippingLabel: React.FC<ShippingLabelProps> = ({
  orderNumber,
  sender,
  recipient,
  carrier,
  deliveryTime
}) => {
  const labelRef = useRef<HTMLDivElement>(null);

  // Format shipping data for QR code (standard format used by Japanese carriers)
  const qrData = JSON.stringify({
    orderNumber,
    recipientName: recipient.name,
    recipientPostal: recipient.postalCode,
    recipientAddress: `${recipient.prefecture} ${recipient.city} ${recipient.address} ${recipient.building || ''}`.trim(),
    recipientPhone: recipient.phone,
    senderName: sender.name,
    senderPostal: sender.postalCode,
    senderAddress: sender.address,
    senderPhone: sender.phone,
    carrier,
    deliveryTime: deliveryTime || 'Qualquer horário'
  });

  const escapeHtml = (value: string) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const handlePrint = () => {
    const printContent = labelRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Etiqueta de Envio - ${escapeHtml(orderNumber)}</title>
          <style>
            @media print {
              @page {
                size: A5;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 20px;
              }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
            }
            .label-container {
              max-width: 148mm;
              border: 2px solid #000;
              padding: 15px;
            }
            .section {
              margin-bottom: 15px;
              padding-bottom: 15px;
              border-bottom: 1px solid #ccc;
            }
            .section:last-child {
              border-bottom: none;
            }
            .section-title {
              font-weight: bold;
              font-size: 14px;
              margin-bottom: 8px;
              background: #f0f0f0;
              padding: 5px 10px;
            }
            .address-box {
              border: 1px solid #000;
              padding: 10px;
              margin: 5px 0;
            }
            .postal-code {
              font-size: 24px;
              font-weight: bold;
              letter-spacing: 3px;
              margin-bottom: 5px;
            }
            .name {
              font-size: 18px;
              font-weight: bold;
              margin-bottom: 5px;
            }
            .address {
              font-size: 14px;
              line-height: 1.6;
            }
            .phone {
              font-size: 14px;
              margin-top: 5px;
            }
            .qr-section {
              text-align: center;
              margin-top: 10px;
            }
            .order-number {
              font-size: 16px;
              font-weight: bold;
              text-align: center;
              padding: 10px;
              background: #000;
              color: #fff;
              margin-bottom: 10px;
            }
            .carrier-logo {
              text-align: center;
              font-size: 20px;
              font-weight: bold;
              margin-bottom: 10px;
              padding: 10px;
              background: #f8f8f8;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            td {
              padding: 5px;
              vertical-align: top;
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const getCarrierInfo = (carrierName: string) => {
    if (carrierName.includes('Japan Post') || carrierName.includes('ゆうパック')) {
      return { name: '📮 Japan Post (ゆうパック)', logo: '📮' };
    } else if (carrierName.includes('Yamato') || carrierName.includes('クロネコ')) {
      return { name: '🐱 Yamato Transport (クロネコヤマト)', logo: '🐱' };
    } else if (carrierName.includes('Sagawa') || carrierName.includes('佐川')) {
      return { name: '📦 Sagawa Express (佐川急便)', logo: '📦' };
    }
    return { name: carrierName, logo: '📦' };
  };

  const carrierInfo = getCarrierInfo(carrier);

  return (
    <div className="space-y-4">
      {/* Print Controls */}
      <div className="flex gap-3 print:hidden">
        <Button onClick={handlePrint} className="flex items-center gap-2">
          <Printer className="w-4 h-4" />
          Imprimir Etiqueta
        </Button>
      </div>

      {/* Shipping Label */}
      <div ref={labelRef} className="label-container bg-white border-2 border-gray-800 p-6 max-w-[148mm]">
        {/* Order Number Header */}
        <div className="order-number">
          Pedido: {orderNumber}
        </div>

        {/* Carrier Logo */}
        <div className="carrier-logo">
          {carrierInfo.logo} {carrierInfo.name}
        </div>

        {/* Recipient (TO) Section */}
        <div className="section">
          <div className="section-title">📍 DESTINATÁRIO (お届け先)</div>
          <div className="address-box">
            <div className="postal-code">〒 {recipient.postalCode}</div>
            <div className="name">{recipient.name} 様</div>
            <div className="address">
              {recipient.prefecture} {recipient.city}<br />
              {recipient.address}
              {recipient.building && (
                <>
                  <br />
                  {recipient.building}
                </>
              )}
            </div>
            <div className="phone">📞 {recipient.phone}</div>
          </div>
          {deliveryTime && (
            <div style={{ marginTop: '10px', padding: '5px', background: '#fff3cd', border: '1px solid #ffc107' }}>
              <strong>⏰ Horário Preferido:</strong> {
                deliveryTime === 'morning' ? '9:00-12:00' :
                deliveryTime === 'afternoon' ? '12:00-17:00' :
                deliveryTime === 'evening' ? '17:00-20:00' :
                'Qualquer horário'
              }
            </div>
          )}
        </div>

        {/* Sender (FROM) Section */}
        <div className="section">
          <div className="section-title">📤 REMETENTE (ご依頼主)</div>
          <div className="address-box">
            <div className="postal-code">〒 {sender.postalCode}</div>
            <div className="name">{sender.name}</div>
            <div className="address">{sender.address}</div>
            <div className="phone">📞 {sender.phone}</div>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="qr-section">
          <div style={{ marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>
            QRコード (Código de Rastreamento)
          </div>
          <div style={{ display: 'inline-block', padding: '10px', background: 'white', border: '2px solid #000' }}>
            <QRCodeSVG
              value={qrData}
              size={150}
              level="H"
              includeMargin={false}
            />
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
            Escaneie este código na transportadora
          </div>
        </div>

        {/* Instructions */}
        <div style={{ marginTop: '15px', padding: '10px', background: '#f8f9fa', fontSize: '11px', borderRadius: '5px' }}>
          <strong>Instruções:</strong>
          <ul style={{ margin: '5px 0 0 0', paddingLeft: '20px' }}>
            <li>Cole esta etiqueta na caixa de forma visível</li>
            <li>Apresente o QR code ao atendente da transportadora</li>
            <li>Guarde o número do pedido para rastreamento</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ShippingLabel;
