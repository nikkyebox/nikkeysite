const isDev = import.meta.env.DEV;
const devLog = isDev ? console.log.bind(console) : () => {};
const devWarn = isDev ? console.warn.bind(console) : () => {};
const devError = isDev ? console.error.bind(console) : () => {};

/**
 * WhatsApp Service usando Twilio API
 * Permite envio automático de mensagens WhatsApp
 */

const TWILIO_ACCOUNT_SID = import.meta.env.VITE_TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = import.meta.env.VITE_TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_FROM = import.meta.env.VITE_TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

interface WhatsAppMessage {
  to: string;
  message: string;
}

export const whatsappService = {
  /**
   * Send WhatsApp message via Twilio API
   */
  sendMessage: async (data: WhatsAppMessage): Promise<boolean> => {
    devLog('📱 WhatsApp Service - Sending message');
    devLog('📱 To:', data.to);
    devLog('📱 Message preview:', data.message.substring(0, 100) + '...');

    // Try sending via local WhatsApp Node.js service (http://localhost:3001/api/send)
    try {
      devLog('📱 Attempting local WhatsApp service (port 3001)...');
      const cleanPhone = data.to.replace(/[^0-9]/g, '');
      const response = await fetch('http://localhost:3001/api/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: cleanPhone,
          message: data.message
        })
      });
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          devLog('✅ WhatsApp sent successfully via local service!');
          return true;
        }
      }
      devLog('⚠️ Local service failed, trying Twilio / Web fallback...');
    } catch (e) {
      devLog('⚠️ Local service not available on port 3001, trying Twilio / Web fallback...', e);
    }

    devLog('📱 From:', TWILIO_WHATSAPP_FROM);
    devLog('📱 Account SID configured:', !!TWILIO_ACCOUNT_SID, TWILIO_ACCOUNT_SID?.substring(0, 10) + '...');
    devLog('📱 Auth Token configured:', !!TWILIO_AUTH_TOKEN, TWILIO_AUTH_TOKEN?.substring(0, 5) + '...');
    
    // If no credentials, fallback to opening WhatsApp Web
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      devWarn('⚠️ Twilio credentials not configured - opening WhatsApp Web instead');
      devLog('⚠️ SID:', !!TWILIO_ACCOUNT_SID, 'Token:', !!TWILIO_AUTH_TOKEN);
      
      // Format phone number (remove non-digits and add country code)
      const phoneNumber = data.to.replace(/[^0-9+]/g, '');
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(data.message)}`;
      
      devLog('🌐 Opening WhatsApp Web:', whatsappUrl.substring(0, 50) + '...');
      window.open(whatsappUrl, '_blank');
      return false;
    }
    
    try {
      // Twilio API endpoint
      const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
      
      // Format phone number - ensure it starts with +
      const formattedTo = data.to.startsWith('+') ? data.to : `+${data.to}`;
      const whatsappTo = `whatsapp:${formattedTo}`;
      
      devLog('📤 Formatted recipient:', whatsappTo);
      devLog('📤 Twilio API URL:', url.substring(0, 60) + '...');
      
      // Prepare request body
      const body = new URLSearchParams({
        From: TWILIO_WHATSAPP_FROM,
        To: whatsappTo,
        Body: data.message
      });
      
      devLog('📤 Request body prepared');
      
      // Make API call with Basic Auth
      const authString = `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`;
      const authHeader = 'Basic ' + btoa(authString);
      
      devLog('📤 Auth header created (length:', authHeader.length, ')');
      devLog('📤 Sending request to Twilio...');
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': authHeader
        },
        body: body.toString()
      });

      devLog('📥 Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        devError('❌ Twilio API error response:', errorText);
        
        let error;
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { message: errorText };
        }
        
        devError('❌ Twilio API error details:', error);
        devError('❌ Error code:', error.code);
        devError('❌ Error message:', error.message);
        
        // Fallback to WhatsApp Web
        devLog('🔄 Falling back to WhatsApp Web...');
        const phoneNumber = data.to.replace(/[^0-9+]/g, '');
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(data.message)}`;
        window.open(whatsappUrl, '_blank');
        
        return false;
      }

      const result = await response.json();
      devLog('✅ WhatsApp sent successfully via Twilio!');
      devLog('📱 Message SID:', result.sid);
      devLog('📱 Status:', result.status);
      devLog('📱 To:', result.to);
      devLog('📱 From:', result.from);
      return true;
    } catch (error) {
      devError('❌ Error sending WhatsApp:', error);
      devError('❌ Error type:', error instanceof Error ? error.constructor.name : typeof error);
      devError('❌ Error message:', error instanceof Error ? error.message : String(error));
      
      // Fallback to WhatsApp Web
      devLog('🔄 Falling back to WhatsApp Web due to error...');
      const phoneNumber = data.to.replace(/[^0-9+]/g, '');
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(data.message)}`;
      window.open(whatsappUrl, '_blank');
      
      return false;
    }
  },

  /**
   * Send multiple WhatsApp messages
   */
  sendMultiple: async (messages: WhatsAppMessage[]): Promise<void> => {
    devLog(`📱 Sending ${messages.length} WhatsApp messages...`);
    
    for (const message of messages) {
      await whatsappService.sendMessage(message);
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};
