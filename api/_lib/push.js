import webpush from 'web-push';
import { adminDb } from './firebase-admin.js';
import { HttpError } from './http.js';
import { siteOrigin } from './mailer.js';

function chunk(values, size) {
  const groups = [];
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size));
  return groups;
}

function safeUrl(value) {
  const origin = siteOrigin();
  const url = new URL(String(value || '/'), origin);
  if (url.origin !== origin) throw new HttpError(400, 'invalid_push_url');
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function sendPush({ emails, title, body, url = '/', tag = 'promo' }) {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:contato@nikkeybox-store.com';
  if (!publicKey || !privateKey) throw new HttpError(503, 'push_not_configured');
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const recipients = [...new Set(emails.map((email) => String(email).trim().toLowerCase()))];
  const db = adminDb();
  const subscriptions = [];
  for (const group of chunk(recipients, 30)) {
    const snap = await db.collection('push_subscriptions').where('customerEmail', 'in', group).get();
    snap.forEach((document) => subscriptions.push({ id: document.id, ...document.data() }));
  }

  const payload = JSON.stringify({ title, body, url: safeUrl(url), tag });
  const results = await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload);
      return { email: subscription.customerEmail, ok: true };
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await db.collection('push_subscriptions').doc(subscription.id).delete().catch(() => undefined);
      }
      return { email: subscription.customerEmail, ok: false };
    }
  }));

  const subscribed = new Set(subscriptions.map((subscription) => subscription.customerEmail));
  return {
    sent: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    withoutSubscription: recipients.filter((email) => !subscribed.has(email)),
    results,
  };
}
