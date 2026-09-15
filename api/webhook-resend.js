/**
 * Resend Webhook Handler
 * 
 * Processes incoming webhook events from Resend email service.
 * Events: email.sent, email.bounced, email.opened, email.clicked, email.complained, email.delivered
 * 
 * Endpoint: POST /api/webhook-resend
 * Authentication: Webhook signing secret (RESEND_WEBHOOK_SECRET)
 */

import crypto from 'crypto';

/**
 * Verify webhook signature using HMAC-SHA256
 * Resend signing secret format: whsec_xxxxx (base64 encoded key after 'whsec_' prefix)
 */
function verifyWebhookSignature(req) {
  const signature = req.headers.get('svix-signature');
  const timestamp = req.headers.get('svix-timestamp');
  
  if (!signature || !timestamp) {
    console.warn('Missing signature or timestamp headers');
    return false;
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET not configured');
    return false;
  }

  try {
    // Extract the base64 key from the secret (after 'whsec_' prefix)
    const base64Key = secret.replace('whsec_', '');
    const secretKey = Buffer.from(base64Key, 'base64');

    // Create signed content from timestamp and body
    const body = req.body ? JSON.stringify(req.body) : '';
    const signedContent = `${timestamp}.${body}`;

    // Compute HMAC-SHA256 signature
    const computedSignature = crypto
      .createHmac('sha256', secretKey)
      .update(signedContent)
      .digest('base64');

    // Compare signatures
    const expectedSignature = `v1,${computedSignature}`;
    return signature === expectedSignature;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Handle email.sent event
 * Called when email is successfully sent to Resend
 */
async function handleEmailSent(event) {
  console.log('✉️ Email sent:', {
    messageId: event.data.email_id,
    to: event.data.email_address,
    timestamp: event.created_at,
  });

  // TODO: Update email status in database
  // await updateEmailStatus(event.data.email_id, 'sent');

  // Optional: Send analytics to logging service
  // await logToAnalytics('email_sent', event.data);
}

/**
 * Handle email.delivered event
 * Called when email is successfully delivered to recipient's mail server
 */
async function handleEmailDelivered(event) {
  console.log('📬 Email delivered:', {
    messageId: event.data.email_id,
    to: event.data.email_address,
    timestamp: event.created_at,
  });

  // TODO: Update email status in database
  // await updateEmailStatus(event.data.email_id, 'delivered');
}

/**
 * Handle email.bounced event
 * Called when email bounces (soft bounce - temporary or hard bounce - permanent)
 */
async function handleEmailBounced(event) {
  const bounceType = event.data.bounce_type || 'unknown';
  
  console.error('❌ Email bounced:', {
    messageId: event.data.email_id,
    to: event.data.email_address,
    bounceType: bounceType,
    timestamp: event.created_at,
  });

  // TODO: Handle bounce logic
  if (bounceType === 'hard_bounce') {
    // Remove from mailing list or mark invalid
    // await markEmailAsInvalid(event.data.email_address);
  } else if (bounceType === 'soft_bounce') {
    // Retry later or log for investigation
    // await retryEmailDelivery(event.data.email_id);
  }

  // Optional: Send alert to support
  // await notifySupport('Email bounced', event.data);
}

/**
 * Handle email.complained event
 * Called when recipient marks email as spam
 */
async function handleEmailComplained(event) {
  console.error('🚨 Email complaint received:', {
    messageId: event.data.email_id,
    to: event.data.email_address,
    timestamp: event.created_at,
  });

  // TODO: Handle complaint logic
  // - Unsubscribe user from mailing list
  // - Investigate email content for spam triggers
  // - Alert support team
  // await unsubscribeUser(event.data.email_address);
  // await logComplaint(event.data);
}

/**
 * Handle email.opened event
 * Called when recipient opens email (requires open tracking enabled)
 */
async function handleEmailOpened(event) {
  console.log('👀 Email opened:', {
    messageId: event.data.email_id,
    to: event.data.email_address,
    openedAt: event.created_at,
  });

  // TODO: Track email opens for analytics
  // await trackEmailOpen(event.data.email_id);
  // await updateOpenRate(event.data);
}

/**
 * Handle email.clicked event
 * Called when recipient clicks a link in email (requires click tracking enabled)
 */
async function handleEmailClicked(event) {
  console.log('🔗 Email link clicked:', {
    messageId: event.data.email_id,
    to: event.data.email_address,
    clickedAt: event.created_at,
  });

  // TODO: Track email clicks for analytics and user behavior
  // await trackEmailClick(event.data.email_id);
  // await trackUserAction(event.data.email_address);
}

/**
 * Main webhook handler
 */
export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    console.warn(`❌ Invalid method: ${req.method}`);
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Verify webhook signature in production
  if (process.env.NODE_ENV === 'production') {
    if (!verifyWebhookSignature(req)) {
      console.error('❌ Webhook signature verification failed');
      return res.status(401).json({ error: 'Unauthorized - Invalid signature' });
    }
  }

  try {
    const event = req.body;

    if (!event || !event.type) {
      console.error('❌ Invalid webhook payload - missing event type');
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    console.log(`\n📨 Resend Webhook: ${event.type}`);
    console.log('---');

    // Route event to appropriate handler
    switch (event.type) {
      case 'email.sent':
        await handleEmailSent(event);
        break;

      case 'email.delivered':
        await handleEmailDelivered(event);
        break;

      case 'email.bounced':
        await handleEmailBounced(event);
        break;

      case 'email.complained':
        await handleEmailComplained(event);
        break;

      case 'email.opened':
        await handleEmailOpened(event);
        break;

      case 'email.clicked':
        await handleEmailClicked(event);
        break;

      default:
        console.warn(`⚠️ Unknown event type: ${event.type}`);
    }

    // Always return 200 to acknowledge webhook receipt
    // Resend requires a 2xx response to stop retrying
    return res.status(200).json({
      received: true,
      eventType: event.type,
      messageId: event.data?.email_id,
    });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    
    // Return 200 anyway to prevent retry loops
    // Log the error for manual investigation
    return res.status(200).json({
      received: true,
      error: error.message,
    });
  }
}
