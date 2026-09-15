# Resend Email Service Setup - NikkeyBox

## Overview
This guide sets up Resend email service integration with webhook support for the NikkeyBox website. Emails are sent via `contato@nikkeybox.com` and tracked through Resend's webhook system.

## Prerequisites
- ✅ Resend account created (https://resend.com)
- ✅ Domain verified in Resend dashboard
- ✅ NikkeyBox deployed on Vercel
- ✅ `resend` package installed (`npm install resend`)

## Step 1: Get Your Resend API Key

### Via Vercel Marketplace (Recommended)
1. Go to https://vercel.com/marketplace/resend
2. Click "Add Integration"
3. Select your Vercel team and NikkeyBox project
4. Authorize the integration
5. The `RESEND_API_KEY` will be automatically added to your environment variables

### Manual Setup
1. Log in to https://resend.com/api-keys
2. Click "Create API Key"
3. Name it: `nikkeybox-production` (or similar)
4. Copy the key (format: `re_xxxxxxxxxxxxx`)
5. **DO NOT share or commit this key**

## Step 2: Configure Environment Variables

### Local Development
Create `.env.local` in the project root:
```env
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=contato@nikkeybox.com
```

### Vercel Production
Add to Vercel Project Settings > Environment Variables:
```
RESEND_API_KEY=re_your_production_key
RESEND_FROM_EMAIL=contato@nikkeybox.com
RESEND_WEBHOOK_SECRET=whsec_your_webhook_secret
```

## Step 3: Setup Webhook for Email Events

### Create Webhook in Resend Dashboard
1. Go to https://resend.com/webhooks
2. Click "Create Webhook"
3. Set the endpoint URL to:
   ```
   https://your-nikkeybox-domain.vercel.app/api/webhook-resend
   ```
   or if using custom domain:
   ```
   https://nikkeybox.com/api/webhook-resend
   ```
4. Select webhook events:
   - ✅ Email sent
   - ✅ Email delivered
   - ✅ Email bounced
   - ✅ Email opened
   - ✅ Email clicked

5. Copy the **Signing Secret** (format: `whsec_xxxxxxxxxxxxx`)

### Add Webhook Secret to Vercel
1. Go to your Vercel project settings
2. Add environment variable:
   - Key: `RESEND_WEBHOOK_SECRET`
   - Value: `whsec_your_signing_secret`
3. Redeploy the project

## Step 4: Verify Installation

### Check Environment Variables
```bash
# In Vercel CLI or project settings, verify:
echo $RESEND_API_KEY      # Should show re_...
echo $RESEND_FROM_EMAIL   # Should show contato@nikkeybox.com
```

### Test Webhook Locally (Optional)
```bash
# Run the test script
node test-resend-webhook.js
```

Output should show:
```
🧪 Resend Webhook Test Suite
📍 Target: http://localhost:3000/api/webhook-resend
✓ Email Sent
✓ Email Delivered
✓ Email Bounced
✓ Email Opened
✓ Email Clicked
```

## Step 5: Deploy to Vercel

```bash
# Ensure all changes are committed
git add .
git commit -m "Add Resend email integration with webhooks"

# Push to main branch (auto-deploys to Vercel)
git push origin main
```

## Usage Examples

### Sending Order Confirmation Email
```typescript
import { sendMail } from '@/api/_lib/mailer';

const emailData = {
  to: 'customer@example.com',
  subject: 'Order Confirmation #12345',
  html: `<h1>Order Confirmed</h1><p>Thank you for your purchase!</p>`,
};

const result = await sendMail(emailData);
console.log('Email sent:', result);
```

### Webhook Event Handling
The `/api/webhook-resend` endpoint automatically handles:
- `email.sent` - Log email sent
- `email.delivered` - Update delivery status
- `email.bounced` - Handle bounce/invalid email
- `email.opened` - Track engagement
- `email.clicked` - Track link clicks

## Troubleshooting

### "API Key not found" Error
**Problem**: Environment variables not loaded
**Solution**:
1. Verify `.env.local` exists with correct key
2. Restart development server: `npm run dev`
3. Check Vercel project settings for variable spelling

### "Invalid signature" on Webhook
**Problem**: Webhook signature verification failed
**Solution**:
1. Verify `RESEND_WEBHOOK_SECRET` is correct in Vercel
2. Check raw request body is used (not JSON-parsed)
3. Redeploy after updating environment variables

### Emails Not Sending
**Problem**: `sendMail()` returns error
**Solution**:
1. Check `RESEND_API_KEY` is valid: `re_...`
2. Verify sender domain is authenticated in Resend
3. Check recipient email is valid (not bounced before)
4. View Resend dashboard logs for error details

### Webhook Not Triggering
**Problem**: `/api/webhook-resend` not receiving events
**Solution**:
1. Check webhook URL is publicly accessible (HTTPS)
2. Verify URL matches exactly in Resend > Webhooks settings
3. Check endpoint returns HTTP 200 status
4. Test with `node test-resend-webhook.js`
5. Check Vercel function logs for errors

## Security Checklist

- ✅ API key stored in `.env.local` (not committed)
- ✅ Webhook secret stored in Vercel environment variables
- ✅ Webhook signature verified on every request
- ✅ Raw request body used for signature verification
- ✅ HTTP 200 returned immediately (async processing)
- ✅ Sensitive data not logged
- ✅ Rate limiting respected (Resend free tier: 100/day)

## Files Created

| File | Purpose |
|------|---------|
| `.env.example` | Template for environment variables |
| `api/webhook-resend.js` | Webhook endpoint for Resend events |
| `test-resend-webhook.js` | Local testing script |
| `vercel.json` | Vercel routing configuration (already exists) |

## API Limits & Quotas

### Free Tier
- **100 emails/day** (25/day during first 30 days)
- **5 verified recipients**
- **Email sending only** (no marketing features)
- **Webhooks**: Included

### Upgrade to Production
1. Add payment method in Resend dashboard
2. Increase domain quota
3. Add team members
4. Access priority support

## References

- Resend Docs: https://resend.com/docs
- Resend Webhooks: https://resend.com/docs/webhooks
- Vercel Integration: https://vercel.com/marketplace/resend
- GitHub Issues: Report bugs in nikkeybox repo

## Support

For issues:
1. Check this guide's troubleshooting section
2. Review Resend dashboard logs
3. Check Vercel function logs
4. Contact Resend support: https://resend.com/support

---

**Last Updated**: September 2026  
**Maintained By**: NikkeyBox Development Team
