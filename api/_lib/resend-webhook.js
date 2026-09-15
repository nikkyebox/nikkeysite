import { HttpError } from './http.js';

/**
 * Webhook signature verification for Resend
 * @param {string} payload - Raw request body
 * @param {string} signature - X-Resend-Signature header
 * @param {string} secret - RESEND_WEBHOOK_SECRET from env
 * @returns {boolean} True if signature is valid
 */
export async function verifyResendSignature(payload, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureData = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );

  const hexSignature = Array.from(new Uint8Array(signatureData))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return hexSignature === signature;
}

/**
 * Process Resend webhook events
 * Events: email.sent, email.delivered, email.bounced, email.complained, email.failed, email.clicked, email.opened
 */
export async function handleResendWebhook(event, context = {}) {
  const { type, data, createdAt } = event;

  console.log(`[Resend] Event: ${type} at ${createdAt}`);
  console.log(`[Resend] Email: ${data?.email}, MessageID: ${data?.id}`);

  switch (type) {
    case 'email.sent':
      return handleEmailSent(data, context);
    case 'email.delivered':
      return handleEmailDelivered(data, context);
    case 'email.bounced':
      return handleEmailBounced(data, context);
    case 'email.complained':
      return handleEmailComplained(data, context);
    case 'email.failed':
      return handleEmailFailed(data, context);
    case 'email.opened':
      return handleEmailOpened(data, context);
    case 'email.clicked':
      return handleEmailClicked(data, context);
    default:
      console.warn(`[Resend] Unknown event type: ${type}`);
      return { ok: true };
  }
}

/**
 * Log email sent event
 */
async function handleEmailSent(data, context) {
  console.log(`✓ Email sent to ${data?.email}`);
  // TODO: Update your database if needed
  return { ok: true };
}

/**
 * Log email delivered event
 */
async function handleEmailDelivered(data, context) {
  console.log(`✓ Email delivered to ${data?.email}`);
  // TODO: Update your database if needed
  return { ok: true };
}

/**
 * Handle email bounce - remove from mailing list
 */
async function handleEmailBounced(data, context) {
  console.error(`✗ Email bounced: ${data?.email}`);
  // TODO: Mark user as unsubscribed or flag for review
  return { ok: true };
}

/**
 * Handle spam complaint - remove from mailing list
 */
async function handleEmailComplained(data, context) {
  console.error(`✗ Email complained as spam: ${data?.email}`);
  // TODO: Mark user as unsubscribed immediately
  return { ok: true };
}

/**
 * Handle email failure
 */
async function handleEmailFailed(data, context) {
  console.error(`✗ Email failed: ${data?.email} - ${data?.error}`);
  // TODO: Retry logic or alert admin
  return { ok: true };
}

/**
 * Track email opens
 */
async function handleEmailOpened(data, context) {
  console.log(`👁️ Email opened by ${data?.email}`);
  // TODO: Log engagement metrics
  return { ok: true };
}

/**
 * Track email clicks
 */
async function handleEmailClicked(data, context) {
  console.log(`🔗 Email clicked by ${data?.email} - ${data?.url}`);
  // TODO: Log engagement metrics
  return { ok: true };
}
